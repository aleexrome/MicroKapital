-- Detección de clientes duplicados por empresa
--
-- Ejecutar en Supabase SQL Editor. Muestra grupos de clientes que
-- comparten mismo nombre / INE / CURP dentro de la misma empresa,
-- ignorando soft-eliminados (eliminadoEn NULL).
--
-- Para cada duplicado se incluye: id, nombre, sucursal, coordinador,
-- fecha de alta, préstamos activos y préstamos totales. Con eso puedes
-- decidir cuál conservar (típicamente el más viejo o el que tiene
-- historial de préstamos) y soft-eliminar el otro con:
--
--   UPDATE "Client" SET "eliminadoEn" = now() WHERE id = '<uuid>';

WITH normalized AS (
  SELECT
    c.id,
    c."companyId",
    c."branchId",
    c."cobradorId",
    c."nombreCompleto",
    c."telefono",
    c."numIne",
    c."curp",
    c."createdAt",
    UPPER(TRIM(c."nombreCompleto")) AS nombre_norm,
    NULLIF(UPPER(TRIM(c."numIne")), '') AS ine_norm,
    NULLIF(UPPER(TRIM(c."curp")), '')   AS curp_norm
  FROM "Client" c
  WHERE c."eliminadoEn" IS NULL
),
dup_nombre AS (
  SELECT "companyId", nombre_norm
  FROM normalized
  GROUP BY "companyId", nombre_norm
  HAVING COUNT(*) > 1
),
dup_ine AS (
  SELECT "companyId", ine_norm
  FROM normalized
  WHERE ine_norm IS NOT NULL
  GROUP BY "companyId", ine_norm
  HAVING COUNT(*) > 1
),
dup_curp AS (
  SELECT "companyId", curp_norm
  FROM normalized
  WHERE curp_norm IS NOT NULL
  GROUP BY "companyId", curp_norm
  HAVING COUNT(*) > 1
),
candidatos AS (
  SELECT n.*, 'NOMBRE'::text AS motivo, n.nombre_norm AS clave
  FROM normalized n
  JOIN dup_nombre d ON d."companyId" = n."companyId" AND d.nombre_norm = n.nombre_norm
  UNION
  SELECT n.*, 'INE'::text, n.ine_norm
  FROM normalized n
  JOIN dup_ine d ON d."companyId" = n."companyId" AND d.ine_norm = n.ine_norm
  UNION
  SELECT n.*, 'CURP'::text, n.curp_norm
  FROM normalized n
  JOIN dup_curp d ON d."companyId" = n."companyId" AND d.curp_norm = n.curp_norm
)
SELECT
  c.motivo,
  c.clave,
  c.id AS cliente_id,
  c."nombreCompleto",
  c."telefono",
  c."numIne",
  c."curp",
  b.nombre AS sucursal,
  u.nombre AS coordinador,
  c."createdAt",
  (SELECT COUNT(*) FROM "Loan" l WHERE l."clientId" = c.id) AS total_prestamos,
  (SELECT COUNT(*) FROM "Loan" l WHERE l."clientId" = c.id AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW')) AS prestamos_vivos
FROM candidatos c
LEFT JOIN "Branch" b ON b.id = c."branchId"
LEFT JOIN "User"   u ON u.id = c."cobradorId"
ORDER BY c."companyId", c.motivo, c.clave, c."createdAt";
