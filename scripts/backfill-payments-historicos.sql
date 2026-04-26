-- =============================================================================
-- Backfill — Payments retroactivos para cobranza histórica
-- =============================================================================
-- Contexto:
-- Hasta el commit que introduce este backfill, los endpoints `apply` (DG /
-- op. admin) marcaban `PaymentSchedule` como PAID/ADVANCE/PARTIAL pero NO
-- creaban un registro `Payment`. La métrica de "Cobranza efectiva" en
-- /rutas se basaba en el estado del schedule, así que esos cobros se
-- contaban aunque no existiera Payment respaldando.
--
-- Tras tightear la métrica para exigir Payment respaldando (commit
-- 7d3106d), las semanas pasadas quedaron en 0%/1% porque toda la cobranza
-- histórica vivía solo en `PaymentSchedule.montoPagado`. Este script
-- crea un `Payment` por cada schedule huérfano para que la cobranza
-- histórica vuelva a verse.
--
-- Pegar en Supabase → SQL Editor. Correr POR BLOQUES, en orden.
-- =============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 1 — PREVIEW: cuántos schedules respaldaríamos y por qué monto
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  COUNT(*)                AS schedules_a_respaldar,
  SUM(ps."montoPagado")   AS monto_total_a_respaldar,
  MIN(ps."pagadoAt")      AS desde,
  MAX(ps."pagadoAt")      AS hasta
FROM "PaymentSchedule" ps
JOIN "Loan"   l ON l.id = ps."loanId"
JOIN "User"   u ON u.id = l."cobradorId"
JOIN "Client" c ON c.id = l."clientId"
WHERE ps.estado IN ('PAID', 'ADVANCE', 'PARTIAL')
  AND ps."montoPagado" > 0
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."scheduleId" = ps.id);

-- ⬆️ Validar que el conteo y el monto cuadran con lo esperado antes de
--    pasar al BLOQUE 2.


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 2 — BACKFILL: crear los Payments retroactivos
-- ──────────────────────────────────────────────────────────────────────────────
-- Estrategia:
-- 1) Un Payment por schedule, monto = ps.montoPagado (lo que estaba
--    registrado).
-- 2) metodoPago = TRANSFER por default (la mayoría fueron pagos aplicados
--    por dirección registrando depósitos).
-- 3) fechaHora = ps.pagadoAt para que la cobranza efectiva quede en la
--    semana correcta.
-- 4) `notas` con prefijo "Backfill: ..." para poder identificarlos /
--    revertirlos en el futuro.
-- NO se actualiza CashRegister histórico — la caja del pasado queda como
-- estaba; solo la métrica de cobranza efectiva se recupera.

INSERT INTO "Payment" (
  id, "loanId", "scheduleId", "cobradorId", "clientId",
  monto, "metodoPago", "cambioEntregado", notas, "fechaHora", "createdAt"
)
SELECT
  gen_random_uuid(),
  ps."loanId",
  ps.id,
  l."cobradorId",
  l."clientId",
  ps."montoPagado",
  'TRANSFER'::"PaymentMethod",
  0,
  'Backfill: cobranza histórica antes del fix de Payment respaldado',
  COALESCE(ps."pagadoAt", NOW()),
  NOW()
FROM "PaymentSchedule" ps
JOIN "Loan"   l ON l.id = ps."loanId"
JOIN "User"   u ON u.id = l."cobradorId"
JOIN "Client" c ON c.id = l."clientId"
WHERE ps.estado IN ('PAID', 'ADVANCE', 'PARTIAL')
  AND ps."montoPagado" > 0
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."scheduleId" = ps.id);


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 3 — VERIFICACIÓN: confirmar que los Payments existen y no quedan
--           huérfanos
-- ──────────────────────────────────────────────────────────────────────────────

SELECT COUNT(*)             AS payments_backfill,
       SUM(monto)           AS monto_backfill,
       MIN("fechaHora")     AS desde,
       MAX("fechaHora")     AS hasta
FROM "Payment"
WHERE notas LIKE 'Backfill: cobranza histórica%';

-- Debe dar 0 — todo schedule cobrado ya tiene su Payment.
SELECT COUNT(*) AS huerfanos_restantes
FROM "PaymentSchedule" ps
WHERE ps.estado IN ('PAID', 'ADVANCE', 'PARTIAL')
  AND ps."montoPagado" > 0
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."scheduleId" = ps.id);


-- ──────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (si hace falta) — borrar los Payments creados por este script
-- ──────────────────────────────────────────────────────────────────────────────
-- DELETE FROM "Payment" WHERE notas LIKE 'Backfill: cobranza histórica%';
