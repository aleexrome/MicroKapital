-- One-off fix: LAS ELOTITAS — San Mateo Atenco
-- Links the 5 SOLIDARIO loans (2026-04-14) to the kept group and deletes the
-- duplicate empty group. Does NOT touch capital, tasa, pagoSemanal, or
-- PaymentSchedule. Safe to run once in Supabase SQL editor.
--
-- Equivalent to scripts/fix-elotitas-grouping.ts

BEGIN;

-- 1. Link the 5 SOLIDARIO loans to the group we keep
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

-- 2. Verify the duplicate has no loans, then delete it
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM "Loan"
  WHERE "loanGroupId" = '95ab9dab-b974-447c-b2c7-ddf40591f50c';

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Cannot delete duplicate group: % loans still reference it', remaining;
  END IF;
END $$;

DELETE FROM "LoanGroup"
WHERE "id" = '95ab9dab-b974-447c-b2c7-ddf40591f50c';

-- 3. Verification (review before committing)
SELECT l."id", c."nombreCompleto", l."tipo", l."capital", l."pagoSemanal", l."loanGroupId"
FROM "Loan" l
JOIN "Client" c ON c."id" = l."clientId"
WHERE l."loanGroupId" = 'a29a2bd0-f322-456e-bc32-d413eeff44c8'
ORDER BY c."nombreCompleto";

COMMIT;
