-- =============================================================================
-- Ajuste de pago semanal — AMANDA GONZALEZ NUÑEZ (Sucursal Tenancingo)
-- =============================================================================
-- Pago semanal en BD = 3,900 / Pactado correcto = 3,500
-- (Capital 20,000 + Interés 8,000) = K+I 28,000 / 8 semanas = 3,500 ✓
--
-- Pegar en Supabase → SQL Editor. Correr POR BLOQUES, en orden.
-- =============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 1 — PREVIEW: localizar el préstamo y revisar los valores actuales
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  l.id                          AS loan_id,
  c."nombreCompleto"            AS cliente,
  b.nombre                      AS sucursal,
  u.nombre                      AS cobrador_o_gerente,
  l.estado,
  l.tipo,
  l.plazo,
  l.capital,
  l.interes,
  l."totalPago",
  l."pagoSemanal"               AS pago_semanal_actual,
  3500::numeric                 AS pago_semanal_objetivo,
  (l."totalPago" - (3500 * l.plazo)) AS dif_total_vs_objetivo
FROM "Loan" l
JOIN "Client" c ON c.id = l."clientId"
JOIN "Branch" b ON b.id = l."branchId"
JOIN "User"   u ON u.id = l."cobradorId"
WHERE c."nombreCompleto" ILIKE '%AMANDA%GONZ%LEZ%NU%EZ%'
  AND b.nombre           ILIKE '%TENANCINGO%'
  AND l.estado IN ('ACTIVE','PENDING_APPROVAL')
ORDER BY l."createdAt" DESC;

-- ⬆️ Copiar el `loan_id` que se va a corregir y reemplazar abajo en :LOAN_ID.
--   Si aparecen varios, verificar cuál es el correcto antes de seguir.


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 2 — DETALLE DE SCHEDULES: ver cada pago programado
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  ps."numeroPago"                       AS pago,
  ps."fechaVencimiento"::date           AS vence,
  ps."montoEsperado",
  ps."montoPagado",
  ps.estado
FROM "PaymentSchedule" ps
WHERE ps."loanId" = ':LOAN_ID'
ORDER BY ps."numeroPago";


-- ──────────────────────────────────────────────────────────────────────────────
-- BLOQUE 3 — UPDATE (transaccional): correr SOLO después de verificar arriba
-- ──────────────────────────────────────────────────────────────────────────────
-- Estrategia:
-- 1) Loan.pagoSemanal: 3900 → 3500
-- 2) Loan.totalPago: igualar a (3500 * plazo) si quedó inflado por el error
--    (revisar el valor actual en el preview; el cambio solo aplica si el
--    totalPago vigente coincide con el cálculo viejo de 3900*plazo).
-- 3) PaymentSchedule.montoEsperado: solo cuotas NO PAGADAS (PENDING / OVERDUE
--    / PARTIAL). Las cuotas con estado PAID se respetan — si alguien ya pagó
--    3,900 hay que conciliarlo manualmente con un Payment de ajuste.

BEGIN;

UPDATE "Loan"
SET "pagoSemanal" = 3500
WHERE id = ':LOAN_ID'
  AND "pagoSemanal" = 3900;

UPDATE "Loan"
SET "totalPago" = 3500 * plazo
WHERE id = ':LOAN_ID'
  AND "totalPago" = 3900 * plazo;

UPDATE "PaymentSchedule"
SET "montoEsperado" = 3500
WHERE "loanId" = ':LOAN_ID'
  AND "montoEsperado" = 3900
  AND estado IN ('PENDING','OVERDUE','PARTIAL');

-- ⚠️ Revisar la verificación de abajo ANTES de hacer COMMIT.
--   Si algo no cuadra, ejecutar `ROLLBACK;` en lugar de `COMMIT;`.

SELECT
  l."pagoSemanal"                                                 AS nuevo_pago_semanal,
  l."totalPago"                                                   AS nuevo_total_pago,
  (SELECT count(*) FROM "PaymentSchedule" WHERE "loanId" = l.id AND "montoEsperado" = 3500) AS cuotas_a_3500,
  (SELECT count(*) FROM "PaymentSchedule" WHERE "loanId" = l.id AND "montoEsperado" = 3900) AS cuotas_aun_a_3900,
  (SELECT count(*) FROM "PaymentSchedule" WHERE "loanId" = l.id AND estado = 'PAID')        AS cuotas_pagadas
FROM "Loan" l
WHERE l.id = ':LOAN_ID';

COMMIT;
-- ROLLBACK;  -- usar este si la verificación no cuadra
