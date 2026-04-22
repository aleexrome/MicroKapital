-- One-off fix: LAS ELOTITAS — San Mateo Atenco (Ciclo 04)
--
-- Context: the 5 SOLIDARIO loans of cycle 04 (disbursed 2026-04-14) were
-- created with loanGroupId = NULL instead of being attached to the real
-- group "LAS ELOTITAS" (id a29a2bd0-..44c8, created 2026-04-12).
--
-- A second row for "LAS ELOTITAS" exists (id 95ab9dab-..f50c, created
-- 2026-04-13) holding 5 REJECTED loan applications from the same clients
-- for higher amounts. That row is INTENTIONALLY left untouched to
-- preserve audit history; the duplication is an artifact of the new-loan
-- flow and will be addressed separately (unique constraint + group
-- selector in the form).
--
-- This script only attaches the 5 ACTIVE loans of cycle 04 to a29a2bd0.
-- It does not modify capital, tasa, pagoSemanal, PaymentSchedule,
-- LIQUIDATED loans from the previous cycle, REJECTED applications, nor
-- ROCIO's INDIVIDUAL loan.

BEGIN;

UPDATE "Loan"
SET "loanGroupId" = 'a29a2bd0-f322-456e-bc32-d413eeff44c8'
WHERE "id" IN (
  'b7323e71-f288-41f3-a60e-9b8011a749e9',  -- NICOLASA HERAZ CASTAÑEDA       $10,000
  '04795b7d-d1d2-4aab-9d2a-daed972f7475',  -- MARIA FERNANDA DE JESUS ROBLES $10,000
  'df5ce4f9-0371-4b92-85db-2757178e1107',  -- JUAN JOEL DE JESUS ROBLES      $12,000
  '7261a03c-ffb4-4584-985e-7951511f11df',  -- YANET IRENE CASTAÑEDA          $10,000
  '12023f75-b94c-45d8-af9b-2b103cecee7b'   -- ROCIO ROBLES PEREZ (SOLIDARIO) $10,000
)
AND "tipo" = 'SOLIDARIO'
AND "estado" = 'ACTIVE'
AND "loanGroupId" IS NULL;

-- Verification: should show 5 LIQUIDATED (previous cycle) + 5 ACTIVE (cycle 04)
SELECT c."nombreCompleto", l."tipo", l."estado", l."capital", l."fechaDesembolso"
FROM "Loan" l
JOIN "Client" c ON c."id" = l."clientId"
WHERE l."loanGroupId" = 'a29a2bd0-f322-456e-bc32-d413eeff44c8'
ORDER BY l."fechaDesembolso" DESC NULLS LAST, c."nombreCompleto";

COMMIT;
