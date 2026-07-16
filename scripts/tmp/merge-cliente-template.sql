-- ═════════════════════════════════════════════════════════════════════════
-- PLANTILLA: Fusionar dos registros de cliente sin perder información
-- ═════════════════════════════════════════════════════════════════════════
--
-- Reemplaza los uuids marcados con «GANADOR» y «PERDEDOR» según tu
-- decisión (basada en el query duplicados-detalle.sql).
--
-- GANADOR = el registro que se queda en cartera. Idealmente el que tiene
--           actividad reciente (préstamos activos, pagos recientes).
-- PERDEDOR = el que se soft-elimina. Todo su historial y préstamos vivos
--            se mueven al GANADOR antes de borrarlo.
--
-- Corre TODO dentro de la transacción. Al final verifica el SELECT y
-- decides COMMIT o ROLLBACK.
--
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Ver estado ANTES (para comparar al final)
SELECT
  id, "nombreCompleto", telefono, "numIne", curp,
  (SELECT COUNT(*) FROM "Loan" WHERE "clientId" = c.id) AS loans,
  (SELECT COUNT(*) FROM "Payment" WHERE "clientId" = c.id) AS pagos,
  (SELECT COUNT(*) FROM "MoraCobro" WHERE "clientId" = c.id) AS moras,
  (SELECT COUNT(*) FROM "ClientDocument" WHERE "clientId" = c.id) AS docs
FROM "Client" c
WHERE id IN ('GANADOR-uuid', 'PERDEDOR-uuid');


-- 2. Mover TODO lo del PERDEDOR al GANADOR
UPDATE "Loan"           SET "clientId" = 'GANADOR-uuid' WHERE "clientId" = 'PERDEDOR-uuid';
UPDATE "Payment"        SET "clientId" = 'GANADOR-uuid' WHERE "clientId" = 'PERDEDOR-uuid';
UPDATE "MoraCobro"      SET "clientId" = 'GANADOR-uuid' WHERE "clientId" = 'PERDEDOR-uuid';
UPDATE "ClientDocument" SET "clientId" = 'GANADOR-uuid' WHERE "clientId" = 'PERDEDOR-uuid';
UPDATE "ScoreEvent"     SET "clientId" = 'GANADOR-uuid' WHERE "clientId" = 'PERDEDOR-uuid';

-- Cobertura grupal (Payment que cubre a otro cliente): reasignar si aplica
UPDATE "Payment"
   SET "coberturaClientId" = 'GANADOR-uuid'
 WHERE "coberturaClientId" = 'PERDEDOR-uuid';


-- 3. Rellenar campos vacíos del GANADOR con datos del PERDEDOR (COALESCE
--    solo pisa cuando el destino es NULL — no destruye datos que el
--    ganador ya tenga)
UPDATE "Client" c1 SET
  telefono            = COALESCE(c1.telefono,            c2.telefono),
  "telefonoAlt"       = COALESCE(c1."telefonoAlt",       c2."telefonoAlt"),
  email               = COALESCE(c1.email,               c2.email),
  domicilio           = COALESCE(c1.domicilio,           c2.domicilio),
  "numIne"            = COALESCE(c1."numIne",            c2."numIne"),
  curp                = COALESCE(c1.curp,                c2.curp),
  "referenciaNombre"  = COALESCE(c1."referenciaNombre",  c2."referenciaNombre"),
  "referenciaTelefono"= COALESCE(c1."referenciaTelefono",c2."referenciaTelefono"),
  "fechaNacimiento"   = COALESCE(c1."fechaNacimiento",   c2."fechaNacimiento"),
  "fotoUrl"           = COALESCE(c1."fotoUrl",           c2."fotoUrl")
FROM "Client" c2
WHERE c1.id = 'GANADOR-uuid' AND c2.id = 'PERDEDOR-uuid';


-- 4. Soft-delete del PERDEDOR (ya sin loans/pagos/etc. — todo fue movido)
UPDATE "Client" SET "eliminadoEn" = now() WHERE id = 'PERDEDOR-uuid';


-- 5. Verificar estado DESPUÉS
SELECT
  id, "nombreCompleto", telefono, "numIne", curp, "eliminadoEn",
  (SELECT COUNT(*) FROM "Loan" WHERE "clientId" = c.id) AS loans,
  (SELECT COUNT(*) FROM "Payment" WHERE "clientId" = c.id) AS pagos,
  (SELECT COUNT(*) FROM "MoraCobro" WHERE "clientId" = c.id) AS moras,
  (SELECT COUNT(*) FROM "ClientDocument" WHERE "clientId" = c.id) AS docs
FROM "Client" c
WHERE id IN ('GANADOR-uuid', 'PERDEDOR-uuid');


-- Si el GANADOR quedó con la suma completa y el PERDEDOR tiene loans=0
-- pagos=0 moras=0 docs=0 y eliminadoEn != null → COMMIT.
-- Si algo se ve mal → ROLLBACK.

-- COMMIT;
-- ROLLBACK;


-- ═════════════════════════════════════════════════════════════════════════
-- PLANTILLA SIMPLE: soft-delete sin merge (cuando el PERDEDOR está vacío)
-- ═════════════════════════════════════════════════════════════════════════
-- Úsala solo si loans=0 pagos=0 moras=0 docs=0 en el PERDEDOR (verifica
-- con el SELECT del paso 1). Si tiene algo, usa la plantilla de arriba.

-- BEGIN;
-- UPDATE "Client" SET "eliminadoEn" = now() WHERE id = 'PERDEDOR-uuid';
-- COMMIT;


-- ═════════════════════════════════════════════════════════════════════════
-- PLANTILLA: cambiar coordinador de un cliente + sus loans
-- ═════════════════════════════════════════════════════════════════════════
-- Cuando decides que el cliente se queda pero cambia de coordinador
-- (útil cuando dos coords tienen el mismo cliente y uno "gana" la
-- titularidad). Los loans siguen al cliente automáticamente porque
-- también tienen cobradorId.

-- BEGIN;
-- UPDATE "Client" SET "cobradorId" = 'NUEVO-coordinador-uuid' WHERE id = 'cliente-uuid';
-- UPDATE "Loan"   SET "cobradorId" = 'NUEVO-coordinador-uuid' WHERE "clientId" = 'cliente-uuid';
-- COMMIT;
