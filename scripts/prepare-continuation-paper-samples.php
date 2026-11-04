<?php

// Prepare synthetic paper samples from the passing isolated integration test.
// This command signs documents only; it never sells or pays a real ticket.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

[$script, $fixturePath, $outputPath, $printer] = $argv + [null, null, null, null];
if (! $fixturePath || ! $outputPath || ! $printer || is_file($outputPath)) {
    throw new RuntimeException('Indica muestra, archivo nuevo de salida e impresora. No se sobrescriben envíos previos.');
}
$fixture = json_decode(file_get_contents($fixturePath), true, flags: JSON_THROW_ON_ERROR);
$agent = json_decode(file_get_contents(getenv('LOCALAPPDATA').'/LotoEnlace/PrintAgent/config.json'), true, flags: JSON_THROW_ON_ERROR);
$signer = app(\App\Services\Lottery\PrintAuthorization::class);
if (trim($signer->publicKey()) !== trim($agent['publicKey'])) {
    throw new RuntimeException('El agente no tiene la clave pública actual del sistema.');
}
$key = openssl_pkey_get_private(file_get_contents(config('printing.private_key_path')));
$job = json_decode(base64_decode($fixture['authorization']['payload']), true, flags: JSON_THROW_ON_ERROR);
$receipt = $job['receipt'];
$receipt['test_reprint'] = true;
$receipt['show_qr'] = false; // Synthetic code: never print a scannable live ticket reference.
$receipt['company_name'] = 'PRUEBA DE CONTINUACION';
$receipt['branch_name'] = 'Muestra sin movimientos de caja';
$receipt['reference'] = 'PRUEBA-'.substr($receipt['code'], 0, 8);
$receipt['footer'] = 'MUESTRA AUTOMATIZADA - SIN VALIDEZ';
$receipt['date'] = now()->timezone('America/Santo_Domingo')->format('d/m/Y h:i:s A');
$original = $receipt;
unset($original['document_type'], $original['payment_id'], $original['payment_reference'], $original['paid_minor'], $original['paid_by']);
$original['pin'] = $fixture['expected']['oldPin'];
$original['lines'] = [
    ['draw_id' => 0, 'second_draw_id' => null, 'draw' => $fixture['expected']['paidDraw'], 'modality' => 'quiniela', 'numbers' => '10', 'amount_minor' => 1000],
    ...$receipt['lines'],
];
$original['gross_minor'] = $original['net_minor'] = 1400;
$original['discount_minor'] = 0;
$original['footer'] = 'ANTES DEL PAGO: GANADOR + PENDIENTE - SIN VALIDEZ';
$documents = [];
foreach (['inicial' => $original, 'continuacion' => $receipt] as $label => $data) {
    $payload = [...$job,
        'id' => (string) \Illuminate\Support\Str::uuid(),
        'issuer' => $agent['issuer'], 'issued_at' => now()->timestamp, 'expires_at' => now()->addMinutes(2)->timestamp,
        'target' => ['device_id' => $agent['deviceId'], 'printer' => $printer, 'profile' => 'epson', 'paper_width' => 80, 'cut' => true, 'feed_lines' => 2],
        'receipt' => $data,
    ];
    $bytes = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (! openssl_sign($bytes, $signature, $key, OPENSSL_ALGO_SHA256)) throw new RuntimeException('No se pudo firmar la muestra.');
    $documents[] = ['sample' => $label, 'authorization' => ['payload' => base64_encode($bytes), 'signature' => base64_encode($signature)]];
}
file_put_contents($outputPath, json_encode($documents, JSON_THROW_ON_ERROR));
echo "Dos muestras preparadas; sin ventas ni pagos reales.\n";
