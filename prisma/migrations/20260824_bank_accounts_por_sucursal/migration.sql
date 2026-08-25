-- Tabla puente cuenta-bancaria ↔ sucursal. Una cuenta puede estar
-- asignada a varias sucursales (ej. Ixmel Banorte se usa en 4). Cada
-- sucursal ve en el dropdown solo las cuentas que tiene asignadas.
-- Tenancingo, al ser central, se etiqueta en todas las cuentas de
-- forma explícita.
--
-- Después de esta migración hay que correr el seed de asignaciones
-- (script SQL aparte con INSERTs por (bankAccountId, branchId)).
-- Idempotente.

CREATE TABLE IF NOT EXISTS "BankAccountBranch" (
  "bankAccountId" TEXT NOT NULL,
  "branchId"      TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankAccountBranch_pkey" PRIMARY KEY ("bankAccountId", "branchId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'BankAccountBranch_bankAccountId_fkey'
  ) THEN
    ALTER TABLE "BankAccountBranch"
      ADD CONSTRAINT "BankAccountBranch_bankAccountId_fkey"
      FOREIGN KEY ("bankAccountId") REFERENCES "CompanyBankAccount"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'BankAccountBranch_branchId_fkey'
  ) THEN
    ALTER TABLE "BankAccountBranch"
      ADD CONSTRAINT "BankAccountBranch_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BankAccountBranch_branchId_idx"
  ON "BankAccountBranch"("branchId");
