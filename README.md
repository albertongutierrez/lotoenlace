# LotoEnlace

Aplicación independiente basada en `plantilla-base`, migrada a Laravel 13 y adaptada para ventas de loterías. La plantilla original no se modifica.

## Entorno local

- Sitio: http://lotoenlace.test
- Proyecto: `C:\xampp\htdocs\LotoEnlace`
- Servidor: Laravel Herd; sitio aislado con PHP 8.5.
- Base MySQL: `lotoenlace`, independiente de la plantilla y de otros sistemas.
- Acceso inicial: consultar `.local-access.md` (ignorado por Git).

Herd sirve el proyecto aunque su carpeta esté debajo de `xampp`; Apache no es necesario para este sitio. La base utiliza el servidor MySQL local existente.

## Versiones verificadas al 3 de noviembre de 2026

PHP 8.5.12, Laravel 13.40.0, Inertia React 3.11.0 / Laravel 3.7.0, React 19.3.1, TypeScript 7.0.2, Tailwind 4.3.4, Vite 8.3.5, Vitest 5.1.0 y PHPUnit 13.4.6. Herramientas: Node.js 26.13.0 LTS, npm 12.2.1 y Composer 2.11.1. Los archivos lock fijan las dependencias.

En PowerShell, desde la raíz del proyecto, ejecuta `& .\scripts\use-toolchain.ps1` para activar PHP de Herd y las herramientas del proyecto en esa terminal. Si faltan Node.js o Composer, el script descarga los binarios oficiales, verifica su SHA256 y los instala bajo `.tooling/`. No cambia el PATH de Windows. Si no usas Herd, puedes indicar el ejecutable con `-PhpExecutable`.

## Puesta en operación

1. Entrar con el administrador local y cambiar su contraseña desde Perfil.
2. Crear un consorcio y elegir su moneda. Su vista permite configurar valores antes de crear bancas.
3. Revisar el catálogo inicial de loterías y sorteos, con sus horarios RD, días, modalidades y suspensiones por fecha.
4. Habilitar los sorteos en el consorcio y configurar sus premios. Las comisiones son opcionales.
5. Configurar las parejas de súper palé: habilitación, sorteo base, orden de números y categorías de premio.
6. Crear bancas y usuarios; asignar roles y accesos dentro del consorcio.
7. Seleccionar la banca activa, personalizar únicamente sus excepciones y crear restricciones si corresponde.
8. Vender. Sin tabla de premios o fuera de horario, el servidor rechaza la jugada.

La instalación inicial con `php artisan migrate --seed` carga 12 loterías y 38 sorteos enlazados con El Boleto Ganador. Incluye El Quemaito Mayor bajo LoteDom, con una sola posición ganadora. Los horarios iniciales provienen del catálogo del proyecto y se pueden ajustar desde la administración.

En cPanel, después de actualizar el repositorio de una instalación existente, el catálogo se puede cargar con el ejecutable PHP 8.5 del hosting. La carga agrega los registros faltantes y conserva los horarios y demás ajustes de los sorteos existentes.

```bash
/opt/cpanel/ea-php85/root/usr/bin/php artisan db:seed --class=LotteryCatalogSeeder --force
```

La carga del consorcio y la banca `PRUEBA-001` es independiente y está disponible en local con `php artisan db:seed --class=LotteryDemoSeeder`. Consulta [la guía de demostración](docs/DEMO.md) para las tarifas de ejemplo y los casos de bloqueos y límites.

## Comandos de desarrollo

```powershell
& .\scripts\use-toolchain.ps1
composer install
npm ci
npm ci --prefix printing-agent
npm run build
php artisan test
```

En un clon nuevo, copia `.env.example` a `.env`, configura la base de datos y ejecuta `php artisan key:generate` y `php artisan migrate --seed` después de `composer install`. Para el primer administrador, usa `php artisan base:create-admin`. La compilación genera `public/build/`; los archivos locales de acceso y las claves de impresión se preparan por separado.

No ejecutar migraciones destructivas sobre la base de trabajo. PHPUnit usa SQLite en memoria y no modifica MySQL local.

## Avisos de caja en vivo

Los avisos y el WebSocket de caja se habilitan únicamente en bancas que cuadran mediante cajas. Con cuadre por reporte, Ventas oculta el indicador de cuadre y el estado de conexión, no abre el canal de caja y desconecta cualquier suscripción anterior. La política se comprueba por HTTP al entrar o volver a la ventana; si cambia a cajas, se activan nuevamente los avisos y la apertura obligatoria. No hay sondeo periódico.

Ventas recibe las aperturas y cierres mediante Laravel Reverb y un canal privado por consorcio y banca. La autorización exige acceso a la banca activa y el permiso `lottery.sell`; el evento solo contiene identificadores y estado, nunca saldos ni diferencias. Se publica después del commit. La caída de Reverb no revierte una apertura o cierre ya guardado.

Se eliminó el sondeo de caja cada cinco segundos. Hay una consulta inicial, otra al suscribirse o reconectarse para recuperar cambios perdidos, y comprobaciones al volver a la pestaña o después de un error al vender. El servidor sigue validando la caja al realizar cada operación. La pantalla indica «En vivo» o «Sin avisos en vivo»; los borradores se conservan cuando se cierra la caja.

En esta PC, `scripts/install-realtime.ps1` registra `LotoEnlace-Realtime`: un proceso persistente que arranca al iniciar sesión en Windows mediante un lanzador oculto, sin consolas periódicas. Logs: `storage/logs/realtime.log`. Para detener/iniciar: `Stop-ScheduledTask` / `Start-ScheduledTask -TaskName LotoEnlace-Realtime`. Escucha solo en `127.0.0.1:8080` y acepta el origen `lotoenlace.test`.

En producción, configurar las variables `REVERB_*` / `VITE_REVERB_*`, `BROADCAST_CONNECTION=reverb`, los orígenes autorizados y un proceso supervisado `php artisan reverb:start`. Usar un proxy HTTPS/WSS para navegadores remotos y recompilar los recursos. `REVERB_APP_SECRET` permanece exclusivamente en el servidor. La instalación de Reverb 1.12 requiere Guzzle 7 / PSR-7 2, por lo que Composer ajustó esas dependencias a sus versiones compatibles.

## Resultados automáticos

En cada sorteo, indicar la página de El Boleto Ganador y su identificador externo; por ejemplo `resultados-anguila-10-am`. Si se proporciona la URL individual, el identificador se deriva de ella. El adaptador consulta la portada pública y localiza exactamente el enlace de ese sorteo. Solo acepta tarjetas de hoy con fecha coincidente y la cantidad de posiciones configurada (entre una y tres), con números de dos cifras. Nunca asigna el último resultado de ayer a hoy.

La tarea de Windows `LotoEnlace-Results` ejecuta cada minuto `wscript.exe //B //Nologo "C:\xampp\htdocs\LotoEnlace\scripts\run-scheduler-hidden.vbs"`. Este lanzador inicia `scripts/run-scheduler.ps1` oculto desde el principio, evitando que Windows abra una terminal antes de aplicar `-WindowStyle Hidden`. Laravel realiza la consulta cada cinco minutos, sin solapamientos. La tarea local usa la sesión interactiva del usuario: no sustituye un servicio permanente de producción y no se ejecuta con el equipo apagado. Revisar `storage/logs/scheduler.log` y las auditorías del importador.

Los resultados importados quedan pendientes. El administrador global los confirma en Resultados para calcular premios. Una discrepancia posterior se registra y no reemplaza automáticamente un resultado confirmado. Una corrección con premios ya pagados requiere conciliación fuera del flujo automático.

En otro servidor configurar el programador de Laravel con PHP 8.5 y `artisan schedule:run`; la tarea de Windows no se exporta junto al código.

## Reglas y validación

En Consorcios > Comisiones y premios se configuran valores generales independientes para quiniela, palé y tripleta, además de excepciones por sorteo. Cada modalidad admite su porcentaje de comisión y sus categorías de premio. Súper palé conserva su configuración general y las excepciones por pareja. Las bancas heredan del consorcio y pueden definir valores generales y excepciones propios. El orden de prioridad es general del consorcio, excepción del consorcio, general de la banca y excepción de la banca. Las tablas guardadas previamente por sorteo se conservan como excepciones. «Usar general en todos los sorteos» permite retirar las excepciones de una modalidad en el ámbito seleccionado antes de guardar.

Estos ajustes requieren el permiso `lottery.settings` y quedan registrados en la auditoría de configuración. Los tickets conservan la tabla y comisión vigentes al venderse, aunque después cambie la configuración. La nueva configuración utiliza los campos JSON existentes.

### Formas de cuadre por consorcio y banca

En Consorcios > Configuración > Forma de cuadre se define el valor del consorcio. Al elegir una banca en «Configurar», esta puede heredar el valor o mantener una excepción propia.

- **Cajas:** valor inicial para las instalaciones existentes. Vender, anular y pagar requieren una caja abierta; los fondos, movimientos, conteo y cierre continúan en Cajas.
- **Reporte:** permite vender, anular y pagar sin apertura de caja. Reportes muestra «Cuadre por período» con resumen por banca o detalle por ticket y operación, búsqueda, tipo de operación, fechas y PDF/impresión. Solo aparecen las bancas autorizadas que utilizan este modo. Las cajas anteriores permanecen disponibles en Historial de cajas.

El cuadre por período usa la fecha real de cada operación en República Dominicana: ventas netas cobradas, devoluciones por anulación y premios efectivamente pagados, aunque correspondan a tickets vendidos en otra fecha. Incluye el historial de operaciones de las bancas seleccionadas. Neto de operaciones = ventas - anulaciones - premios pagados. Las comisiones netas se informan aparte (se reversan al anular). El reporte no incluye fondos iniciales ni movimientos manuales de cajas y no calcula un efectivo contado o una diferencia de caja.

Cambiar la forma exige `lottery.reconciliation.configure`, además del acceso a configuración. Consultar y exportar el reporte exige `reports.reconciliation`, con los permisos y bancas del consorcio activo. Los cambios se serializan con las operaciones financieras, exigen cerrar las cajas abiertas afectadas y generan auditorías `reconciliation.mode_changed`. Las excepciones explícitas de otras bancas se conservan. Ventas recibe el cambio por el canal privado existente, consulta la política vigente y mantiene sus jugadas preparadas.

Ver `docs/LOTTERY_RULES.md`. Las pruebas cubren permisos de la plantilla y reglas de dinero, herencia, límites, cierre, idempotencia, anulación, resultados y pagos. Los importes se almacenan en unidades menores enteras, sin cálculos monetarios flotantes en el servidor.

## Estado del servidor con TanStack Query

TanStack Query 5.105.3 administra las consultas de disponibilidad y tickets, la carga para duplicar tickets, el catálogo de loterías y sorteos y sus mutaciones. Inertia conserva la navegación; Axios sigue siendo el transporte HTTP.

Las claves incluyen usuario/banca y parámetros de consulta. La caché es solo en memoria y se limpia al cambiar de usuario o banca. Las consultas de cupo son manuales, sin reutilizar respuestas frescas: cada pulsación consulta al servidor y cualquier cambio de jugada o selección retira el cupo anterior. El servidor siempre revalida al vender.

Las mutaciones no tienen reintentos automáticos ni quedan en cola al desconectarse. Se conserva la clave idempotente de venta ante un fallo. Pagar o anular invalida las consultas de lotería y actualiza el listado; esos endpoints admiten JSON y mantienen las respuestas Inertia anteriores. El catálogo presenta una tabla de loterías y una página por lotería con sus sorteos; sus formularios guardan con React Query y actualizan las consultas. Configuración y resultados continúan usando formularios Inertia.

Verificación: `npm run test:query`, `npm run build` y `php artisan test` con PHP de Herd.


El importador programado usa `lottery:import-results --automatic`. Cada ejecución guarda inicio, finalización, estado y contadores en `result_sync_runs`; las ejecuciones manuales se registran separadas. Resultados muestra la última consulta automática, incluso cuando no hay novedades, y la última modificación real de resultados. Al confirmar resultados se calculan premios; si el resultado ya estaba confirmado, se reparan únicamente jugadas sin evaluar, sin modificar premios pagados. Una ejecución del programador puede verificarse con `php artisan schedule:test --name="lottery:import-results --automatic"`.


## Agente local de impresión

Los medios de cobro de ventas se configuran en Consorcios → Configuración. Además de efectivo, transferencia, tarjeta y depósito se pueden crear medios personalizados (PayPal, Cash App, Zelle u otros), editar su nombre y habilitarlos o deshabilitarlos. Cada banca hereda la lista del consorcio o utiliza una lista independiente; se requiere `lottery.payments.configure` tanto para la lista como para sus nombres, y los cambios quedan auditados. Una banca independiente conserva los nombres de sus medios aunque cambie el consorcio. Los tickets y movimientos nuevos guardan una copia del nombre original; renombrar o desactivar un medio no cambia ventas, anulaciones o reportes anteriores. La migración `2026_10_27_150000_snapshot_payment_method_names` agrega estos campos sin modificar los importes existentes. Solo efectivo permite cambio y altera el saldo de caja; las anulaciones usan el medio original. Los medios personalizados registran cobros externos, no ejecutan pagos mediante PayPal u otros proveedores. Los reportes incluyen dinámicamente los medios usados. El agente 1.2.3 imprime sus nombres en 58/80 mm; actualizar el paquete instalado para aplicar este formato en impresiones directas.

Cada medio dispone de «Referencia obligatoria», incluidos los medios personalizados. `payment_reference_required` guarda la exigencia por identificador del medio y es opcional por defecto, sin cambiar operaciones anteriores. Las bancas heredan esta política con sus medios de cobro; al elegir configuración independiente se copia la política actual y luego sus cambios son propios. Modificar la exigencia requiere `lottery.payments.configure` y queda en la auditoría `payment_methods.changed`. Ventas identifica la referencia como obligatoria u opcional y bloquea la confirmación si falta; el servidor revalida la política vigente dentro de la transacción antes de generar el ticket o los movimientos. Los reintentos idénticos de ventas ya confirmadas no generan otra venta ni exigen una nueva referencia por un cambio posterior de configuración. No requiere migración adicional: utiliza la configuración JSON existente.

Ventas → Resultados (`Alt+R`, permiso `lottery.results.view`) muestra únicamente resultados confirmados de hoy en hora RD para los sorteos habilitados de la banca, ordenados por publicación. Los logos locales de `public/lottery-logos` y su mapa `resources/js/lib/resultLogos.json` proceden de https://elboletoganador.com/ (22/10/2026). No se consultan resultados ni recursos externos al abrir la modal; se utiliza la sincronización existente y los archivos locales.

La reimpresión de prueba quedó deshabilitada: `PRINT_TEST_OFFICE_IDS` y las banderas del cliente no permiten imprimir tickets vencidos, anulados o de fechas anteriores. Se conservan la auditoría, el plazo configurado y las impresiones autorizadas de pago/continuación. Duplicar admite el número del ticket y, si la banca tiene QR habilitado, consulta automáticamente su código QR actual; luego Enter carga las jugadas para revisar la nueva venta.

Ventas > Impresora permite descargar el agente Node.js para Windows, detectar las impresoras instaladas y elegir la térmica de esta PC para la banca actual (ESC/POS o Star, 58/80 mm). Usa `node-thermal-printer` 4.6.1. El diálogo del navegador sigue disponible como modo explícito. Los permisos existentes `lottery.sell` / `lottery.tickets` controlan descarga, autorización de impresión y registro del envío, manteniendo el alcance de consorcio/banca y los plazos de reimpresión.

Preparar el servidor con `php artisan lottery:print-agent-key`; conservar su clave privada con los respaldos del servidor. El ZIP descargable no contiene claves ni configuración del equipo. Consultar [instalación y funcionamiento del agente](printing-agent/README.md). Las pruebas `npm test --prefix printing-agent` simulan el spooler y verifican firma, destino y reintentos; no imprimen físicamente. La aceptación en la cola de Windows aparece en la auditoría junto a la impresora; no equivale a comprobar la salida del papel.
