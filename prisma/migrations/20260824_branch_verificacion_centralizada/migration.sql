-- Nueva flag Branch.verificacionCentralizada — cuando es true, las
-- transferencias de esa sucursal solo pueden ser verificadas por DG,
-- DC, MC o SUPER_ADMIN (el GZ de la zona queda excluido). Nace del
-- ajuste de Dirección: Veracruz, Minatitlán y Martínez de la Torre
-- las verifica Stephanie (DG) o Carol (MC), no los gerentes locales.
--
-- Backfill: encender la flag en esas 3 sucursales. Las demás quedan
-- en false por default (comportamiento actual: GZ verifica).
-- Idempotente.

ALTER TABLE "Branch"
  ADD COLUMN IF NOT EXISTS "verificacionCentralizada" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Branch"
   SET "verificacionCentralizada" = true
 WHERE nombre ILIKE '%veracruz%'
    OR nombre ILIKE '%minatitl%'
    OR nombre ILIKE '%martinez%torre%'
    OR nombre ILIKE '%martínez%torre%';
