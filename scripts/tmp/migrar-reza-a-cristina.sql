-- ═════════════════════════════════════════════════════════════════════════
-- MIGRAR 3 CLIENTAS de María Guadalupe Reza → Cristina Esquivel
--   MIGUEL IVAN SEGURA JARDON
--   MARGARITA NUÑEZ VASQUEZ
--   ARIANA AYALA GONZALEZ
-- Luego desactivar el perfil de Reza (si no le quedan clientes activos).
-- ═════════════════════════════════════════════════════════════════════════
--
-- IDs (obtenidos del listado de coordinadores):
--   María Guadalupe Reza Rosales      → 666a4dc0-3118-42aa-8cef-4e25b332db33
--   Cristina Berenice Esquivel García → 1ffc5781-5913-42fb-9430-29d6e0e4d397

BEGIN;

-- ── 1. Preview: quiénes son las 3 clientas y qué cartera tiene Reza hoy ─
SELECT
  c.id AS cliente_id,
  c."nombreCompleto",
  (SELECT COUNT(*) FROM "Loan" l WHERE l."clientId" = c.id AND l.estado = 'ACTIVE') AS activos,
  (SELECT COUNT(*) FROM "Loan" l WHERE l."clientId" = c.id AND l.estado = 'LIQUIDATED') AS liquidados
  FROM "Client" c
 WHERE c."cobradorId" = '666a4dc0-3118-42aa-8cef-4e25b332db33'
   AND c."eliminadoEn" IS NULL
   AND (
        c."nombreCompleto" ILIKE '%miguel%ivan%segura%jardon%'
     OR c."nombreCompleto" ILIKE '%margarita%nu%ez%vasquez%'
     OR c."nombreCompleto" ILIKE '%ariana%ayala%gonzalez%'
   )
 ORDER BY c."nombreCompleto";

-- Cartera actual completa de Reza (para saber qué queda tras la migración)
SELECT
  'REZA — clientes activos totales HOY' AS metric,
  COUNT(*) AS valor
  FROM "Client" c
 WHERE c."cobradorId" = '666a4dc0-3118-42aa-8cef-4e25b332db33'
   AND c."eliminadoEn" IS NULL;


-- ── 2. Migrar las 3 clientas: cobrador → Cristina + heredado de Reza ──
UPDATE "Client" SET
  "cobradorId"   = '1ffc5781-5913-42fb-9430-29d6e0e4d397',  -- Cristina
  "heredadoDeId" = '666a4dc0-3118-42aa-8cef-4e25b332db33',  -- Reza
  "heredadoAt"   = now()
 WHERE "cobradorId" = '666a4dc0-3118-42aa-8cef-4e25b332db33'
   AND "eliminadoEn" IS NULL
   AND (
        "nombreCompleto" ILIKE '%miguel%ivan%segura%jardon%'
     OR "nombreCompleto" ILIKE '%margarita%nu%ez%vasquez%'
     OR "nombreCompleto" ILIKE '%ariana%ayala%gonzalez%'
   );

-- ── 3. Sus loans vivos → Cristina ──────────────────────────────────
UPDATE "Loan" SET
  "cobradorId" = '1ffc5781-5913-42fb-9430-29d6e0e4d397'
 WHERE "clientId" IN (
   SELECT id FROM "Client"
    WHERE "cobradorId"   = '1ffc5781-5913-42fb-9430-29d6e0e4d397'
      AND "heredadoDeId" = '666a4dc0-3118-42aa-8cef-4e25b332db33'
      AND "heredadoAt"::date = CURRENT_DATE
      AND (
           "nombreCompleto" ILIKE '%miguel%ivan%segura%jardon%'
        OR "nombreCompleto" ILIKE '%margarita%nu%ez%vasquez%'
        OR "nombreCompleto" ILIKE '%ariana%ayala%gonzalez%'
      )
 )
 AND estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION');


-- ── 4. Verificación DESPUÉS ─────────────────────────────────────────
SELECT
  'REZA — clientes activos restantes' AS metric,
  COUNT(*) AS valor
  FROM "Client" c
 WHERE c."cobradorId" = '666a4dc0-3118-42aa-8cef-4e25b332db33'
   AND c."eliminadoEn" IS NULL
UNION ALL
SELECT
  'REZA — loans vivos restantes',
  COUNT(*)
  FROM "Loan" l
 WHERE l."cobradorId" = '666a4dc0-3118-42aa-8cef-4e25b332db33'
   AND l.estado IN ('ACTIVE','APPROVED','PENDING_APPROVAL','PENDING_REVIEW','IN_ACTIVATION')
UNION ALL
SELECT
  'CRISTINA — clientes heredados de Reza (debe ser 3)',
  COUNT(*)
  FROM "Client" c
 WHERE c."cobradorId"   = '1ffc5781-5913-42fb-9430-29d6e0e4d397'
   AND c."heredadoDeId" = '666a4dc0-3118-42aa-8cef-4e25b332db33'
   AND c."eliminadoEn"  IS NULL;


-- ── 5. Detalle de qué le queda a Reza (para decidir si desactivamos) ─
SELECT c.id, c."nombreCompleto",
       (SELECT COUNT(*) FROM "Loan" l WHERE l."clientId" = c.id AND l.estado = 'ACTIVE') AS loans_activos
  FROM "Client" c
 WHERE c."cobradorId" = '666a4dc0-3118-42aa-8cef-4e25b332db33'
   AND c."eliminadoEn" IS NULL
 ORDER BY c."nombreCompleto";


-- ⚠ IMPORTANTE: revisa el resultado del paso 5 antes de continuar.
-- Si sale VACÍO → Reza ya no tiene cartera activa, procede con paso 6.
-- Si tiene clientes activos → NO hagas el paso 6, dime qué queda y
-- decidimos qué hacer con esos antes de desactivarla.


-- ── 6. Desactivar Reza (solo si el paso 5 salió vacío) ──────────────
UPDATE "User" SET activo = false
 WHERE id = '666a4dc0-3118-42aa-8cef-4e25b332db33';

UPDATE "User" SET "gerenteId" = NULL
 WHERE "gerenteId" = '666a4dc0-3118-42aa-8cef-4e25b332db33';

SELECT id, nombre, activo FROM "User"
 WHERE id = '666a4dc0-3118-42aa-8cef-4e25b332db33';


-- Si el paso 5 mostró clientes activos restantes: ROLLBACK y avísame.
-- Si todo cuadra:
COMMIT;
-- Si algo se ve mal:
-- ROLLBACK;
