# Reglas implementadas

## Consorcio y banca

La moneda pertenece al consorcio. La banca y el vendedor no pueden cambiarla. Una moneda no se puede cambiar después de emitir un ticket, incluso si luego se anula. Los códigos de banca son únicos por consorcio, normalizados a mayúsculas; tampoco se reutilizan los códigos de bancas eliminadas lógicamente.

Los ajustes ausentes o nulos en la banca heredan del consorcio. `false`, cero y una lista vacía son valores explícitos. Los cambios del consorcio afectan a las bancas que heredan. Los sorteos de una banca siempre se intersectan con los autorizados por el consorcio. Las parejas deshabilitadas por el consorcio no se habilitan desde una banca.

## Dinero

- Límite diario por banca: valor heredable con excepción propia.
- Límite diario del consorcio: cupo compartido obligatorio para todas las bancas.
- Los límites consumen el monto apostado, antes del descuento.
- Descuento: bloques completos, `floor(apostado / bloque) * descuento`.
- La comisión se calcula sobre lo cobrado; no configurada equivale a no aplicar, salvo herencia. Cero permite desactivarla expresamente.
- El descuento del ticket se distribuye proporcionalmente entre jugadas, con ajuste exacto de centavos.
- Cada jugada conserva su tarifa y comisión al emitirse. Cambiar la configuración no recalcula tickets anteriores.
- Los premios se expresan como multiplicadores enteros por unidad apostada. Si una jugada coincide con varias categorías, se paga la mayor; esta decisión queda visible en la configuración.

## Súper palé

Se generan parejas únicas entre los sorteos seleccionados que aceptan esta modalidad. Cada pareja debe estar habilitada y tener premios configurados. Una jugada por 10 en tres parejas cuesta 30; el monto es por pareja.

Cada pareja tiene un sorteo base: su primero se combina con el primero, segundo o tercero del otro sorteo según las categorías habilitadas (`1-1`, `1-2`, `1-3`). La identidad de la pareja no depende del orden de selección. Sin orden, `10-20` y `20-10` son la misma jugada. Con orden, el primer número pertenece al sorteo base. Los números repetidos se conservan, pues pueden salir en dos sorteos distintos.

El cierre es el primero de los cierres participantes. El cálculo espera ambos resultados confirmados. Una categoría ausente no participa; un pago cero es una categoría configurada con premio cero.

## Restricciones

Cada regla tiene consorcio, banca opcional, modalidad, categoría opcional, coincidencia exacta/contiene/todas, sorteos opcionales, parejas opcionales, monto y vigencia.

- Sin sorteos ni parejas: alcance general.
- Sorteos seleccionados en súper palé: coincide si cualquiera de los dos pertenece a la selección.
- Parejas seleccionadas: solo esas parejas.
- Si se seleccionan ambos filtros, deben cumplirse ambos.
- Cupo compartido: suma todo lo cubierto por la regla.
- Cupo separado: un saldo por sorteo o pareja.
- Monto cero: bloqueo completo.
- Todas las reglas aplicables se cumplen a la vez; el disponible es el menor saldo.
- Un bloqueo del consorcio no se anula con una excepción de banca.
- Un bloqueo de categoría impide la apuesta completa que participa en ella: no se suprimen premios silenciosamente.
- Reglas sin fechas se aplican diariamente; el consumo se calcula por fecha de venta en República Dominicana.

Los límites de esta versión son de monto apostado. Un control agregado de exposición potencial a premios sería una función adicional, distinta de estos cupos.

## Tickets y resultados

La banca de la pantalla se envía explícitamente y se comprueba contra el contexto autorizado. Una pantalla desactualizada no puede emitir en otra banca. El servidor determina moneda, disponibilidad, cierre, comisión, descuento y tarifa; no acepta los totales calculados por el navegador.

Las ventas, anulaciones y cambios de límites/configuración utilizan transacciones y un bloqueo por consorcio. La clave idempotente impide duplicados por doble clic o reintento. El borrador no reserva cupo. Si una jugada falla, el ticket completo no se emite.

Anular requiere estar dentro del plazo y que no haya cerrado ningún sorteo ni se haya pagado un premio. Una anulación válida libera los cupos. Duplicar carga un nuevo borrador que será validado con las reglas actuales. Pagar registra usuario, fecha e importe, y no vuelve a pagar las mismas líneas.

Las sesiones de sorteo son del mismo día; la interfaz valida apertura anterior al cierre y hora de sorteo posterior o igual al cierre. Se admiten días de semana y suspensiones por fecha. Se almacenan timestamps en UTC y se calcula el día comercial con `America/Santo_Domingo`.

La importación requiere confirmar los resultados. Las correcciones y conflictos quedan auditados en `lottery_audits`. No hay interfaz de conciliación de pagos ya efectuados en esta versión.


## Numeración por consorcio

Los números de operación son independientes para cada consorcio y cada tipo de registro. No se reinician al cambiar de banca o de fecha. Tickets, cajas, movimientos, restricciones y auditorías usan `office_number`, reservado por `OfficeSequence` con bloqueo transaccional y una restricción única por `(office_id, office_number)`.

Los tickets se presentan como `T-000001`, `T-000002`, etc. Dos consorcios pueden tener el mismo número visible; toda consulta debe resolverlo dentro del consorcio y las bancas autorizadas. El código UUID anterior continúa funcionando como localizador y contenido del QR. Las claves primarias internas y las relaciones existentes se conservan: no deben presentarse como folios del negocio.

Los cuadres se identifican en pantalla y PDF por banca, fecha de apertura/cierre y responsables. Su identificador interno se utiliza para consultar e imprimir el cierre exacto, sin protagonismo visual.


## PIN y pago de premios

Cada ticket recibe un PIN aleatorio de seis dígitos, conservando ceros iniciales. Se guarda cifrado y se imprime en el comprobante; una reimpresión conserva el mismo PIN. El QR continúa conteniendo solamente el código del ticket. Listados, consultas, reportes y auditorías no incluyen el PIN. Solo la autorización de impresión lo entrega, con las restricciones de banca y plazo vigentes.

El pago se realiza desde la modal Anular / Pagar de Ventas mediante `POST /lottery/sales/tickets/{code}/pay`. Exige los permisos `lottery.sell` y `lottery.pay` del consorcio activo, banca autorizada, código/referencia y PIN. El endpoint anterior fuera de Ventas se elimina. Cinco intentos incorrectos bloquean durante un minuto los intentos de ese usuario sobre ese ticket; el PIN no se registra en auditorías ni en datos anteriores de formularios. Los pagos siguen exigiendo caja abierta, saldo suficiente y premios pendientes, sin repetir pagos.

Los tickets existentes reciben un PIN al migrar. Los comprobantes emitidos antes del cambio no lo contienen; necesitarán una reimpresión autorizada para disponer del PIN, respetando el plazo configurado. Nunca se permite omitir el PIN para pagar un ticket antiguo.
