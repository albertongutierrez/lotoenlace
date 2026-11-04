<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class CreatePrintAgentKey extends Command
{
    protected $signature = 'lottery:print-agent-key';
    protected $description = 'Prepara la clave privada que autoriza tickets para el agente local';

    public function handle(): int
    {
        $path = config('printing.private_key_path');
        if (! is_dir(dirname($path))) mkdir(dirname($path), 0700, true);
        $lock = fopen($path.'.lock', 'c');
        flock($lock, LOCK_EX);
        try {
            if (! is_file($path)) {
                $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA, 'config' => base_path('config/print-agent-openssl.cnf')]);
                if (! $key || ! openssl_pkey_export($key, $pem, null, ['config' => base_path('config/print-agent-openssl.cnf')])) throw new \RuntimeException('No se pudo generar la clave RSA.');
                file_put_contents($path, $pem, LOCK_EX);
                chmod($path, 0600);
            }
            app(\App\Services\Lottery\PrintAuthorization::class)->publicKey();
            $this->info('Firma de impresión preparada. La clave privada permanece en el servidor.');
            return self::SUCCESS;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
