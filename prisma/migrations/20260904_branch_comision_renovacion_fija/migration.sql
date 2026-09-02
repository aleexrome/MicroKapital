-- BranchContractConfig.comisionRenovacionFija: override por sucursal
-- para la comision INDIVIDUAL en renovaciones. NULL = usar la regla
-- global (ciclos 2/3+ = 7%). Fraccion 0..1, ej. 0.10 = 10%.
--
-- Veracruz mantiene 10% permanente en todas las renovaciones (ciclos
-- 2, 3, 4...) por peticion de Direccion — este seed la activa.
-- Idempotente.

ALTER TABLE "BranchContractConfig"
  ADD COLUMN IF NOT EXISTS "comisionRenovacionFija" DECIMAL(5, 4);

UPDATE "BranchContractConfig" bcc
   SET "comisionRenovacionFija" = 0.1000
  FROM "Branch" b
 WHERE b.id = bcc."branchId"
   AND b.nombre ILIKE '%veracruz%'
   AND bcc."comisionRenovacionFija" IS NULL;
