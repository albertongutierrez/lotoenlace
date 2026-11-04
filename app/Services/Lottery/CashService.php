<?php
namespace App\Services\Lottery;
use App\Models\{BranchOffice, CashSession, CashMovement, Office, LotteryAudit, User};
use Illuminate\Support\Facades\DB;
use App\Events\CashStatusChanged;
class CashService {
 public function forOperation(BranchOffice $bank): ?CashSession {
  return app(Configuration::class)->reconciliationMode($bank)==='report' ? null : $this->current($bank);
 }
 private function lock(BranchOffice $bank): void {
  $office = Office::whereKey($bank->office_id)->lockForUpdate()->firstOrFail();
  abort_unless($office->is_active && $bank->fresh()->is_active, 422, 'Banca o consorcio inactivo.');
 }
 public function current(BranchOffice $bank): CashSession {
  return CashSession::where('office_id',$bank->office_id)->where('active_branch_id',$bank->id)->where('status','open')->first()
   ?? abort(422, 'Debes abrir una caja en esta banca antes de vender, anular o pagar premios.');
 }
 public function open(User $user, BranchOffice $bank, array $data): CashSession {
  return DB::transaction(function () use ($user,$bank,$data) {
   $this->lock($bank); $amount=Money::minor($data['amount']);
   abort_if(app(Configuration::class)->reconciliationMode($bank->fresh('office'))==='report',422,'Esta banca cuadra por reporte. No requiere apertura de caja.');
   $existing=CashSession::where('request_key',$data['request_key'])->first();
   if ($existing) {
    abort_unless($existing->branch_office_id===$bank->id && $existing->opened_by===$user->id && $existing->opening_minor===$amount && $existing->opening_note===($data['note'] ?? ''),409,'Solicitud de apertura en conflicto.');
    return $existing;
   }
   abort_if(CashSession::where('active_branch_id',$bank->id)->exists(),422,'Esta banca ya tiene una caja abierta.');
   $session=CashSession::create(['office_id'=>$bank->office_id,'branch_office_id'=>$bank->id,'active_branch_id'=>$bank->id,'opened_by'=>$user->id,
    'request_key'=>$data['request_key'],'currency'=>$bank->office->currency,'opening_minor'=>$amount,'balance_minor'=>0,'opening_note'=>$data['note'] ?? '']);
   $this->record($session,$user,'opening',$amount,'opening:'.$session->id,'Fondo inicial');
   $this->audit($session,$user,'cash.opened'); $this->notifyStatus($session); return $session->fresh();
  },3);
 }
 // Call inside the transaction holding the consortium lock; tickets and cash commit together.
 public function record(CashSession $session, User $user, string $type, int $amount, string $key, string $note, ?int $ticketId=null, string $method='cash', ?string $methodLabel=null): void {
  $session->refresh(); abort_unless($session->status==='open',422,'La caja está cerrada.');
  $existing=CashMovement::where('event_key',$key)->first();
  if ($existing) {
   abort_unless($existing->cash_session_id===$session->id && $existing->user_id===$user->id && $existing->amount_minor===$amount && $existing->payment_method===$method && $existing->type===$type && $existing->note===$note,409,'Solicitud de movimiento en conflicto.'); return;
  }
  $balance=$session->balance_minor+($method==='cash' ? $amount : 0);
  abort_if($balance<0,422,'Efectivo insuficiente en caja. Registra una entrada de fondos antes de continuar.');
  $session->update(['balance_minor'=>$balance]);
  CashMovement::create(['cash_session_id'=>$session->id,'office_id'=>$session->office_id,'user_id'=>$user->id,'ticket_id'=>$ticketId,'event_key'=>$key,'type'=>$type,'amount_minor'=>$amount,'balance_minor'=>$balance,'note'=>$note,'payment_method'=>$method,'payment_method_label'=>$methodLabel ?? (Configuration::PAYMENT_METHODS[$method] ?? $method)]);
 }
 public function movement(User $user, BranchOffice $bank, int $id, array $data): void {
  DB::transaction(function () use ($user,$bank,$id,$data) {
   $this->lock($bank); $session=$this->scoped($bank,$id);
   $amount=Money::minor($data['amount']); abort_unless($amount>0,422,'El monto debe ser mayor que cero.');
   $this->record($session,$user,$data['type'],$data['type']==='withdrawal' ? -$amount : $amount,'manual:'.$data['request_key'],$data['note']);
  },3);
 }
 public function close(User $user, BranchOffice $bank, int $id, array $data): CashSession {
  return DB::transaction(function () use ($user,$bank,$id,$data) {
   $this->lock($bank); $session=$this->scoped($bank,$id); $count=Money::minor($data['amount']);
   if ($session->status==='closed') {
    abort_unless($session->closed_by===$user->id && $session->counted_minor===$count && $session->closing_note===($data['note'] ?? ''),409,'La caja ya fue cerrada con otros datos.'); return $session;
   }
   $difference=$count-$session->balance_minor;
   abort_if(trim($data['note'] ?? '')==='',422,'Indica una observación de cierre.');
   $session->update(['status'=>'closed','active_branch_id'=>null,'closed_by'=>$user->id,'closed_at'=>now(),'counted_minor'=>$count,'difference_minor'=>$difference,'closing_note'=>$data['note'] ?? '']);
   $this->audit($session,$user,'cash.closed'); $this->notifyStatus($session); return $session;
  },3);
 }
 public function scoped(BranchOffice $bank,int $id): CashSession {
  return CashSession::where('office_id',$bank->office_id)->where('branch_office_id',$bank->id)->findOrFail($id);
 }
 private function audit(CashSession $session,User $user,string $action): void {
  LotteryAudit::create(['office_id'=>$session->office_id,'user_id'=>$user->id,'action'=>$action,'payload'=>$session->toArray()]);
 }
 private function notifyStatus(CashSession $session): void {
  $snapshot = clone $session;
  DB::afterCommit(static function () use ($snapshot) {
   // A transport outage must never undo or report failure for a committed cash action.
   try { event(new CashStatusChanged($snapshot)); } catch (\Throwable $error) { report($error); }
  });
 }
}
