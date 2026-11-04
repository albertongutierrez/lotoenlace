<?php

use Illuminate\Contracts\Console\Kernel;

// Run only on the dedicated local project. Credentials are read from .env, never printed.
require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! app()->environment('local')) {
    throw new RuntimeException('Solo para entorno local.');
}
$config = config('database.connections.mysql');
if ($config['database'] !== 'lotoenlace') {
    throw new RuntimeException('La base debe llamarse lotoenlace.');
}
$pdo = new PDO('mysql:host='.$config['host'].';port='.$config['port'], $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE DATABASE IF NOT EXISTS `lotoenlace` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
echo "Base lotoenlace disponible.\n";
