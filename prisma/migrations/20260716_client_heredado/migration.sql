-- Trazabilidad de reasignación de clientes entre coordinadores.
-- heredadoDeId: FK al User (coordinador de origen) — nullable porque
--   solo se llena cuando el cliente fue reasignado desde otro coord.
-- heredadoAt: timestamp del cambio, para auditoría.
--
-- Idempotente: usa IF NOT EXISTS para que se pueda re-ejecutar sin
-- error si algunos objetos ya existen de un intento previo.

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "heredadoDeId" TEXT,
  ADD COLUMN IF NOT EXISTS "heredadoAt"   TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Client_heredadoDeId_fkey'
  ) THEN
    ALTER TABLE "Client"
      ADD CONSTRAINT "Client_heredadoDeId_fkey"
      FOREIGN KEY ("heredadoDeId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Client_heredadoDeId_idx" ON "Client" ("heredadoDeId");
