-- Migration: MoraCobro
-- Registro de multas ($200 después de 2 PM del día) y moras ($500 en día
-- posterior) generadas por retraso en el pago. No bloquea nada — solo se
-- contabiliza y opcionalmente se cobra al capturar el pago principal.

CREATE TABLE IF NOT EXISTS "MoraCobro" (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId"       TEXT NOT NULL,
  "branchId"        TEXT NOT NULL,
  "loanId"          TEXT NOT NULL,
  "scheduleId"      TEXT NOT NULL,
  "clientId"        TEXT NOT NULL,
  "cobradorId"      TEXT NOT NULL,
  tipo              TEXT NOT NULL,                    -- 'MULTA' | 'MORA'
  monto             DECIMAL(12, 2) NOT NULL,
  "paymentOrigenId" TEXT NOT NULL,
  "paymentCobroId"  TEXT UNIQUE,
  cobrada           BOOLEAN NOT NULL DEFAULT false,
  "cobradaAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoraCobro_companyId_fkey"       FOREIGN KEY ("companyId")       REFERENCES "Company"("id")         ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MoraCobro_branchId_fkey"        FOREIGN KEY ("branchId")        REFERENCES "Branch"("id")          ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MoraCobro_loanId_fkey"          FOREIGN KEY ("loanId")          REFERENCES "Loan"("id")            ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "MoraCobro_scheduleId_fkey"      FOREIGN KEY ("scheduleId")      REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "MoraCobro_clientId_fkey"        FOREIGN KEY ("clientId")        REFERENCES "Client"("id")          ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MoraCobro_cobradorId_fkey"      FOREIGN KEY ("cobradorId")      REFERENCES "User"("id")            ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MoraCobro_paymentOrigenId_fkey" FOREIGN KEY ("paymentOrigenId") REFERENCES "Payment"("id")         ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "MoraCobro_paymentCobroId_fkey"  FOREIGN KEY ("paymentCobroId")  REFERENCES "Payment"("id")         ON DELETE SET NULL ON UPDATE CASCADE
);

-- Una sola multa/mora por schedule (no acumular).
CREATE UNIQUE INDEX IF NOT EXISTS "MoraCobro_scheduleId_uidx"      ON "MoraCobro" ("scheduleId");
-- Una multa/mora por Payment origen — evita duplicados si el registro
-- de pago se reintenta.
CREATE UNIQUE INDEX IF NOT EXISTS "MoraCobro_paymentOrigenId_uidx" ON "MoraCobro" ("paymentOrigenId");

-- Índices para reportes y dashboards.
CREATE INDEX IF NOT EXISTS "MoraCobro_companyId_createdAt_idx"  ON "MoraCobro" ("companyId",  "createdAt");
CREATE INDEX IF NOT EXISTS "MoraCobro_branchId_createdAt_idx"   ON "MoraCobro" ("branchId",   "createdAt");
CREATE INDEX IF NOT EXISTS "MoraCobro_cobradorId_createdAt_idx" ON "MoraCobro" ("cobradorId", "createdAt");
CREATE INDEX IF NOT EXISTS "MoraCobro_loanId_idx"               ON "MoraCobro" ("loanId");
