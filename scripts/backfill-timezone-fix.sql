-- =====================================================================
-- BACKFILL de fechas afectadas por el bug de zona horaria pre-PR #78
-- =====================================================================
--
-- ⚠ NO ejecutar sin haber corrido primero `backfill-timezone-diagnostico.sql`
--   y validado:
--     - Volumen total razonable
--     - Sample visual: las fechas corregidas se ven correctas
--     - Cuántas filas tienen hora exacta 00:00:00 (potencial false-positive
--       si fueron fechas elegidas por el DG vía date input, no `new Date()`
--       automático)
--
-- Estrategia: restar 6 horas a las filas con hora UTC < 06:00 en columnas
-- que representan "fecha calendario CDMX". Esto convierte el instante UTC
-- del servidor al "wall clock" CDMX, dejando la fila en el día calendario
-- correcto cuando se compara con rangos semanales.
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
--   - "PaymentSchedule"."fechaVencimiento"  (calculadas con addDays sobre
--     fechaDesembolso ya corregida — si se quiere normalizar también, se
--     hace en una migración posterior)
-- =====================================================================

BEGIN;

-- ── 1) Loan.fechaDesembolso ──────────────────────────────────────────────
--
-- Descomenta para ejecutar. La query devuelve la cantidad de filas
-- afectadas para verificación contra el SELECT del diagnóstico.

-- UPDATE "Loan"
-- SET "fechaDesembolso" = "fechaDesembolso" - INTERVAL '6 hours'
-- WHERE "fechaDesembolso" IS NOT NULL
--   AND EXTRACT(HOUR FROM "fechaDesembolso") < 6;


-- ── 2) PaymentSchedule.pagadoAt ──────────────────────────────────────────
--
-- Descomenta para ejecutar. Mismo criterio: hora UTC < 06:00 → resta 6h.

-- UPDATE "PaymentSchedule"
-- SET "pagadoAt" = "pagadoAt" - INTERVAL '6 hours'
-- WHERE "pagadoAt" IS NOT NULL
--   AND EXTRACT(HOUR FROM "pagadoAt") < 6;


-- ── Cierre de transacción ────────────────────────────────────────────────
--
-- Cambiar a ROLLBACK; si los cambios se ven mal en una validación post-fix.

COMMIT;
-- ROLLBACK;


-- ── Validación post-fix (correr después de COMMIT en una nueva sesión) ───
--
-- SELECT COUNT(*) AS deben_ser_cero
-- FROM "Loan"
-- WHERE "fechaDesembolso" IS NOT NULL
--   AND EXTRACT(HOUR FROM "fechaDesembolso") < 6;
--
-- SELECT COUNT(*) AS deben_ser_cero
-- FROM "PaymentSchedule"
-- WHERE "pagadoAt" IS NOT NULL
--   AND EXTRACT(HOUR FROM "pagadoAt") < 6;
