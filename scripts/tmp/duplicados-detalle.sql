-- ═════════════════════════════════════════════════════════════════════════
-- INSPECCIÓN DE DUPLICADOS — versión enriquecida
-- ═════════════════════════════════════════════════════════════════════════
--
-- Muestra por cada duplicado toda la info que necesitas para decidir
-- caso por caso. Corre esto en Supabase SQL Editor y descarga el CSV.
--
-- Columnas:
--   grupo_dup           → clave que agrupa a los duplicados (CURP / INE / nombre)
--   motivo              → qué campo hizo el match
--   cliente_id          → uuid del cliente
--   nombre, tel, ine, curp → datos del expediente
--   sucursal, coordinador
--   creado_hace_dias    → antigüedad del registro
--   score, activo
--   loans_totales       → cuántos préstamos ha tenido en total
--   loans_activos       → cuántos préstamos ACTIVE tiene ahora
--   loans_liquidados    → cuántos ya liquidados
--   loans_pending       → cuántos en PENDING_APPROVAL/PENDING_REVIEW/APPROVED
--   ultimo_prestamo     → fecha del préstamo más reciente
--   ultimo_pago         → fecha del último pago que hizo
--   loan_ids_activos    → uuids de los préstamos vivos (para mover si hace falta)
--   docs                → cuántos documentos digitales subidos
--
-- Regla de oro:
--   1. Cliente con loans_activos = 0 → SEGURO soft-delete (nada se pierde,
--      el histórico queda registrado bajo el cliente eliminado).
--   2. Cliente con loans_activos ≥ 1 → hay que decidir:
--      - Mismo coordinador → merge: mueves los loans al ganador y borras
--        al perdedor.
--      - Distinto coordinador → primero decides con quién se queda el
--        cliente (típicamente el que tiene actividad más reciente), luego
--        mueves loans + borras al perdedor.
--
-- Ver scripts/tmp/merge-cliente-template.sql para las operaciones.

WITH normalized AS (
  SELECT
    c.id,
    c."companyId",
    c."nombreCompleto",
    c.telefono,
    c."numIne",
    c.curp,
    c."createdAt",
    c.score,
    c.activo,
    c."cobradorId",
    c."branchId",
    UPPER(TRIM(c."nombreCompleto"))        AS nombre_norm,
    NULLIF(UPPER(TRIM(c."numIne")), '')    AS ine_norm,
    NULLIF(UPPER(TRIM(c."curp")), '')      AS curp_norm
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
  WHERE ine_norm IS NOT NULL AND ine_norm NOT IN ('INE','SN','.','-')
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
  SELECT n.*, 'CURP'::text AS motivo, n.curp_norm AS grupo_dup
  FROM normalized n
  JOIN dup_curp d ON d."companyId" = n."companyId" AND d.curp_norm = n.curp_norm
  UNION
  SELECT n.*, 'INE'::text, n.ine_norm
  FROM normalized n
  JOIN dup_ine d ON d."companyId" = n."companyId" AND d.ine_norm = n.ine_norm
  UNION
  SELECT n.*, 'NOMBRE'::text, n.nombre_norm
  FROM normalized n
  JOIN dup_nombre d ON d."companyId" = n."companyId" AND d.nombre_norm = n.nombre_norm
)
SELECT
  c.grupo_dup,
  c.motivo,
  c.id AS cliente_id,
  c."nombreCompleto"                          AS nombre,
  c.telefono                                  AS tel,
  c."numIne"                                  AS ine,
  c.curp,
  b.nombre                                    AS sucursal,
  u.nombre                                    AS coordinador,
  DATE_PART('day', now() - c."createdAt")::int AS creado_hace_dias,
  c.score,
  c.activo,
  (SELECT COUNT(*) FROM "Loan" l
     WHERE l."clientId" = c.id) AS loans_totales,
  (SELECT COUNT(*) FROM "Loan" l
     WHERE l."clientId" = c.id AND l.estado = 'ACTIVE') AS loans_activos,
  (SELECT COUNT(*) FROM "Loan" l
     WHERE l."clientId" = c.id AND l.estado = 'LIQUIDATED') AS loans_liquidados,
  (SELECT COUNT(*) FROM "Loan" l
     WHERE l."clientId" = c.id
       AND l.estado IN ('PENDING_APPROVAL','PENDING_REVIEW','APPROVED','IN_ACTIVATION')) AS loans_pending,
  (SELECT MAX(l."createdAt") FROM "Loan" l WHERE l."clientId" = c.id)::date AS ultimo_prestamo,
  (SELECT MAX(p."fechaHora") FROM "Payment" p WHERE p."clientId" = c.id)::date AS ultimo_pago,
  (SELECT STRING_AGG(l.id::text, ', ')
     FROM "Loan" l
     WHERE l."clientId" = c.id AND l.estado = 'ACTIVE') AS loan_ids_activos,
  (SELECT COUNT(*) FROM "ClientDocument" d WHERE d."clientId" = c.id) AS docs
FROM candidatos c
LEFT JOIN "Branch" b ON b.id = c."branchId"
LEFT JOIN "User"   u ON u.id = c."cobradorId"
ORDER BY c."companyId", c.motivo, c.grupo_dup, c."createdAt";
