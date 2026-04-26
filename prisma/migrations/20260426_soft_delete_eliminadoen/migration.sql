-- Soft delete para Cliente y LoanGroup. Cuando DG borra desde la UI se
-- setea eliminadoEn = now(); las queries de cartera, agenda, rutas y
-- dashboard filtran "eliminadoEn IS NULL". Un cron diario hace hard
-- delete a los 14 días.
ALTER TABLE "Client"    ADD COLUMN IF NOT EXISTS "eliminadoEn" TIMESTAMP(3);
ALTER TABLE "LoanGroup" ADD COLUMN IF NOT EXISTS "eliminadoEn" TIMESTAMP(3);

-- Índices para que las queries con filtro eliminadoEn IS NULL no
-- escaneen toda la tabla.
CREATE INDEX IF NOT EXISTS "Client_eliminadoEn_idx"    ON "Client"    ("eliminadoEn");
CREATE INDEX IF NOT EXISTS "LoanGroup_eliminadoEn_idx" ON "LoanGroup" ("eliminadoEn");
