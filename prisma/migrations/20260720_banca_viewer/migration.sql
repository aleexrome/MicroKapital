-- Permiso de solo lectura a /banca por sucursal para usuarios que no son
-- DG/DC. Se guarda como FK nullable al Branch — si está seteado, ese
-- user puede ver /banca filtrado a esa sucursal (sin poder crear
-- adicionales ni retiros).

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "bancaViewerBranchId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_bancaViewerBranchId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_bancaViewerBranchId_fkey"
      FOREIGN KEY ("bancaViewerBranchId") REFERENCES "Branch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_bancaViewerBranchId_idx" ON "User" ("bancaViewerBranchId");
