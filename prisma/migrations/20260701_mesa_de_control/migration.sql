-- Migration: Mesa de Control — figura intermedia entre coordinador y DG.
-- Run this in Supabase SQL Editor for production.
--
-- Cambios:
--   1. UserRole enum: valor nuevo MESA_CONTROL.
--   2. LoanStatus enum: valores nuevos PENDING_REVIEW y RETURNED_TO_COORDINATOR.
--      El estado inicial de las solicitudes creadas pasa a ser PENDING_REVIEW
--      (código lo maneja); las que ya están en PENDING_APPROVAL cuando corras
--      la migración NO se mueven — siguen su camino directo al DG.
--   3. Loan: revisionNotasGenerales, revisadoPorId, revisadoAt.
--   4. LoanDocument y ClientDocument: revisionNota, revisadoAt (observación
--      libre que Mesa de Control marca por documento del expediente).

-- Postgres exige ALTER TYPE ADD VALUE en transacción propia; ejecutamos cada
-- uno de forma idempotente.
ALTER TYPE "UserRole"   ADD VALUE IF NOT EXISTS 'MESA_CONTROL';
ALTER TYPE "LoanStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "LoanStatus" ADD VALUE IF NOT EXISTS 'RETURNED_TO_COORDINATOR';

-- Campos de revisión a nivel préstamo
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "revisionNotasGenerales" TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "revisadoPorId"          TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "revisadoAt"             TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Loan_revisadoPorId_fkey'
  ) THEN
    ALTER TABLE "Loan"
      ADD CONSTRAINT "Loan_revisadoPorId_fkey"
      FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Observaciones por documento (LoanDocument)
ALTER TABLE "LoanDocument"   ADD COLUMN IF NOT EXISTS "revisionNota" TEXT;
ALTER TABLE "LoanDocument"   ADD COLUMN IF NOT EXISTS "revisadoAt"   TIMESTAMP(3);

-- Observaciones por documento (ClientDocument)
ALTER TABLE "ClientDocument" ADD COLUMN IF NOT EXISTS "revisionNota" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN IF NOT EXISTS "revisadoAt"   TIMESTAMP(3);
