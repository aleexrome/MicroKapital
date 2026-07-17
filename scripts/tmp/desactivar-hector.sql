-- Desactivar a Héctor Eulises Rodríguez Guzmán (Gerente Zonal Toluca +
-- San Mateo Atenco). Ya no trabaja en la empresa.
--
-- Efectos:
--   1. User.activo = false → desaparece del árbol, selectores, widget
--      de rutas, /recursos-humanos, etc.
--   2. Sus coordinadores (los que tenían gerenteId = Héctor) quedan
--      huérfanos con gerenteId = null. Pueden reasignarse a otro
--      gerente después con un UPDATE puntual.
--   3. Nota: el ID de Héctor sigue en GERENTES_AGREGADOS_POR_SUCURSAL
--      hasta que se despliegue el PR de código que lo remueve. Como el
--      set solo se consulta después de filtrar por activo=true, no hay
--      problema funcional — es limpieza cosmética.

BEGIN;

-- Preview
SELECT id, nombre, email, rol, activo
  FROM "User"
 WHERE nombre ILIKE '%hector%eulises%rodr%';

-- Coords que dependen de él (para saber cuáles quedan huérfanos)
SELECT id, nombre, email, rol
  FROM "User"
 WHERE "gerenteId" IN (
   SELECT id FROM "User" WHERE nombre ILIKE '%hector%eulises%rodr%'
 );

-- Desactivar a Héctor
UPDATE "User"
   SET activo = false
 WHERE nombre ILIKE '%hector%eulises%rodr%';

-- Cortar el link jerárquico de sus coordinadores
UPDATE "User"
   SET "gerenteId" = NULL
 WHERE "gerenteId" IN (
   SELECT id FROM "User" WHERE nombre ILIKE '%hector%eulises%rodr%'
 );

-- Verificar
SELECT id, nombre, activo, "gerenteId"
  FROM "User"
 WHERE nombre ILIKE '%hector%eulises%rodr%';

COMMIT;
