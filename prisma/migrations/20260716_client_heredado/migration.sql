-- Trazabilidad de reasignación de clientes entre coordinadores.
-- heredadoDeId: FK al User (coordinador de origen) — nullable porque
--   solo se llena cuando el cliente fue reasignado desde otro coord.
-- heredadoAt: timestamp del cambio, para auditoría.

ALTER TABLE "Client"
  ADD COLUMN "heredadoDeId" TEXT,
  ADD COLUMN "heredadoAt"   TIMESTAMP(3);

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_heredadoDeId_fkey"
  FOREIGN KEY ("heredadoDeId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Client_heredadoDeId_idx" ON "Client" ("heredadoDeId");
