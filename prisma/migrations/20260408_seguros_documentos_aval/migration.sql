-- Migration: seguros, documentos de crédito y datos de aval
-- Run this in Supabase SQL Editor for production

-- Seguro de apertura en Loan
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "seguro" DECIMAL(12,2);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "seguroMetodoPago" TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "seguroPendiente" BOOLEAN NOT NULL DEFAULT false;

-- Aval (garantía personal)
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "avalNombre" TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "avalTelefono" TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "avalRelacion" TEXT;

-- Tabla de documentos adjuntos al crédito
CREATE TABLE IF NOT EXISTS "LoanDocument" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "subidoPor" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "archivoUrl" TEXT NOT NULL,
  "descripcion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoanDocument_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'LoanDocument_loanId_fkey'
  ) THEN
    ALTER TABLE "LoanDocument" ADD CONSTRAINT "LoanDocument_loanId_fkey"
      FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'LoanDocument_subidoPor_fkey'
  ) THEN
    ALTER TABLE "LoanDocument" ADD CONSTRAINT "LoanDocument_subidoPor_fkey"
      FOREIGN KEY ("subidoPor") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
