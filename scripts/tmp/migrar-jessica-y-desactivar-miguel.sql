-- ═════════════════════════════════════════════════════════════════════════
-- Migrar JESSICA SANCHEZ RAMIREZ (Miguel → América) + desactivar Miguel
-- ═════════════════════════════════════════════════════════════════════════
--
-- Ella es la última clienta activa que le queda a Miguel Ángel Morales
-- Campos. Después del merge de cartera, se soft-deshabilita el perfil.
--
-- Al igual que la migración Valentina→Diana:
--   - Client.cobradorId → América; marca heredadoDeId=Miguel + heredadoAt=now.
--   - Loans ACTIVE/PENDING de Jessica → cobradorId=América.
--   - Loans LIQUIDATED se quedan con Miguel (histórico).
--   - Finalmente User.activo=false en Miguel.

BEGIN;

-- ── 1. Confirmar IDs ─────────────────────────────────────────────────
-- Miguel y América ya los conocemos por los ejercicios anteriores.
-- Jessica la buscamos por nombre + coordinador Miguel.
SELECT id, nombre, email, activo FROM "User"
 WHERE nombre ILIKE '%miguel%angel%morales%campos%'
    OR nombre ILIKE '%america%yazmin%zarazua%';

SELECT c.id, c."nombreCompleto", c."cobradorId", c."eliminadoEn",
       (SELECT COUNT(*) FROM "Loan" l WHERE l."clientId" = c.id AND l.estado = 'ACTIVE') AS activos,
       (SELECT COUNT(*) FROM "Loan" l WHERE l."clientId" = c.id AND l.estado = 'LIQUIDATED') AS liquidados
  FROM "Client" c
  JOIN "User" u ON u.id = c."cobradorId"
 WHERE c."nombreCompleto" ILIKE '%jessica%sanchez%ramirez%'
   AND u.nombre ILIKE '%miguel%angel%morales%';


-- ── 2. Migrar Jessica: cliente + loans vivos + trazabilidad ─────────
WITH miguel AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%miguel%angel%morales%campos%' LIMIT 1
),
america AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%america%yazmin%zarazua%' LIMIT 1
),
jessica AS (
  SELECT c.id
    FROM "Client" c, miguel m
   WHERE c."nombreCompleto" ILIKE '%jessica%sanchez%ramirez%'
     AND c."cobradorId" = m.id
     AND c."eliminadoEn" IS NULL
   LIMIT 1
)
UPDATE "Client" c SET
  "cobradorId"   = (SELECT id FROM america),
  "heredadoDeId" = (SELECT id FROM miguel),
  "heredadoAt"   = now()
 WHERE c.id = (SELECT id FROM jessica);

WITH miguel AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%miguel%angel%morales%campos%' LIMIT 1
),
america AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%america%yazmin%zarazua%' LIMIT 1
),
jessica AS (
  SELECT c.id
    FROM "Client" c
    JOIN america a ON c."cobradorId" = a.id  -- ya está en América tras el UPDATE
   WHERE c."nombreCompleto" ILIKE '%jessica%sanchez%ramirez%'
     AND c."heredadoDeId" = (SELECT id FROM miguel)
   LIMIT 1
)
UPDATE "Loan" l SET
  "cobradorId" = (SELECT id FROM america)
 WHERE l."clientId" = (SELECT id FROM jessica)
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 3. Verificar que Miguel quede en ceros de cartera viva ──────────
WITH miguel AS (
  SELECT id FROM "User" WHERE nombre ILIKE '%miguel%angel%morales%campos%' LIMIT 1
)
SELECT
  'MIGUEL — clientes activos (debe ser 0)' AS metric,
  COUNT(*) AS valor
  FROM "Client" c, miguel m
 WHERE c."cobradorId" = m.id AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'MIGUEL — loans vivos (debe ser 0)',
  COUNT(*)
  FROM "Loan" l, miguel m
 WHERE l."cobradorId" = m.id
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 4. Desactivar el perfil de Miguel + huerfanar coords ────────────
-- Miguel es COORDINADOR (no gerente), así que probablemente no tiene
-- subordinados. Igual se limpia por consistencia.
UPDATE "User" SET activo = false
 WHERE nombre ILIKE '%miguel%angel%morales%campos%';

UPDATE "User" SET "gerenteId" = NULL
 WHERE "gerenteId" IN (
   SELECT id FROM "User" WHERE nombre ILIKE '%miguel%angel%morales%campos%'
 );

-- Verificación final
SELECT id, nombre, activo FROM "User"
 WHERE nombre ILIKE '%miguel%angel%morales%campos%';

COMMIT;
