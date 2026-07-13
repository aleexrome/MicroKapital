-- Migration: BranchExtraFund
-- Run this in Supabase SQL Editor for production.
--
-- Registra aportes adicionales que Dirección envía a una sucursal fuera
-- del ciclo normal de préstamos (ej. "DG mandó $50k extra a Toluca").
-- Se muestra en /banca sumado a los cortes en el "Neto para banca".

CREATE TABLE IF NOT EXISTS "BranchExtraFund" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"   TEXT NOT NULL,
  "branchId"    TEXT NOT NULL,
  fecha         DATE NOT NULL,
  monto         DECIMAL(12, 2) NOT NULL,
  concepto      TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BranchExtraFund_companyId_fkey"   FOREIGN KEY ("companyId")   REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchExtraFund_branchId_fkey"    FOREIGN KEY ("branchId")    REFERENCES "Branch"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BranchExtraFund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BranchExtraFund_branchId_fecha_idx" ON "BranchExtraFund" ("branchId", fecha);
CREATE INDEX IF NOT EXISTS "BranchExtraFund_companyId_fecha_idx" ON "BranchExtraFund" ("companyId", fecha);
