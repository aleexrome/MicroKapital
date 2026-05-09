-- =====================================================================
-- BACKFILL de fechas afectadas por el bug de zona horaria pre-PR #78
-- (versión ajustada — excluye filas con hora exacta 00:00:00.000)
-- =====================================================================
--
-- ⚠ NO ejecutar sin haber corrido primero `backfill-timezone-diagnostico.sql`
--   y validado los volúmenes contra la estimación esperada.
--
-- Estrategia: restar 6 horas a las filas con hora UTC < 06:00 en columnas
-- que representan "fecha calendario CDMX". Esto convierte el instante UTC
-- del servidor al "wall clock" CDMX, dejando la fila en el día calendario
-- correcto cuando se compara con rangos semanales.
--
-- ⚠ EXCLUSIÓN CRÍTICA — filas con hora exacta 00:00:00.000:
--   - Para Loan.fechaDesembolso (387 filas): provienen del DG aprobando con
--     una fecha "YYYY-MM-DD" en `approve/route.ts:95` (`new Date(fecha)`).
--     Son input manual, NO son del bug `new Date()` automático.
--   - Para PaymentSchedule.pagadoAt (1526 filas): generados al crear
--     calendario con fechas calendario puras (no instante UTC).
--   Restarles 6h corromperia el día calendario que el DG eligió.
--
-- Volumen esperado tras el filtro ajustado:
--   - Loan.fechaDesembolso:        23 filas a corregir
--   - PaymentSchedule.pagadoAt:   318 filas a corregir
--   ─────────────────────────────────
--   - TOTAL:                      341 registros corregidos
--
-- IDEMPOTENTE: tras restar 6h, las filas afectadas quedan con hora 18:00–23:59
-- UTC del día anterior, fuera del filtro `EXTRACT(HOUR ...) < 6`. Re-correr
-- el script no afecta nada nuevo.
--
-- TODO el script corre en una sola transacción. Si algo se ve mal después
-- de los UPDATE, cambia COMMIT por ROLLBACK al final.
--
-- Columnas tocadas:
--   - "Loan"."fechaDesembolso"
--   - "PaymentSchedule"."pagadoAt"
--
-- Columnas NO tocadas (timestamps universales, no representan calendario CDMX):
--   - "Payment"."fechaHora"
--   - "Loan"."aprobadoAt", "revisadoAt", "verificadoAt", "activationStartedAt"
--   - "PaymentSchedule"."fechaVencimiento"
-- =====================================================================

BEGIN;

-- ── 1) Loan.fechaDesembolso ──────────────────────────────────────────────
--
-- Filtro: hora UTC < 06:00 (= 18:00–23:59 CDMX día anterior, ventana del
-- bug `new Date()`) AND NOT hora exacta 00:00:00.000 (input manual del DG).
-- Esperado: 23 filas afectadas.

UPDATE "Loan"
SET "fechaDesembolso" = "fechaDesembolso" - INTERVAL '6 hours'
WHERE "fechaDesembolso" IS NOT NULL
  AND EXTRACT(HOUR FROM "fechaDesembolso") < 6
  AND NOT (
    EXTRACT(HOUR        FROM "fechaDesembolso") = 0
    AND EXTRACT(MINUTE  FROM "fechaDesembolso") = 0
    AND EXTRACT(SECOND  FROM "fechaDesembolso") = 0
    AND EXTRACT(MILLISECONDS FROM "fechaDesembolso") = 0
  );


-- ── 2) PaymentSchedule.pagadoAt ──────────────────────────────────────────
--
-- Mismo filtro, misma exclusión.
-- Esperado: 318 filas afectadas.

UPDATE "PaymentSchedule"
SET "pagadoAt" = "pagadoAt" - INTERVAL '6 hours'
WHERE "pagadoAt" IS NOT NULL
  AND EXTRACT(HOUR FROM "pagadoAt") < 6
  AND NOT (
    EXTRACT(HOUR        FROM "pagadoAt") = 0
    AND EXTRACT(MINUTE  FROM "pagadoAt") = 0
    AND EXTRACT(SECOND  FROM "pagadoAt") = 0
    AND EXTRACT(MILLISECONDS FROM "pagadoAt") = 0
  );


-- ── Cierre de transacción ────────────────────────────────────────────────
--
-- Cambiar a ROLLBACK; si los conteos del bloque de validación no coinciden
-- con lo esperado.

COMMIT;
-- ROLLBACK;


-- =====================================================================
-- VALIDACIÓN POST-FIX
-- =====================================================================
-- Correr DESPUÉS del COMMIT, en una nueva sesión. Las primeras dos queries
-- deben dar 0; las dos siguientes deben coincidir con los conteos del DG
-- (hora exacta 00:00:00) que NO se tocaron.

-- 1. Loan corregidos restantes (debe ser 0)
SELECT COUNT(*) AS loans_pendientes_de_corregir_debe_ser_0
FROM "Loan"
WHERE "fechaDesembolso" IS NOT NULL
  AND EXTRACT(HOUR FROM "fechaDesembolso") < 6
  AND NOT (
    EXTRACT(HOUR        FROM "fechaDesembolso") = 0
    AND EXTRACT(MINUTE  FROM "fechaDesembolso") = 0
    AND EXTRACT(SECOND  FROM "fechaDesembolso") = 0
    AND EXTRACT(MILLISECONDS FROM "fechaDesembolso") = 0
  );

-- 2. PaymentSchedule corregidos restantes (debe ser 0)
SELECT COUNT(*) AS schedules_pendientes_de_corregir_debe_ser_0
FROM "PaymentSchedule"
WHERE "pagadoAt" IS NOT NULL
  AND EXTRACT(HOUR FROM "pagadoAt") < 6
  AND NOT (
    EXTRACT(HOUR        FROM "pagadoAt") = 0
    AND EXTRACT(MINUTE  FROM "pagadoAt") = 0
    AND EXTRACT(SECOND  FROM "pagadoAt") = 0
    AND EXTRACT(MILLISECONDS FROM "pagadoAt") = 0
  );

-- 3. Loan con hora 00:00:00.000 intactos (debe ser 387)
SELECT COUNT(*) AS loans_input_manual_intactos_debe_ser_387
FROM "Loan"
WHERE "fechaDesembolso" IS NOT NULL
  AND "fechaDesembolso"::time = '00:00:00';

-- 4. PaymentSchedule con hora 00:00:00.000 intactos (debe ser 1526)
SELECT COUNT(*) AS schedules_calendario_puro_intactos_debe_ser_1526
FROM "PaymentSchedule"
WHERE "pagadoAt" IS NOT NULL
  AND "pagadoAt"::time = '00:00:00';
