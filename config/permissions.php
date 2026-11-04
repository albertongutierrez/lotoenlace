<?php

$crud = fn ($module, $label) => array_map(fn ($action, $verb) => [

    'module' => $module, 'name' => "$verb $label", 'slug' => "$module.$action",

], ['view', 'create', 'update', 'delete'], ['Ver', 'Crear', 'Editar', 'Eliminar']);

$routes = ['dashboard' => 'dashboard.view'];

foreach (['users' => 'users', 'offices' => 'settings.offices', 'branch-offices' => 'settings.branch-offices'] as $resource => $permission) {

    foreach (['index' => 'view', 'create' => 'create', 'store' => 'create', 'edit' => 'update', 'update' => 'update', 'destroy' => 'delete'] as $action => $ability) {

        $routes["settings.$resource.$action"] = "$permission.$ability";

    }

}

$routes['settings.roles.index'] = 'roles.view';

$routes['settings.roles.*'] = 'roles.manage';

$lotteryPermissions = ['cash' => 'Administrar cajas de la banca', 'catalog' => 'Administrar catálogo global', 'settings' => 'Configurar consorcio y bancas', 'limits' => 'Administrar bloqueos y límites', 'sell' => 'Vender tickets', 'tickets' => 'Consultar tickets', 'cancel' => 'Anular tickets', 'pay' => 'Pagar premios', 'results' => 'Administrar resultados'];

foreach (['catalog' => 'catalog', 'catalog.*' => 'catalog', 'settings' => 'settings', 'settings.*' => 'settings', 'limits' => 'limits', 'limits.*' => 'limits', 'sales' => 'sell', 'availability' => 'sell', 'sell' => 'sell', 'tickets' => 'tickets', 'ticket' => 'tickets', 'cancel' => 'cancel', 'pay' => 'pay', 'results' => 'results', 'results.*' => 'results'] as $route => $permission) {
    $routes['lottery.'.$route] = 'lottery.'.$permission;
}

$routes['lottery.cash-status'] = 'lottery.sell';
$routes['lottery.published-results'] = 'lottery.results.view';
$routes['lottery.cash'] = 'lottery.cash';
$routes['lottery.cash.*'] = 'lottery.cash';

$routes['lottery.print'] = ['lottery.sell', 'lottery.tickets'];
$routes['lottery.ticket'] = ['lottery.sell', 'lottery.tickets'];
$routes['lottery.print-status'] = ['lottery.sell', 'lottery.tickets'];
$routes['lottery.print-agent.download'] = ['lottery.sell', 'lottery.tickets'];
$routes['lottery.print-history'] = 'lottery.tickets';

$routes['lottery.reports'] = array_map(fn ($key) => 'reports.'.$key, array_keys(require __DIR__.'/reports.php'));

return [

    'definitions' => [
        ...array_map(fn ($key, $label) => ['module'=>'reports','name'=>'Consultar '.$label,'slug'=>'reports.'.$key], array_keys(require __DIR__.'/reports.php'), array_values(require __DIR__.'/reports.php')),
        ['module'=>'lottery', 'name'=>'Ver movimientos y saldo de caja antes del cierre', 'slug'=>'lottery.cash.view_open'],
        ['module'=>'lottery', 'name'=>'Elegir forma de cuadre por consorcio y banca', 'slug'=>'lottery.reconciliation.configure'],
        ['module'=>'lottery', 'name'=>'Configurar medios de cobro por consorcio y banca', 'slug'=>'lottery.payments.configure'],
        ['module'=>'lottery', 'name'=>'Consultar resultados publicados desde Ventas', 'slug'=>'lottery.results.view'],

        ...array_map(fn ($key, $label) => ['module' => 'lottery', 'name' => $label, 'slug' => 'lottery.'.$key], array_keys($lotteryPermissions), array_values($lotteryPermissions)),

        ['module' => 'dashboard', 'name' => 'Ver inicio', 'slug' => 'dashboard.view'],

        ...$crud('users', 'usuarios'),

        ...$crud('settings.offices', 'consorcios'),

        ...$crud('settings.branch-offices', 'bancas'),

        ['module' => 'roles', 'name' => 'Ver roles', 'slug' => 'roles.view'],

        ['module' => 'roles', 'name' => 'Administrar roles', 'slug' => 'roles.manage'],

        ['module' => 'company', 'name' => 'Ver todos los registros de la consorcio', 'slug' => 'company.data.view_all'],

    ],

    'route_permissions' => $routes,

];
