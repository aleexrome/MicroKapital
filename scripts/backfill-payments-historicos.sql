-- =============================================================================
-- Backfill — Payments retroactivos para cobranza histórica
-- =============================================================================
-- Este archivo documenta dos intentos de backfill ejecutados el 2026-04-26
-- después de tightear /rutas para exigir Payment respaldando (commit
-- 7d3106d, PR #27 → main). Pre-fix la cobranza vivía en
-- PaymentSchedule.montoPagado sin Payment, así que las semanas pasadas
-- quedaron en 0%/1% al cambiar la métrica.
--
--   v1 (REVERTIDO) — filtro laxo (estado + montoPagado > 0). Capturó
--                    imports / marcados manuales sin respaldo de caja
--                    e infló las cifras. Se borró completo.
--
--   v2 (ACTIVO)    — filtro vía AuditLog (DG_APPLY_PAYMENT y
--                    DG_APPLY_PAYMENT_GRUPO). Solo respalda los pagos
--                    que la dirección aplicó vía endpoint. Insertó
--                    1,310 Payments por $1,186,350 cubriendo del
--                    11-abr al 26-abr 2026. Pre-11-abr no hay audit
--                    trail — esa cobranza queda como está.
--
-- Going forward: cada cobro nuevo crea Payment automáticamente
-- (apply individual y grupal corregidos en el mismo commit). Estos
-- backfills son one-shot; no deben re-ejecutarse.
--
-- Para revertir el v2 si algo se ve raro:
--     DELETE FROM "Payment" WHERE notas LIKE 'Backfill v2%';
-- =============================================================================


-- =============================================================================
-- v1 — REVERTIDO. NO CORRER.
-- =============================================================================
-- Filtro original (demasiado laxo):
--     WHERE ps.estado IN ('PAID','ADVANCE','PARTIAL')
--       AND ps."montoPagado" > 0
--       AND NOT EXISTS Payment for schedule
--
-- Capturaba imports históricos (Tenancingo / San Mateo Atenco), group
-- applies viejos pre-fix, y marcados manuales sin respaldo de caja.
-- Resultado: 2,588 Payments / $2,566,575 dic-2025 → may-2026, todos
-- inflando la métrica con basura. Rollback: DELETE WHERE notas LIKE
-- 'Backfill: cobranza histórica%'.
--
-- Lección: PaymentSchedule.montoPagado por sí solo NO es señal de
-- cobro real — solo de "alguien tocó este schedule". Para distinguir
-- hay que cruzar con AuditLog (DG aplicó vía endpoint) o con un
-- extracto bancario / caja. Lo segundo solo se puede hacer manual.
-- =============================================================================


-- =============================================================================
-- v2 — EJECUTADO. Backfill selectivo via AuditLog.
-- =============================================================================
-- Pegar en Supabase → SQL Editor. Correr POR BLOQUES, en orden.
-- =============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 0 — Diagnóstico: ¿hay audit logs útiles y para qué período?
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  accion,
  COUNT(*)              AS total_logs,
  MIN("createdAt")      AS desde,
  MAX("createdAt")      AS hasta
FROM "AuditLog"
WHERE accion IN ('DG_APPLY_PAYMENT', 'DG_APPLY_PAYMENT_GRUPO',
                 'SUPER_ADMIN_UNDO_PAYMENT', 'SUPER_ADMIN_UNDO_PAYMENT_GRUPO')
GROUP BY accion
ORDER BY accion;


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 1A — PREVIEW individuales (DG_APPLY_PAYMENT)
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  COUNT(*)               AS schedules,
  SUM(ps."montoPagado")  AS monto_total,
  MIN(al."createdAt")    AS desde,
  MAX(al."createdAt")    AS hasta
FROM "PaymentSchedule" ps
JOIN "Loan" l ON l.id = ps."loanId"
JOIN LATERAL (
  SELECT al2."createdAt"
  FROM "AuditLog" al2
  WHERE al2."registroId" = ps.id
    AND al2.accion = 'DG_APPLY_PAYMENT'
    AND al2.tabla  = 'PaymentSchedule'
  ORDER BY al2."createdAt" DESC
  LIMIT 1
) al ON TRUE
WHERE ps."montoPagado" > 0
  AND ps.estado IN ('PAID', 'ADVANCE', 'PARTIAL')
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."scheduleId" = ps.id);


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 1B — INSERT individuales (954 schedules / $873,550 al 26-abr-2026)
-- ──────────────────────────────────────────────────────────────────────────────

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
  'Backfill v2 (audit DG_APPLY_PAYMENT individual)',
  al."createdAt",
  NOW()
FROM "PaymentSchedule" ps
JOIN "Loan" l ON l.id = ps."loanId"
JOIN LATERAL (
  SELECT al2."createdAt"
  FROM "AuditLog" al2
  WHERE al2."registroId" = ps.id
    AND al2.accion = 'DG_APPLY_PAYMENT'
    AND al2.tabla  = 'PaymentSchedule'
  ORDER BY al2."createdAt" DESC
  LIMIT 1
) al ON TRUE
WHERE ps."montoPagado" > 0
  AND ps.estado IN ('PAID', 'ADVANCE', 'PARTIAL')
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."scheduleId" = ps.id);


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 2A — PREVIEW grupales (DG_APPLY_PAYMENT_GRUPO)
-- ──────────────────────────────────────────────────────────────────────────────
-- Match: groupId (registroId) + numeroPago (valoresNuevos) + pagadoAt
-- dentro de ±10 min del audit timestamp. La ventana descarta imports
-- (pagadoAt = midnight) sin descartar la transacción real del audit.

SELECT
  COUNT(*)               AS schedules,
  SUM(ps."montoPagado")  AS monto_total,
  MIN(al."createdAt")    AS desde,
  MAX(al."createdAt")    AS hasta
FROM "AuditLog" al
JOIN "Loan" l ON l."loanGroupId" = al."registroId"
JOIN "PaymentSchedule" ps ON ps."loanId" = l.id
WHERE al.accion = 'DG_APPLY_PAYMENT_GRUPO'
  AND al.tabla  = 'LoanGroup'
  AND ps."numeroPago" = (al."valoresNuevos"->>'numeroPago')::int
  AND ps."montoPagado" > 0
  AND ps.estado IN ('PAID', 'ADVANCE', 'PARTIAL')
  AND ps."pagadoAt" BETWEEN al."createdAt" - interval '10 minutes'
                        AND al."createdAt" + interval '10 minutes'
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."scheduleId" = ps.id);


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 2B — INSERT grupales (356 schedules / $312,800 al 26-abr-2026)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO "Payment" (
  id, "loanId", "scheduleId", "cobradorId", "clientId",
  monto, "metodoPago", "cambioEntregado", notas, "fechaHora", "createdAt"
)
SELECT
  gen_random_uuid(),
  l.id,
  ps.id,
  l."cobradorId",
  l."clientId",
  ps."montoPagado",
  'TRANSFER'::"PaymentMethod",
  0,
  'Backfill v2 (audit DG_APPLY_PAYMENT_GRUPO)',
  al."createdAt",
  NOW()
FROM "AuditLog" al
JOIN "Loan" l ON l."loanGroupId" = al."registroId"
JOIN "PaymentSchedule" ps ON ps."loanId" = l.id
WHERE al.accion = 'DG_APPLY_PAYMENT_GRUPO'
  AND al.tabla  = 'LoanGroup'
  AND ps."numeroPago" = (al."valoresNuevos"->>'numeroPago')::int
  AND ps."montoPagado" > 0
  AND ps.estado IN ('PAID', 'ADVANCE', 'PARTIAL')
  AND ps."pagadoAt" BETWEEN al."createdAt" - interval '10 minutes'
                        AND al."createdAt" + interval '10 minutes'
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."scheduleId" = ps.id);


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 3 — VERIFICACIÓN
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  CASE
    WHEN notas LIKE '%individual)%' THEN 'individual'
    WHEN notas LIKE '%GRUPO)%'      THEN 'grupal'
  END         AS tipo,
  COUNT(*)    AS total,
  SUM(monto)  AS monto
FROM "Payment"
WHERE notas LIKE 'Backfill v2%'
GROUP BY 1;


-- ──────────────────────────────────────────────────────────────────────────────
-- ROLLBACK v2 (si hace falta)
-- ──────────────────────────────────────────────────────────────────────────────
-- DELETE FROM "Payment" WHERE notas LIKE 'Backfill v2%';
