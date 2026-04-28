-- Metas semanales (Goal) para módulo de Reportes / Cumplimiento.
-- Las define Dirección General o Dirección Comercial. Granularidad
-- variable: empresa global, sucursal, cobrador o producto.
CREATE TABLE IF NOT EXISTS "Goal" (
  "id"                     TEXT NOT NULL,
  "companyId"              TEXT NOT NULL,
  "branchId"               TEXT,
  "cobradorId"             TEXT,
  "loanType"               "LoanType",
  "semanaInicio"           DATE NOT NULL,
  "semanaFin"              DATE NOT NULL,
  "metaCapitalColocado"    DECIMAL(14, 2),
  "metaCreditosColocados"  INTEGER,
  "metaCobranzaEsperada"   DECIMAL(14, 2),
  "metaCobranzaEfectiva"   DECIMAL(14, 2),
  "metaMoraMaxima"         DECIMAL(5, 2),
  "metaCrecimiento"        DECIMAL(5, 2),
  "notas"                  TEXT,
  "creadoPorId"            TEXT NOT NULL,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Goal_companyId_semanaInicio_idx" ON "Goal" ("companyId", "semanaInicio");
CREATE INDEX IF NOT EXISTS "Goal_branchId_idx"               ON "Goal" ("branchId");
CREATE INDEX IF NOT EXISTS "Goal_cobradorId_idx"             ON "Goal" ("cobradorId");
