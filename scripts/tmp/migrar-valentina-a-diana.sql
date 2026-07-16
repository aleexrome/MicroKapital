-- ═════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN DE CARTERA: Valentina Rodríguez → Diana Elizabeth Ayala
-- ═════════════════════════════════════════════════════════════════════════
--
-- Ambas son coordinadoras en Toluca. Diana se queda con todos los clientes
-- que hoy tiene Valentina. Los préstamos activos también pasan; los
-- liquidados se quedan con Valentina para preservar el historial de quien
-- otorgó/cobró cada crédito.
--
-- Cada cliente reasignado queda marcado en BD con heredadoDeId (Valentina)
-- y heredadoAt (fecha del cambio). En la UI se muestra solo un badge
-- "Heredado" sin exponer el nombre del coordinador anterior.
--
-- ⚠ PRERREQUISITO: la migration 20260716_client_heredado tiene que estar
-- aplicada en producción (agrega las columnas heredadoDeId y heredadoAt).
--
-- Correr TODO dentro de la transacción. Ver el SELECT antes y después.

BEGIN;

-- ── 1. Confirmar IDs de las dos coordinadoras ────────────────────────
-- Los IDs se buscan por nombre + rol. Si aparece más de uno o ninguno,
-- STOP: hay que resolver manualmente antes de continuar.
SELECT id, nombre, email, rol, "companyId"
  FROM "User"
 WHERE (nombre ILIKE '%valentina%rodr%' OR nombre ILIKE '%diana%elizabeth%ayala%')
 ORDER BY nombre;


-- ── 2. Preview: qué clientes y qué loans se van a mover ──────────────
WITH valentina AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%valentina%rodr%garduño%' LIMIT 1
),
diana AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%diana elizabeth ayala%' LIMIT 1
)
SELECT
  'CLIENTES A REASIGNAR' AS bloque,
  COUNT(*) AS total,
  STRING_AGG(c."nombreCompleto", ' | ' ORDER BY c."nombreCompleto") AS nombres
  FROM "Client" c, valentina v
 WHERE c."cobradorId" = v.id
   AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'LOANS ACTIVOS/PENDING A REASIGNAR',
  COUNT(*),
  STRING_AGG(l.id, ', ')
  FROM "Loan" l, valentina v
 WHERE l."cobradorId" = v.id
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'LOANS LIQUIDADOS (se quedan con Valentina)',
  COUNT(*),
  NULL
  FROM "Loan" l, valentina v
 WHERE l."cobradorId" = v.id
   AND l.estado NOT IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 3. EJECUTAR la migración ─────────────────────────────────────────
WITH valentina AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%valentina%rodr%garduño%' LIMIT 1
),
diana AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%diana elizabeth ayala%' LIMIT 1
)
-- 3a. Reasignar clientes: pasan a Diana y se marcan como heredados de Valentina
UPDATE "Client" c SET
  "cobradorId"   = (SELECT id FROM diana),
  "heredadoDeId" = (SELECT id FROM valentina),
  "heredadoAt"   = now()
FROM valentina v
WHERE c."cobradorId" = v.id
  AND c."eliminadoEn" IS NULL;

-- 3b. Reasignar loans ACTIVOS/PENDING: pasan a Diana como cobrador
--     (los LIQUIDATED/REJECTED/DEFAULTED/RESTRUCTURED se quedan con Valentina)
WITH valentina AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%valentina%rodr%garduño%' LIMIT 1
),
diana AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%diana elizabeth ayala%' LIMIT 1
)
UPDATE "Loan" l SET
  "cobradorId" = (SELECT id FROM diana)
FROM valentina v
WHERE l."cobradorId" = v.id
  AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 4. Verificación: Valentina debe quedar en ceros de cartera viva ──
WITH valentina AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%valentina%rodr%garduño%' LIMIT 1
),
diana AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%diana elizabeth ayala%' LIMIT 1
)
SELECT
  'VALENTINA — clientes activos (debe ser 0)' AS metric,
  COUNT(*) AS valor
  FROM "Client" c, valentina v
 WHERE c."cobradorId" = v.id AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'VALENTINA — loans vivos (debe ser 0)',
  COUNT(*)
  FROM "Loan" l, valentina v
 WHERE l."cobradorId" = v.id
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'VALENTINA — loans liquidados (se preservan)',
  COUNT(*)
  FROM "Loan" l, valentina v
 WHERE l."cobradorId" = v.id
   AND l.estado NOT IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'DIANA — clientes totales',
  COUNT(*)
  FROM "Client" c, diana d
 WHERE c."cobradorId" = d.id AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'DIANA — clientes heredados de Valentina',
  COUNT(*)
  FROM "Client" c, valentina v, diana d
 WHERE c."cobradorId"   = d.id
   AND c."heredadoDeId" = v.id
   AND c."eliminadoEn"  IS NULL
UNION ALL
SELECT
  'DIANA — loans vivos totales',
  COUNT(*)
  FROM "Loan" l, diana d
 WHERE l."cobradorId" = d.id
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- Si todo cuadra:
COMMIT;
-- Si no:
-- ROLLBACK;
