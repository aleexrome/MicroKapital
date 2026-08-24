-- MoraCobro: permitir hasta una MULTA y una MORA por schedule.
-- Antes: @@unique([scheduleId])          → una sola por schedule.
-- Ahora: @@unique([scheduleId, tipo])    → una por (schedule, tipo).
--
-- Se hace idempotente por si la migración se re-corre. En Postgres el
-- nombre del índice generado por Prisma para @@unique([scheduleId])
-- es "MoraCobro_scheduleId_key"; el nuevo es "MoraCobro_scheduleId_tipo_key".

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname  = 'MoraCobro_scheduleId_key'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS "MoraCobro_scheduleId_key"';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "MoraCobro_scheduleId_tipo_key"
  ON "MoraCobro"("scheduleId", "tipo");
