-- =============================================================================
-- Backfill — Payments retroactivos para cobranza histórica
-- =============================================================================
-- ⚠️  EJECUTADO Y REVERTIDO. NO CORRER TAL CUAL.
--
-- Se ejecutó el 2026-04-26 → creó 2,588 Payments por $2,566,575 cubriendo
-- de dic 2025 a may 2026, intentando "recuperar" la cobranza histórica
-- que quedó invisible al tightear /rutas para exigir Payment respaldando
-- (commit 7d3106d).
--
-- Se revirtió ese mismo día porque el filtro
--     ps.estado IN ('PAID','ADVANCE','PARTIAL') AND ps.montoPagado > 0
-- era demasiado laxo: capturó schedules marcados como pagados por imports
-- históricos (Tenancingo / San Mateo Atenco), por group-apply viejos sin
-- captura real, y por marcados manuales no respaldados por movimiento de
-- caja. Convirtió toda esa basura en "cobranza", inflando los indicadores
-- (caso testigo: Miguel Ángel salía con cobros que DG confirmó = $0
-- reales).
--
-- Rollback ejecutado:
--     DELETE FROM "Payment" WHERE notas LIKE 'Backfill: cobranza histórica%';
--
-- Lección: para reintentar un backfill correctamente habría que
-- distinguir, schedule por schedule, qué fue cobro real vs. qué fue
-- marcado-como-pagado-pero-sin-respaldo. La data histórica no lo permite
-- de forma automática — requiere reconstruir contra extractos de caja /
-- movimientos bancarios reales. Hasta que eso ocurra, las métricas
-- históricas se quedan bajas y eso es la verdad.
--
-- Se conserva el SQL como referencia (preview, INSERT, rollback). NO
-- ejecutar tal cual sin ajustar el filtro.
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
