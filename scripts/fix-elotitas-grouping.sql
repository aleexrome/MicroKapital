-- One-off fix: LAS ELOTITAS — San Mateo Atenco (Ciclo 04)
--
-- Two steps applied in sequence to leave the group view clean:
--
-- 1. ATTACH the 5 SOLIDARIO loans of cycle 04 (disbursed 2026-04-14) to
--    group a29a2bd0 — they had been created with loanGroupId = NULL.
--
-- 2. DETACH the 5 LIQUIDATED loans from the previous cycle (on the same
--    group) to avoid showing each client twice in
--    /grupos/[groupId] "Calendarios por integrante". The LIQUIDATED
--    loans themselves are preserved intact (capital, schedule, payments,
--    tickets); only their loanGroupId is cleared. The coordinator will
--    apply the "renovación anticipada" discount offline since the app
--    has no UI to edit amounts on an existing loan.
--
-- NOT touched:
--   - The duplicate group 95ab9dab (holds 5 REJECTED applications from
--     the same clients for higher amounts). Preserved for audit.
--   - ROCIO's INDIVIDUAL loan (2025-11-27).
--   - Capital, tasa, pagoSemanal, PaymentSchedule, Payment, Ticket,
--     LoanApproval, ScoreEvent — nothing else is modified.

BEGIN;

-- 1. Attach cycle 04 ACTIVE loans to the real group
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

-- 2. Detach previous-cycle LIQUIDATED loans from the group (UI cleanup)
UPDATE "Loan"
SET "loanGroupId" = NULL
WHERE "id" IN (
  '49c86d22-f314-46e5-8927-10315cd3cbd1',  -- NICOLASA HERAZ CASTAÑEDA       LIQUIDATED  $8,000
  '126ebdc8-2dbb-4a4a-9db1-48b2cb37b39d',  -- MARIA FERNANDA DE JESUS ROBLES LIQUIDATED  $8,000
  'a97b9f5d-cdff-4d2d-9584-c30f6271103b',  -- JUAN JOEL DE JESUS ROBLES      LIQUIDATED  $10,000
  'bd12c751-e44e-4304-81e1-f7eaad2b71bb',  -- YANET IRENE CASTAÑEDA          LIQUIDATED  $10,000
  'bc27eeec-e4b6-4f73-a0de-e3a1a779d2c0'   -- ROCIO ROBLES PEREZ             LIQUIDATED  $6,000
)
AND "estado" = 'LIQUIDATED'
AND "loanGroupId" = 'a29a2bd0-f322-456e-bc32-d413eeff44c8';

-- Verification: the group should now hold only the 5 ACTIVE loans of cycle 04
SELECT c."nombreCompleto", l."tipo", l."estado", l."capital", l."fechaDesembolso"
FROM "Loan" l
JOIN "Client" c ON c."id" = l."clientId"
WHERE l."loanGroupId" = 'a29a2bd0-f322-456e-bc32-d413eeff44c8'
ORDER BY c."nombreCompleto";

COMMIT;
