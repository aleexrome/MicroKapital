-- Fix: la migración 20260824_mora_por_tipo asumió que el unique viejo
-- de MoraCobro se llamaba "MoraCobro_scheduleId_key" (naming default de
-- Prisma) pero en la BD real quedó como "MoraCobro_scheduleId_uidx" —
-- probablemente porque una migración anterior lo renombró. Con eso el
-- índice viejo sobrevivió y bloqueaba la segunda inserción de MoraCobro
-- para el mismo scheduleId (aunque el tipo fuera distinto), rompiendo
-- el nuevo comportamiento MULTA+MORA por separado.
--
-- Este archivo dropea AMBOS nombres posibles y garantiza que exista el
-- compuesto (scheduleId, tipo). Idempotente.

DROP INDEX IF EXISTS "MoraCobro_scheduleId_uidx";
DROP INDEX IF EXISTS "MoraCobro_scheduleId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "MoraCobro_scheduleId_tipo_key"
  ON "MoraCobro"("scheduleId", "tipo");
