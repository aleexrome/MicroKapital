-- Migration: BranchWithdrawal
-- Retiros de recurso que Dirección hace desde una sucursal — espejo
-- negativo de BranchExtraFund. Se resta del "Neto para banca" en /banca.

CREATE TABLE IF NOT EXISTS "BranchWithdrawal" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"   TEXT NOT NULL,
  "branchId"    TEXT NOT NULL,
  fecha         DATE NOT NULL,
  monto         DECIMAL(12, 2) NOT NULL,
  concepto      TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BranchWithdrawal_companyId_fkey"   FOREIGN KEY ("companyId")   REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchWithdrawal_branchId_fkey"    FOREIGN KEY ("branchId")    REFERENCES "Branch"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchWithdrawal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BranchWithdrawal_branchId_fecha_idx"  ON "BranchWithdrawal" ("branchId", fecha);
CREATE INDEX IF NOT EXISTS "BranchWithdrawal_companyId_fecha_idx" ON "BranchWithdrawal" ("companyId", fecha);
