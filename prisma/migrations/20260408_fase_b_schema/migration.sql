-- ============================================================
-- FASE B: Migración de schema — MicroKapital
-- Ejecutar en: Supabase SQL Editor
-- Orden: ejecutar completo de una sola vez
-- ============================================================

-- 1. Nuevos valores en enum UserRole
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DIRECTOR_GENERAL';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DIRECTOR_COMERCIAL';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GERENTE_ZONAL';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COORDINADOR';

-- 2. Nuevo tipo de préstamo
ALTER TYPE "LoanType" ADD VALUE IF NOT EXISTS 'FIDUCIARIO';

-- 3. Nuevo método de pago
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'TRANSFER';

-- 4. Nuevos campos en tabla Loan
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "pagoQuincenal"       DECIMAL(12,2);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "ciclo"               INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "tuvoAtraso"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "clienteIrregular"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "tipoGrupo"           TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "tipoGarantia"        TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "descripcionGarantia" TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "valorGarantia"       DECIMAL(12,2);

-- 5. Tabla de cuentas bancarias de la empresa
CREATE TABLE IF NOT EXISTS "CompanyBankAccount" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "banco"        TEXT NOT NULL,
  "titular"      TEXT NOT NULL,
  "numeroCuenta" TEXT NOT NULL,
  "clabe"        TEXT NOT NULL,
  "activa"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CompanyBankAccount"
  ADD CONSTRAINT IF NOT EXISTS "CompanyBankAccount_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Nuevos campos en tabla Payment (transferencias)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cuentaDestinoId"     TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "idTransferencia"     TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "statusTransferencia" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "verificadoPorId"     TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "verificadoAt"        TIMESTAMP(3);

-- FK de Payment a CompanyBankAccount
ALTER TABLE "Payment"
  ADD CONSTRAINT IF NOT EXISTS "Payment_cuentaDestinoId_fkey"
  FOREIGN KEY ("cuentaDestinoId") REFERENCES "CompanyBankAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK de Payment a User (verificadoPor)
ALTER TABLE "Payment"
  ADD CONSTRAINT IF NOT EXISTS "Payment_verificadoPorId_fkey"
  FOREIGN KEY ("verificadoPorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Nuevo campo en CashRegister para transferencias
ALTER TABLE "CashRegister"
  ADD COLUMN IF NOT EXISTS "cobradoTransferencia" DECIMAL(12,2) NOT NULL DEFAULT 0;
