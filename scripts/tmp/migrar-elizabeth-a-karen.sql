-- ═════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Elizabeth Hernández Rodríguez → Karen Itzel Vidal Aguilar
-- ═════════════════════════════════════════════════════════════════════════
--
-- Elizabeth ya no trabaja en la empresa. Toda su cartera pasa a Karen
-- con el marcado de heredados (mismo flujo que Valentina→Diana).
--
-- IDs (obtenidos del listado de coordinadores):
--   Elizabeth Hernández Rodríguez → 21ffafd6-343d-4682-890a-7939b11b9d05
--   Karen Itzel Vidal Aguilar    → be71611e-48b7-4003-8984-b19ec2b40b19

BEGIN;

-- ── 1. Preview: qué se va a mover ────────────────────────────────────
SELECT
  'CLIENTES A REASIGNAR' AS bloque,
  COUNT(*) AS total,
  STRING_AGG(c."nombreCompleto", ' | ' ORDER BY c."nombreCompleto") AS nombres
  FROM "Client" c
 WHERE c."cobradorId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'LOANS ACTIVOS/PENDING A REASIGNAR',
  COUNT(*),
  STRING_AGG(l.id, ', ')
  FROM "Loan" l
 WHERE l."cobradorId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'LOANS LIQUIDADOS (se quedan con Elizabeth)',
  COUNT(*),
  NULL
  FROM "Loan" l
 WHERE l."cobradorId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND l.estado NOT IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 2. Reasignar clientes activos → Karen + marcado heredado ────────
UPDATE "Client" SET
  "cobradorId"   = 'be71611e-48b7-4003-8984-b19ec2b40b19',  -- Karen
  "heredadoDeId" = '21ffafd6-343d-4682-890a-7939b11b9d05',  -- Elizabeth
  "heredadoAt"   = now()
 WHERE "cobradorId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND "eliminadoEn" IS NULL;

-- ── 3. Reasignar loans vivos → Karen (los liquidados se quedan) ─────
UPDATE "Loan" SET
  "cobradorId" = 'be71611e-48b7-4003-8984-b19ec2b40b19'
 WHERE "cobradorId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 4. Verificar: Elizabeth debe quedar en ceros ────────────────────
SELECT
  'ELIZABETH — clientes activos (debe ser 0)' AS metric,
  COUNT(*) AS valor
  FROM "Client" c
 WHERE c."cobradorId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'ELIZABETH — loans vivos (debe ser 0)',
  COUNT(*)
  FROM "Loan" l
 WHERE l."cobradorId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'ELIZABETH — loans liquidados (se preservan)',
  COUNT(*)
  FROM "Loan" l
 WHERE l."cobradorId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND l.estado NOT IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'KAREN — clientes totales',
  COUNT(*)
  FROM "Client" c
 WHERE c."cobradorId" = 'be71611e-48b7-4003-8984-b19ec2b40b19'
   AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'KAREN — clientes heredados de Elizabeth',
  COUNT(*)
  FROM "Client" c
 WHERE c."cobradorId"   = 'be71611e-48b7-4003-8984-b19ec2b40b19'
   AND c."heredadoDeId" = '21ffafd6-343d-4682-890a-7939b11b9d05'
   AND c."eliminadoEn"  IS NULL
UNION ALL
SELECT
  'KAREN — loans vivos totales',
  COUNT(*)
  FROM "Loan" l
 WHERE l."cobradorId" = 'be71611e-48b7-4003-8984-b19ec2b40b19'
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 5. Desactivar el perfil de Elizabeth + huerfanar coords ─────────
UPDATE "User" SET activo = false
 WHERE id = '21ffafd6-343d-4682-890a-7939b11b9d05';

UPDATE "User" SET "gerenteId" = NULL
 WHERE "gerenteId" = '21ffafd6-343d-4682-890a-7939b11b9d05';

-- Verificación final del perfil
SELECT id, nombre, activo FROM "User"
 WHERE id = '21ffafd6-343d-4682-890a-7939b11b9d05';

COMMIT;
