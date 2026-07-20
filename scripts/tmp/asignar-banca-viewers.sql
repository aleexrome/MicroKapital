-- Asignar acceso de solo lectura a /banca a 3 usuarios, cada uno
-- filtrado a UNA sucursal:
--   Edgar Solís Pérez            → Veracruz
--   Jessika Guadalupe Pérez Vives → Minatitlán
--   Catalina Salazar Juárez      → Martínez de la Torre
--
-- Requiere que la migration 20260720_banca_viewer esté aplicada
-- (columna User.bancaViewerBranchId + FK a Branch).

BEGIN;

-- Preview: sucursales por nombre
SELECT id, nombre FROM "Branch"
 WHERE nombre ILIKE '%veracruz%'
    OR nombre ILIKE '%minatitl%'
    OR nombre ILIKE '%martinez%torre%'
    OR nombre ILIKE '%martínez%torre%';

-- Preview: usuarios
SELECT id, nombre, email, "bancaViewerBranchId" FROM "User"
 WHERE nombre ILIKE '%edgar%sol%'
    OR nombre ILIKE '%jessika%p%rez%vives%'
    OR nombre ILIKE '%catalina%salazar%';


-- 1. Edgar → Veracruz
UPDATE "User"
   SET "bancaViewerBranchId" = (SELECT id FROM "Branch" WHERE nombre ILIKE 'veracruz' LIMIT 1)
 WHERE nombre ILIKE '%edgar%sol%';

-- 2. Jessika → Minatitlán
UPDATE "User"
   SET "bancaViewerBranchId" = (SELECT id FROM "Branch" WHERE nombre ILIKE 'minatitl%' LIMIT 1)
 WHERE nombre ILIKE '%jessika%p%rez%vives%';

-- 3. Catalina → Martínez de la Torre
UPDATE "User"
   SET "bancaViewerBranchId" = (SELECT id FROM "Branch" WHERE nombre ILIKE '%mart%nez%torre%' LIMIT 1)
 WHERE nombre ILIKE '%catalina%salazar%';


-- Verificar
SELECT u.id, u.nombre, b.nombre AS banca_viewer_de
  FROM "User" u
  LEFT JOIN "Branch" b ON b.id = u."bancaViewerBranchId"
 WHERE u."bancaViewerBranchId" IS NOT NULL
 ORDER BY u.nombre;

COMMIT;
