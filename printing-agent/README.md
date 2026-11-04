# Agente de impresión LotoEnlace para Windows

Usa Node.js 26.13.0 o posterior y `node-thermal-printer` 4.6.1. Genera ESC/POS (Epson compatible) o Star y envía bytes RAW al servicio de impresión de Windows. La impresora debe admitir el lenguaje elegido. No necesita compilar módulos nativos ni convierte impresoras de oficina/PDF en térmicas.

## Preparar el servidor una sola vez

Ejecutar `php artisan lottery:print-agent-key`. Mantener `APP_URL` igual a la dirección real del sistema. Respaldar `storage/app/private/print-agent/private.pem` con los secretos del servidor; nunca incluirlo en el instalador. Cambiar esta clave requiere volver a vincular explícitamente los equipos, no se acepta su sustitución silenciosa.

## Instalar en cada PC

1. Instalar la impresora térmica en Windows. El .bat prepara Node.js automáticamente si falta o no es compatible.
2. Descargar el paquete completo **LotoEnlace-PrintAgent-Windows.zip** desde Ventas > Impresora.
3. Extraer toda la carpeta y abrir **Instalar.bat** con doble clic. El instalador usa la URL del sistema y cierra su consola al completar la instalación. Si falla, la deja abierta para mostrar el error. En producción utilizar HTTPS.
4. Si existe Node.js 26.13.0 o posterior con npm, lo utiliza. En otro caso descarga Node.js 26 LTS de nodejs.org, comprueba su SHA256 y prepara una copia privada en `%LOCALAPPDATA%\LotoEnlace\PrintAgent\runtime`, sin sustituir Node.js global ni modificar el PATH de Windows. Luego copia los archivos a `%LOCALAPPDATA%\LotoEnlace\PrintAgent\app`, instala las dependencias y vincula el equipo. En el icono de LotoEnlace de la bandeja, elegir **Copiar clave de conexión**. Pegarla en Ventas > Impresora > Agente local > Clave de conexión. Pulsar Detectar impresoras, seleccionar la térmica, lenguaje y ancho de papel 58/80 mm y guardar.
5. El agente inicia en segundo plano sin consola visible y se registra para iniciarse automáticamente al entrar a Windows con ese usuario. Usa HKCU Run, valor `LotoEnlacePrintAgent`, sin solicitar administrador. Para iniciarlo manualmente, abrir **Iniciar.vbs** en la carpeta instalada; `Iniciar.bat` permanece como acceso compatible y termina de inmediato. Un mutex y la comprobación de la conexión existente evitan otra instancia. Atiende solo `127.0.0.1:18745`; no abrir ese puerto en el firewall ni exponerlo en la red. Si el navegador solicita acceso a la red local, permitirlo para el sitio del sistema.

La selección corresponde al navegador/PC y banca actuales. La clave local queda en almacenamiento del navegador, no en la base del consorcio. Otros perfiles/navegadores deben configurarse. En modo agente no se abre el diálogo del navegador ni se vuelve a él automáticamente si falla el envío. Se conserva Navegador para elegirlo explícitamente.

Para recuperar la clave, ejecutar `node src/cli.mjs configure --app-url=URL` desde la carpeta del agente; no cambia una vinculación existente con la misma clave pública. No compartir `config.json`. La configuración y registro se guardan en `%LOCALAPPDATA%\LotoEnlace\PrintAgent`. `LOTOENLACE_AGENT_HOME` permite otra carpeta para desarrollo/pruebas.

## Auditoría y reintentos

El servidor firma con RSA-SHA256 las jugadas, totales, PIN, QR, control, impresora y equipo de destino. La autorización dura hasta dos minutos sin sobrepasar el plazo de reimpresión. El agente comprueba la firma y el destino. No acepta HTML, bytes RAW proporcionados por el navegador ni tickets sin autorización. Solo el origen de la aplicación vinculada y su clave local pueden acceder a su API.

La cola es serial y guarda el intento en disco antes de entregarlo a Windows. Repetir una solicitud, incluso tras reiniciar el agente, devuelve el mismo trabajo sin enviarlo otra vez. El registro local no guarda jugadas, PIN ni contenido del comprobante. Si se interrumpe el proceso durante el envío, el estado es desconocido: revisar papel/cola y autorizar expresamente otra copia, que tendrá un control nuevo. No borrar `jobs.json`, pues protege contra duplicados.

Enviado significa aceptado por el servicio de impresión de Windows, no papel impreso. Algunos drivers no reflejan falta de papel/desconexión. Las impresoras virtuales conocidas no se habilitan para RAW.

## Desarrollo y pruebas

`npm ci --ignore-scripts --no-audit` y `npm test`. Sin instalar: `npm run configure -- --app-url=http://lotoenlace.test`, luego `npm start`. Las pruebas usan un spooler simulado y no imprimen físicamente.

Para desactivar el inicio automático, deshabilitar LotoEnlacePrintAgent en las aplicaciones de inicio de Windows o quitar su valor de HKCU Run. El inicio pertenece al usuario que instala; no se ejecuta antes de iniciar sesión.

Al reinstalar conservar el registro y la configuración de esa PC. No eliminar la clave privada del servidor al desinstalar el agente de una PC.

Documentación de la librería: https://github.com/Klemen1337/node-thermal-printer

Fuentes: [descargas oficiales de Node.js](https://nodejs.org/dist/latest-v26.x/) y [inicio de aplicaciones por usuario en Windows](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys).


## Icono junto al reloj

El inicio automático y `Iniciar.vbs` abren un icono de impresora en la bandeja de Windows (puede estar dentro de la flecha de iconos ocultos). Su indicador cambia a verde cuando Health responde, naranja al iniciar/detener, gris si lo detiene el usuario y rojo si falla. Clic derecho: Iniciar, Detener, Reiniciar, Estado / Health, logs del agente/errores/inicio, carpeta de logs y Copiar clave de conexión. Doble clic abre Health. La ventana actualiza el estado sin bloquear el menú.

Detener y Reiniciar utilizan la API local autenticada y rechazan la operación si se está procesando una impresión. Detener no se revierte solo: hay que pulsar Iniciar; el siguiente inicio de Windows vuelve a iniciar el servicio. Cerrar solo el icono deja el servicio funcionando. El mutex impide duplicar la bandeja y el servidor conserva la protección de sus trabajos.

`startup.log` conserva cambios de estado; `tray-status.json` muestra el estado más reciente, versión y PID sin claves ni PINs. Los errores indican CONFIG_READ, RUNTIME_READ, APP_FILES, NODE_LAUNCH o NODE_EXIT en lugar de ocultar todo con un mensaje genérico. Los errores antiguos permanecen como historial: Health y el estado reciente permiten comprobar si ya se recuperó.

## Formato del comprobante y corte

En **Impresora de esta PC**, ajusta **Líneas en blanco al final del ticket** de 0 a 15 (por defecto 2). El agente agrega únicamente esas líneas después del control de impresión y no añade los avances automáticos de la librería al cortar. El mínimo físico del corte depende de la impresora. Esta preferencia se guarda por PC/navegador y banca.

El ticket muestra los nombres completos de sorteos con separadores y después las jugadas por Quiniela, Palé, Tripleta y Súper palé. Las jugadas con modalidad y monto iguales se imprimen una vez bajo sus sorteos correspondientes; los montos o conjuntos de sorteos distintos se conservan separados. El total mantiene todas las apuestas.

El QR se genera como imagen y se envía usando `node-thermal-printer`, evitando comandos nativos de modelo QR que algunas térmicas imprimen como caracteres sueltos. Para actualizar una instalación anterior, descarga el paquete completo. Cuando no haya impresiones en curso, selecciona **Detener servicio** y luego **Cerrar solo el icono** en la bandeja antes de ejecutar **Instalar.bat** de nuevo. Se conservan la conexión y los registros.

## Reimpresión en consorcios de prueba

En el servidor, `PRINT_TEST_OFFICE_IDS=1,2` permite reimprimir tickets de cualquier fecha y estado únicamente en esos consorcios. Déjalo vacío para aplicar los plazos y estados normales. El listado abre con hoy y ayer y permite filtrar Hoy, Ayer o Todos. Todas las copias conservan permisos y auditoría, se identifican como PRUEBA - SIN VALIDEZ y muestran TICKET ANULADO cuando corresponde. Las autorizaciones del agente siguen venciendo en dos minutos.

## Comprobantes de pago de premios

Al pagar en Ventas se abre la impresión automática de un comprobante con empresa, banca, fecha del pago, referencia del ticket y del pago, cajero y premios pagados en esa operación. No incluye el PIN. Cada pago conserva una copia de sus datos para que pagos posteriores no modifiquen el comprobante anterior. Los envíos y copias se auditan como comprobantes de pago. Si falla la impresión, se reintenta desde esa misma ventana sin ejecutar otro pago. Las copias requieren confirmación y utilizan los ajustes de papel/corte de esta PC.

## Continuación tras un pago parcial

Si quedan jugadas sin resultado al pagar, el mismo ticket recibe un PIN distinto y se imprime automáticamente una continuación con únicamente esas jugadas. Conserva el código original, incluye el importe del premio pagado y se marca NO ES UNA NUEVA VENTA. El súper palé conserva su pareja completa mientras falte un resultado. El PIN anterior queda inválido; reintentar la impresión no vuelve a cambiarlo ni vuelve a pagar. Una continuación sustituida por otro pago no puede reimprimirse ni obtener el PIN vigente. Si no quedan sorteos pendientes, se imprime el comprobante de pago habitual.
