-- ═════════════════════════════════════════════════════════════════════════
-- REGRESAR "GRUPO EL CAMPO" (Minatitlán) de Dirección General → Mesa de Control
-- ═════════════════════════════════════════════════════════════════════════
--
-- Los préstamos del grupo EL CAMPO se enviaron a DG por error o antes de
-- tiempo. Ahora Mesa de Control necesita revisarlos primero. La acción
-- MESA_CONTROL_FORWARD que los envió a DG hace 4 cosas:
--   estado                 = 'PENDING_APPROVAL'
--   revisadoPorId          = <mesa de control user>
--   revisadoAt             = now()
--   revisionNotasGenerales = <notas de MC>
--
-- Este script revierte esos 4 cambios solo para los préstamos del grupo
-- que sigan en PENDING_APPROVAL. Los que ya avanzaron (APPROVED,
-- IN_ACTIVATION, ACTIVE, etc.) se dejan tal cual — reversar de esos
-- estados requiere flujo especial que ya no aplica aquí.
--
-- Correr TODO dentro de la transacción. Revisar los SELECT antes de COMMIT.

BEGIN;

-- ── 1. Contexto: empresa + sucursal + coordinador + grupo ────────────
SELECT c.id AS company_id, c.nombre AS empresa,
       b.id AS branch_id,  b.nombre AS sucursal,
       u.id AS coord_id,   u.nombre AS coordinador,
       g.id AS group_id,   g.nombre AS grupo,
       g."eliminadoEn"
  FROM "Company"   c
  JOIN "Branch"    b ON b."companyId" = c.id AND b.activa = true
  JOIN "User"      u ON u."companyId" = c.id AND u.rol IN ('COORDINADOR', 'GERENTE', 'GERENTE_ZONAL')
  JOIN "LoanGroup" g ON g."branchId"  = b.id AND g."cobradorId" = u.id
 WHERE c.nombre ILIKE '%MicroKapital%'
   AND b.nombre ILIKE 'Minatitl%'
   AND u.nombre ILIKE '%Francisco%Figueroa%Velasquez%'
   AND g.nombre ILIKE '%EL CAMPO%'
   AND g."eliminadoEn" IS NULL;


-- ── 2. Preview: listar los préstamos del grupo con su estado ─────────
-- Muestra quién esta en PENDING_APPROVAL (los que se van a mover), y
-- quién esta en otro estado (se quedan como están).
WITH grupo AS (
  SELECT g.id
    FROM "Company"   c
    JOIN "Branch"    b ON b."companyId" = c.id AND b.activa = true
    JOIN "User"      u ON u."companyId" = c.id
    JOIN "LoanGroup" g ON g."branchId"  = b.id AND g."cobradorId" = u.id
   WHERE c.nombre ILIKE '%MicroKapital%'
     AND b.nombre ILIKE 'Minatitl%'
     AND u.nombre ILIKE '%Francisco%Figueroa%Velasquez%'
     AND g.nombre ILIKE '%EL CAMPO%'
     AND g."eliminadoEn" IS NULL
   LIMIT 1
)
SELECT l.id, cl."nombreCompleto" AS cliente, l.estado,
       l.capital, l."revisadoAt", ru.nombre AS "revisadoPor",
       l."revisionNotasGenerales"
  FROM "Loan"   l
  JOIN grupo    ON l."loanGroupId" = grupo.id
  JOIN "Client" cl ON cl.id = l."clientId"
  LEFT JOIN "User"   ru ON ru.id = l."revisadoPorId"
 ORDER BY cl."nombreCompleto";


-- ── 3. Revertir los PENDING_APPROVAL → PENDING_REVIEW ────────────────
WITH grupo AS (
  SELECT g.id
    FROM "Company"   c
    JOIN "Branch"    b ON b."companyId" = c.id AND b.activa = true
    JOIN "User"      u ON u."companyId" = c.id
    JOIN "LoanGroup" g ON g."branchId"  = b.id AND g."cobradorId" = u.id
   WHERE c.nombre ILIKE '%MicroKapital%'
     AND b.nombre ILIKE 'Minatitl%'
     AND u.nombre ILIKE '%Francisco%Figueroa%Velasquez%'
     AND g.nombre ILIKE '%EL CAMPO%'
     AND g."eliminadoEn" IS NULL
   LIMIT 1
)
UPDATE "Loan" l SET
  estado                   = 'PENDING_REVIEW'::"LoanStatus",
  "revisadoPorId"          = NULL,
  "revisadoAt"             = NULL,
  "revisionNotasGenerales" = NULL,
  "updatedAt"              = now()
FROM grupo
WHERE l."loanGroupId" = grupo.id
  AND l.estado = 'PENDING_APPROVAL';


-- ── 4. Audit log — un renglón por préstamo movido ────────────────────
WITH grupo AS (
  SELECT g.id
    FROM "Company"   c
    JOIN "Branch"    b ON b."companyId" = c.id AND b.activa = true
    JOIN "User"      u ON u."companyId" = c.id
    JOIN "LoanGroup" g ON g."branchId"  = b.id AND g."cobradorId" = u.id
   WHERE c.nombre ILIKE '%MicroKapital%'
     AND b.nombre ILIKE 'Minatitl%'
     AND u.nombre ILIKE '%Francisco%Figueroa%Velasquez%'
     AND g.nombre ILIKE '%EL CAMPO%'
     AND g."eliminadoEn" IS NULL
   LIMIT 1
)
INSERT INTO "AuditLog" (
  id, "userId", accion, tabla, "registroId",
  "valoresAnteriores", "valoresNuevos", "createdAt"
)
SELECT
  gen_random_uuid(), NULL,
  'MESA_CONTROL_REVERT_FROM_DG', 'Loan', l.id,
  jsonb_build_object('estado', 'PENDING_APPROVAL'),
  jsonb_build_object(
    'estado', 'PENDING_REVIEW',
    'motivo', 'Regreso manual del grupo EL CAMPO a la cola de Mesa de Control'
  ),
  now()
FROM "Loan" l, grupo
WHERE l."loanGroupId" = grupo.id
  AND l.estado = 'PENDING_REVIEW'
  AND l."revisadoPorId" IS NULL
  AND l."updatedAt" >= now() - interval '5 minutes';


-- ── 5. Verificación ──────────────────────────────────────────────────
WITH grupo AS (
  SELECT g.id
    FROM "Company"   c
    JOIN "Branch"    b ON b."companyId" = c.id AND b.activa = true
    JOIN "User"      u ON u."companyId" = c.id
    JOIN "LoanGroup" g ON g."branchId"  = b.id AND g."cobradorId" = u.id
   WHERE c.nombre ILIKE '%MicroKapital%'
     AND b.nombre ILIKE 'Minatitl%'
     AND u.nombre ILIKE '%Francisco%Figueroa%Velasquez%'
     AND g.nombre ILIKE '%EL CAMPO%'
     AND g."eliminadoEn" IS NULL
   LIMIT 1
)
SELECT l.id, cl."nombreCompleto" AS cliente, l.estado,
       l."revisadoAt", l."revisionNotasGenerales"
  FROM "Loan"   l
  JOIN grupo    ON l."loanGroupId" = grupo.id
  JOIN "Client" cl ON cl.id = l."clientId"
 ORDER BY cl."nombreCompleto";


-- Si todo cuadra:
COMMIT;
-- Si no:
-- ROLLBACK;
