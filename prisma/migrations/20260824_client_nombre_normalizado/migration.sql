-- Nuevo campo Client.nombreNormalizado — copia MAYÚSCULAS sin acentos
-- del nombreCompleto para que el buscador matchee "gonzalez" y
-- "González" indistintamente. Se mantiene en sync desde POST/PATCH de
-- cliente. Backfill inicial con TRANSLATE (no requiere extensión
-- unaccent, funciona en Supabase por default).

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "nombreNormalizado" TEXT NOT NULL DEFAULT '';

-- Backfill: uppercase + strip acentos comunes + colapsar espacios.
-- La tabla TRANSLATE cubre las vocales acentuadas / diéresis / ñ que
-- aparecen en nombres mexicanos. Basta con esto para el buscador.
UPDATE "Client"
   SET "nombreNormalizado" = REGEXP_REPLACE(
     TRIM(
       TRANSLATE(
         UPPER("nombreCompleto"),
         'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòù',
         'AEIOUUNAEIOUUNAEIOUAEIOU'
       )
     ),
     '\s+', ' ', 'g'
   )
 WHERE "nombreNormalizado" = '' OR "nombreNormalizado" IS NULL;

CREATE INDEX IF NOT EXISTS "Client_companyId_nombreNormalizado_idx"
  ON "Client"("companyId", "nombreNormalizado");
