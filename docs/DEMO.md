# Datos de prueba de LotoEnlace

Acceso: http://lotoenlace.test/lottery/sales, con el administrador local existente.
Consorcio: **Consorcio de prueba LotoEnlace**. Banca: **PRUEBA-001 — Banca de prueba**.
Moneda: DOP, heredada del consorcio. No se generan tickets al cargar estos datos.

## Catálogo y horarios

Se cargaron 12 loterías y los 37 sorteos de la sección de quinielas de
[El Boleto Ganador](https://elboletoganador.com/), consultada el 20 de octubre de 2026.
La copia reproducible está en `database/data/boletoganador.json`, con nombres, enlaces y horas.
Las horas se interpretan en America/Santo_Domingo (UTC−4), según la publicación de la fuente,
incluidas sus denominaciones para New York, Florida y Pega 3 Más.
Es un catálogo de demostración basado en esa fuente, no una certificación de horarios ni reglas de los operadores.
Los juegos de bolos múltiples como Loto, Kino y Powerball requieren modalidades distintas y no se habilitaron.

Todos se cargan de lunes a domingo. La apertura **06:00** y el cierre **cinco minutos antes del sorteo**
son decisiones de configuración de esta demo, no horarios de venta publicados por la fuente.
Los horarios son editables en Catálogo; los cambios estacionales o especiales no se sincronizan automáticamente.
Las ventas muestran únicamente los sorteos abiertos. No se alteró el reloj para simular sorteos abiertos.
Cada sorteo tiene su enlace y clave de importación; los resultados importados quedan pendientes de confirmación.

## Configuración de demostración

- Límite diario por banca: RD$10,000; total del consorcio: RD$50,000.
- Cancelación: 5 minutos y siempre antes de cerrar cualquier sorteo del ticket.
- Descuento opcional: RD$1 por cada RD$10 jugados.
- Comisión de ejemplo: 10% de lo cobrado después del descuento.
- Premios de ejemplo por peso: quiniela 60/10/5; palé 1–2: 1000, 1–3: 1000, 2–3: 100;
  tripleta tres aciertos: 2000, dos: 100; súper palé 1–1: 3000, 1–2: 300, 1–3: 100.
- Se habilitan las 666 parejas de los 37 sorteos para probar súper palé. En la demo,
  el sorteo con menor identificador es el principal; se puede cambiar en Configuración.
  La selección de dos sorteos requiere que ambos estén abiertos.
- La banca hereda todos estos valores. Las tarifas son ejemplos editables, no tarifas oficiales.

## Casos para revisar

| Jugada | Restricción |
|---|---|
| Quiniela 00 | Bloqueada en todos los sorteos del consorcio |
| Quiniela 10 | RD$100 diarios compartidos entre todos los sorteos y bancas |
| Quiniela 20 | RD$50 diarios compartidos, solo en PRUEBA-001 |
| Quiniela 99 | Bloqueada únicamente en Nacional noche |
| Palé 10-20 | RD$100 diarios por cada sorteo |
| Tripleta 10-20-30 | RD$50 diarios compartidos |
| Súper palé 00-00 | Bloqueo general por categoría 1–1 |
| Súper palé 10-20 | RD$100 compartidos, categoría 1–2, sin restricción de sorteos |
| Súper palé 10-20, Nacional noche + LEIDSA | RD$25 en esta banca, categoría 1–3 |

Las categorías restringen las jugadas cuya tabla contempla ese premio; no esperan el resultado para consumir cupo.
Cuando coinciden varias reglas gana la más restrictiva. Los cupos se consumen por monto jugado, antes del descuento.
Las reglas no caducan, pero sus consumos se reinician cada día de RD. Puedes agregar fechas desde Bloqueos y límites.

Ejemplo: vende RD$40 al 10 con descuento. Se cobran RD$36, la comisión es RD$3.60 y quedan RD$60 de cupo.
Una segunda venta de RD$61 al 10 debe rechazarse. Anular dentro del plazo libera el cupo.
Para una venta sin restricciones específicas, prueba quiniela 12 (sujeta a los límites diarios).

## Repetir la carga

Ejecutar `php artisan db:seed --class=LotteryDemoSeeder` con el PHP de Herd.
El seeder solo admite entornos local/testing. No se ejecuta con el seeder normal.
Repetirlo no duplica registros ni restablece cambios posteriores de horarios, tarifas o bloqueos.
La impresión continúa pendiente.
