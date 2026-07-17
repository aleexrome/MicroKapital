-- Desactivar a Valentina Rodríguez Garduño.
-- Después de la migración de su cartera a Diana Elizabeth Ayala Moreno,
-- Valentina ya no tiene clientes activos ni loans vivos. Setear
-- activo=false la quita del árbol de cartera, del widget de rutas por
-- coordinador, y de los selectores de cobrador.
--
-- No es hard-delete: sus loans liquidados históricos siguen apuntando a
-- ella (para preservar quién los otorgó/cobró).

BEGIN;

-- Preview
SELECT id, nombre, email, rol, activo
  FROM "User"
 WHERE nombre ILIKE '%valentina%rodr%garduño%';

-- Desactivar
UPDATE "User"
   SET activo = false
 WHERE nombre ILIKE '%valentina%rodr%garduño%';

-- Verificar
SELECT id, nombre, email, rol, activo
  FROM "User"
 WHERE nombre ILIKE '%valentina%rodr%garduño%';

COMMIT;
