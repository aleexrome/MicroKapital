-- ═════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN DE CARTERA: Edgar Solís Pérez → Juan Andrés Lara Durán
-- ═════════════════════════════════════════════════════════════════════════
--
-- Edgar es Gerente Zonal de Veracruz; venía cargando cartera directa por
-- falta de coordinador local. Ya existe Juan Andrés Lara Durán como
-- coordinador para Veracruz, así que TODA la cartera viva de Edgar
-- (cualquier sucursal) se le pasa a Andrés. Los préstamos ya liquidados
-- se quedan con Edgar para preservar el historial de quien otorgó/cobró
-- cada crédito. Edgar queda en cero de cartera activa y sigue operando
-- como Gerente Zonal.
--
-- Cada cliente reasignado queda marcado en BD con heredadoDeId (Edgar)
-- y heredadoAt (fecha del cambio). En la UI se muestra solo un badge
-- "Heredado" sin exponer el nombre del coordinador anterior.
--
-- ⚠ PRERREQUISITO: la migration 20260716_client_heredado tiene que estar
-- aplicada en producción (agrega las columnas heredadoDeId y heredadoAt).
--
-- Correr TODO dentro de la transacción. Ver el SELECT antes y después.

BEGIN;

-- ── 1. Confirmar IDs de los dos usuarios ─────────────────────────────
-- Los IDs se buscan por email. Si aparece más de uno o ninguno, STOP:
-- hay que resolver manualmente antes de continuar.
SELECT id, nombre, email, rol, "companyId", "branchId"
  FROM "User"
 WHERE email IN ('edgar.solis@microkapital.com', 'juan.lara@microkapital.com')
 ORDER BY nombre;


-- ── 2. Preview: qué clientes y qué loans se van a mover ──────────────
WITH edgar AS (
  SELECT id FROM "User" WHERE email = 'edgar.solis@microkapital.com' LIMIT 1
),
andres AS (
  SELECT id FROM "User" WHERE email = 'juan.lara@microkapital.com' LIMIT 1
)
SELECT
  'CLIENTES A REASIGNAR' AS bloque,
  COUNT(*) AS total,
  STRING_AGG(c."nombreCompleto", ' | ' ORDER BY c."nombreCompleto") AS nombres
  FROM "Client" c, edgar e
 WHERE c."cobradorId" = e.id
   AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'LOANS ACTIVOS/PENDING A REASIGNAR',
  COUNT(*),
  STRING_AGG(l.id, ', ')
  FROM "Loan" l, edgar e
 WHERE l."cobradorId" = e.id
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'LOANS LIQUIDADOS (se quedan con Edgar)',
  COUNT(*),
  NULL
  FROM "Loan" l, edgar e
 WHERE l."cobradorId" = e.id
   AND l.estado NOT IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 3. EJECUTAR la migración ─────────────────────────────────────────
WITH edgar AS (
  SELECT id FROM "User" WHERE email = 'edgar.solis@microkapital.com' LIMIT 1
),
andres AS (
  SELECT id FROM "User" WHERE email = 'juan.lara@microkapital.com' LIMIT 1
)
-- 3a. Reasignar clientes: pasan a Andrés y se marcan como heredados de Edgar
UPDATE "Client" c SET
  "cobradorId"   = (SELECT id FROM andres),
  "heredadoDeId" = (SELECT id FROM edgar),
  "heredadoAt"   = now()
FROM edgar e
WHERE c."cobradorId" = e.id
  AND c."eliminadoEn" IS NULL;

-- 3b. Reasignar loans ACTIVOS/PENDING: pasan a Andrés como cobrador
--     (los LIQUIDATED/REJECTED/DEFAULTED/RESTRUCTURED se quedan con Edgar)
WITH edgar AS (
  SELECT id FROM "User" WHERE email = 'edgar.solis@microkapital.com' LIMIT 1
),
andres AS (
  SELECT id FROM "User" WHERE email = 'juan.lara@microkapital.com' LIMIT 1
)
UPDATE "Loan" l SET
  "cobradorId" = (SELECT id FROM andres)
FROM edgar e
WHERE l."cobradorId" = e.id
  AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 4. Verificación: Edgar debe quedar en ceros de cartera viva ──────
WITH edgar AS (
  SELECT id FROM "User" WHERE email = 'edgar.solis@microkapital.com' LIMIT 1
),
andres AS (
  SELECT id FROM "User" WHERE email = 'juan.lara@microkapital.com' LIMIT 1
)
SELECT
  'EDGAR — clientes activos (debe ser 0)' AS metric,
  COUNT(*) AS valor
  FROM "Client" c, edgar e
 WHERE c."cobradorId" = e.id AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'EDGAR — loans vivos (debe ser 0)',
  COUNT(*)
  FROM "Loan" l, edgar e
 WHERE l."cobradorId" = e.id
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'EDGAR — loans liquidados (se preservan)',
  COUNT(*)
  FROM "Loan" l, edgar e
 WHERE l."cobradorId" = e.id
   AND l.estado NOT IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'ANDRÉS — clientes totales',
  COUNT(*)
  FROM "Client" c, andres a
 WHERE c."cobradorId" = a.id AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'ANDRÉS — clientes heredados de Edgar',
  COUNT(*)
  FROM "Client" c, edgar e, andres a
 WHERE c."cobradorId"   = a.id
   AND c."heredadoDeId" = e.id
   AND c."eliminadoEn"  IS NULL
UNION ALL
SELECT
  'ANDRÉS — loans vivos totales',
  COUNT(*)
  FROM "Loan" l, andres a
 WHERE l."cobradorId" = a.id
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- Si todo cuadra:
COMMIT;
-- Si no:
-- ROLLBACK;
