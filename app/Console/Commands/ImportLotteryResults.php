<?php

namespace App\Console\Commands;

use App\Models\Draw;
use App\Models\DrawResult;
use App\Models\LotteryAudit;
use App\Models\ResultSyncRun;
use App\Models\Ticket;
use App\Models\TicketLine;
use App\Services\Lottery\BoletoganadorImporter;
use App\Services\Lottery\Configuration;
use App\Services\Lottery\ResultService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class ImportLotteryResults extends Command
{
    protected $signature = 'lottery:import-results {--automatic : Ejecución del programador}';

    private array $stats = [];
    private array $ticketIds = [];
    private string $summary = '';

    protected $description = 'Importa resultados de hoy de El Boleto Ganador y confirma automáticamente los datos validados';

    public function handle(BoletoganadorImporter $parser, Configuration $config, ResultService $service): int
    {
        $lock = \Illuminate\Support\Facades\Cache::lock('lottery-results-import', 300);
        if (! $lock->get()) {
            $this->warn('Ya hay una sincronización en curso.');
            return self::FAILURE;
        }
        $run=null;
        $this->stats=['source_checked'=>false,'checked_draws'=>0,'published_results'=>0,'conflicts'=>0,'errors'=>0,'repaired_lines'=>0,'tickets_checked'=>0,'winning_tickets'=>0,'losing_tickets'=>0,'pending_tickets'=>0];
        $this->ticketIds=[];$this->summary='';
        try {
            $run=ResultSyncRun::create(['mode'=>$this->option('automatic')?'automatic':'manual','status'=>'running','started_at'=>now()]);
            $exit=$this->importResults($parser,$config,$service);
            $this->summarizeTickets();
            $status=$exit!==self::SUCCESS?($this->stats['published_results']>0?'partial':'failed'):($this->stats['conflicts']>0?'partial':'success');
            $message=$this->summary ?: ('Resultados publicados: '.$this->stats['published_results'].'. Tickets verificados: '.$this->stats['tickets_checked'].'. Con premios: '.$this->stats['winning_tickets'].'.');
            if($this->stats['conflicts'])$message.=' '.'Resultados que requieren revisión: '.$this->stats['conflicts'].'.';
            $run->update(['status'=>$status,'finished_at'=>now(),'stats'=>$this->stats,'message'=>$message]);
            return $exit;
        } catch (\Throwable $e) {
            report($e);
            $this->stats['errors']++;
            $run?->update(['status'=>'failed','finished_at'=>now(),'stats'=>$this->stats,'message'=>'No se pudo completar la sincronización. Se volverá a intentar en la próxima ejecución.']);
            $this->error('No se pudo completar la sincronización.');
            return self::FAILURE;
        } finally {
            $lock->release();
        }
    }

    private function importResults(BoletoganadorImporter $parser, Configuration $config, ResultService $service): int
    {
        $now = $config->clock();
        $draws = Draw::where('active', true)->whereNotNull('source_key')->get()->filter(function ($d) use ($config, $now) {
            $window = $config->window($d, $now);

            return $window && $now->gte($window['closes_at']);
        });
        if ($draws->isEmpty()) {
            $this->summary='No hay sorteos vinculados pendientes de consulta.';
            $this->info($this->summary);

            return self::SUCCESS;
        }
        $this->stats['checked_draws']=$draws->count();
        // Fixed public host, redirects disabled: administrator-entered URLs cannot target internal services.
        try {
            $response = Http::connectTimeout(8)->timeout(15)
                ->retry(2, 500, fn ($exception) => $exception instanceof \Illuminate\Http\Client\ConnectionException, throw: false)
                ->withOptions(['allow_redirects' => false])->get('https://elboletoganador.com/');
        } catch (\Illuminate\Http\Client\ConnectionException $e) {
            LotteryAudit::create(['action' => 'result.import_failed', 'payload' => ['source' => 'https://elboletoganador.com/', 'error' => $e->getMessage()]]);
            $this->stats['errors']++;$this->summary='Falló la conexión con El Boleto Ganador. Se volverá a intentar automáticamente.';
            $this->error('No se pudo conectar con El Boleto Ganador después de dos intentos. La fuente no responde desde este servidor. No se modificaron resultados; la sincronización automática volverá a intentarlo.');
            return self::FAILURE;
        }
        if (! $response->successful()) {
            $this->stats['errors']++;$this->summary='El Boleto Ganador respondió con HTTP '.$response->status().'. No se pudo consultar la fuente.';
            $this->error('El Boleto Ganador respondió con HTTP '.$response->status().'. No se modificaron resultados.');

            return self::FAILURE;
        }
        $this->stats['source_checked']=true;
        $failures = 0;
        foreach ($draws as $draw) {
            try {
                $numbers = $parser->parse($response->body(), $draw->source_key, $now, $draw->result_count);
                if (! $numbers && $draw->source_key === 'resultados-el-quemaito-mayor') {
                    $detail = Http::connectTimeout(8)->timeout(15)->withOptions(['allow_redirects' => false])
                        ->get('https://elboletoganador.com/loteria/resultados-el-quemaito-mayor');
                    $detail->throw();
                    $numbers = $parser->parseDetail($detail->body(), $draw->source_key, $now, $draw->result_count);
                }
                if (! $numbers) {
                    continue;
                }
                $existing = DrawResult::where('draw_id', $draw->id)->where('business_date', $now->toDateString())->first();
                if ($existing) {
                    if ($existing->numbers !== $numbers) {
                        $this->stats['conflicts']++;
                        LotteryAudit::create(['action' => 'result.source_conflict', 'payload' => ['draw_id' => $draw->id, 'date' => $now->toDateString(), 'stored' => $existing->numbers, 'source' => $numbers]]);
                        continue;
                    }
                    if ($existing->status === 'confirmed') {
                        $repaired=$service->reconcilePublished($draw->id,$now->toDateString());
                        $this->stats['repaired_lines']+=$repaired['lines'];
                        $this->ticketIds=array_merge($this->ticketIds,$repaired['ticket_ids']);
                        continue;
                    }
                }
                $service->record(['draw_id' => $draw->id, 'business_date' => $now->toDateString(), 'numbers' => $numbers, 'confirmed' => true,
                    'source_url' => 'https://elboletoganador.com/loteria/'.basename($draw->source_key), 'evidence' => json_encode(['fetched_at' => $now->toIso8601String(), 'numbers' => $numbers, 'source_key' => $draw->source_key])]);
                $this->stats['published_results']++;
                $ids=TicketLine::where(fn($q)=>$q->where('draw_id',$draw->id)->orWhere('second_draw_id',$draw->id))->whereHas('ticket',fn($q)=>$q->where('business_date',$now->toDateString())->where('status','sold'))->pluck('ticket_id')->all();
                $this->ticketIds=array_merge($this->ticketIds,$ids);
                $this->info('Importado y confirmado: '.$draw->name);
            } catch (\Throwable $e) {
                $failures++;$this->stats['errors']++;
                LotteryAudit::create(['action' => 'result.import_failed', 'payload' => ['draw_id' => $draw->id, 'error' => $e->getMessage()]]);
                $this->warn($draw->name.': '.$e->getMessage());
            }
        }

        if($failures)$this->summary=$failures.' sorteos no pudieron sincronizarse. Los demás resultados válidos se conservaron.';
        elseif(!$this->stats['published_results'])$this->summary='Consulta correcta: sin resultados nuevos.';
        return $failures ? self::FAILURE : self::SUCCESS;
    }

    private function summarizeTickets():void
    {
        $tickets=Ticket::with('lines')->whereIn('id',array_unique($this->ticketIds))->where('status','sold')->get();
        $this->stats['tickets_checked']=$tickets->count();
        foreach($tickets as $ticket){
            if($ticket->lines->contains(fn($line)=>$line->prize_minor>0))$this->stats['winning_tickets']++;
            elseif($ticket->lines->isEmpty()||$ticket->lines->contains(fn($line)=>$line->prize_minor===null))$this->stats['pending_tickets']++;
            else $this->stats['losing_tickets']++;
        }
    }
}
