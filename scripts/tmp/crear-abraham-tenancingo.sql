-- ═════════════════════════════════════════════════════════════════════════
-- ALTA DE USUARIO: Abraham Rosales Estrada — Coordinador de Tenancingo
-- ═════════════════════════════════════════════════════════════════════════
--
-- Contrasena inicial: RosalesMKTen26!*
-- El passwordHash de abajo se genero con bcryptjs, cost=12, la misma
-- libreria y salt-rounds que usa NextAuth en /api/auth. Si necesitaras
-- rotar la contrasena en el futuro, regenera el hash y actualiza este
-- archivo (o hazlo con el script scripts/create-abraham-tenancingo.ts).
--
-- Idempotente: ON CONFLICT (companyId, email) hace update de datos pero
-- deja intactos passwordHash y activo (para no invalidar sesiones ni
-- reactivar cuentas dadas de baja a proposito). Si el usuario ya existe
-- y quieres re-crearlo con esta contrasena, borra ese renglon primero.
--
-- Correr TODO dentro de la transaccion. Revisar los SELECT antes de
-- COMMIT.

BEGIN;

-- ── 1. Contexto: empresa + sucursal Tenancingo ───────────────────────
SELECT c.id AS company_id, c.nombre AS empresa,
       b.id AS branch_id, b.nombre AS sucursal
  FROM "Company" c
  JOIN "Branch"  b ON b."companyId" = c.id AND b.activa = true
 WHERE c.nombre ILIKE '%MicroKapital%'
   AND b.nombre ILIKE 'Tenancingo';


-- ── 2. Gerente candidato para Tenancingo ─────────────────────────────
-- Deberia ser exactamente uno. Si sale mas de uno, el INSERT de abajo
-- toma el primero por LIMIT 1 y avisas al DG para asignar manualmente
-- despues.
WITH ctx AS (
  SELECT c.id AS company_id, b.id AS branch_id
    FROM "Company" c
    JOIN "Branch"  b ON b."companyId" = c.id AND b.activa = true
   WHERE c.nombre ILIKE '%MicroKapital%'
     AND b.nombre ILIKE 'Tenancingo'
)
SELECT u.id, u.nombre, u.rol, u."branchId", u."zonaBranchIds"
  FROM "User" u, ctx
 WHERE u."companyId" = ctx.company_id
   AND u.activo = true
   AND u.rol IN ('GERENTE_ZONAL', 'GERENTE')
   AND (
     u."branchId" = ctx.branch_id
     OR (u."zonaBranchIds")::jsonb ? ctx.branch_id::text
   );


-- ── 3. Upsert del usuario ────────────────────────────────────────────
WITH ctx AS (
  SELECT c.id AS company_id, b.id AS branch_id
    FROM "Company" c
    JOIN "Branch"  b ON b."companyId" = c.id AND b.activa = true
   WHERE c.nombre ILIKE '%MicroKapital%'
     AND b.nombre ILIKE 'Tenancingo'
), gerente AS (
  SELECT u.id
    FROM "User" u, ctx
   WHERE u."companyId" = ctx.company_id
     AND u.activo = true
     AND u.rol IN ('GERENTE_ZONAL', 'GERENTE')
     AND (
       u."branchId" = ctx.branch_id
       OR (u."zonaBranchIds")::jsonb ? ctx.branch_id::text
     )
   LIMIT 1
)
INSERT INTO "User" (
  id, "companyId", "branchId", rol,
  nombre, email, "passwordHash",
  activo, "gerenteId", "permisoAplicarPagos",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  ctx.company_id,
  ctx.branch_id,
  'COORDINADOR'::"UserRole",
  'Abraham Rosales Estrada',
  'abraham.rosales@microkapital.com',
  '$2a$12$aIbUOTVaIbsBrJndIF0ub.VNrpt4xYMkliAq1ylh73BMde5cvlL5e',
  true,
  (SELECT id FROM gerente),
  false,
  now(),
  now()
FROM ctx
ON CONFLICT ("companyId", email) DO UPDATE SET
  nombre     = EXCLUDED.nombre,
  rol        = EXCLUDED.rol,
  "branchId" = EXCLUDED."branchId",
  "gerenteId"= EXCLUDED."gerenteId",
  "updatedAt"= now();


-- ── 4. Verificacion ──────────────────────────────────────────────────
SELECT u.id, u.nombre, u.email, u.rol, b.nombre AS sucursal,
       g.nombre AS gerente, u.activo, u."createdAt"
  FROM "User" u
  LEFT JOIN "Branch" b ON b.id = u."branchId"
  LEFT JOIN "User"   g ON g.id = u."gerenteId"
 WHERE u.email = 'abraham.rosales@microkapital.com';


-- Si todo cuadra:
COMMIT;
-- Si no:
-- ROLLBACK;
