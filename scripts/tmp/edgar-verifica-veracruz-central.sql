-- ═════════════════════════════════════════════════════════════════════════
-- OTORGAR A EDGAR EL PERMISO DE VERIFICAR TRANSFERENCIAS DE VERACRUZ CENTRAL
-- ═════════════════════════════════════════════════════════════════════════
--
-- Edgar es Gerente Zonal de Veracruz. Por default un GZ NO verifica
-- transferencias de sucursales marcadas como verificacionCentralizada
-- (Veracruz Central, Minatitlan, Martinez de la Torre) — esas las
-- valida Mesa de Control. Este runbook le da un OVERRIDE por usuario
-- solo para Veracruz Central; Minatitlan y Martinez de la Torre las
-- sigue validando Mesa de Control.
--
-- Suma; no le quita permiso a Mesa de Control ni a nadie mas. Mesa de
-- Control tambien podra seguir validando Veracruz Central.
--
-- PRERREQUISITO: la migration 20260914_permiso_verificar_transfer
-- tiene que estar aplicada (agrega la columna
-- User.permisoVerificarTransferBranchIds JSONB).
--
-- Idempotente. Correr todo dentro de la transaccion. Ver los SELECT.

BEGIN;

-- ── 1. Verificar contexto: Edgar + sucursal Veracruz Central ─────────
-- Deben salir 2 filas: 1 con Edgar y 1 con Veracruz.
SELECT 'USER' AS tipo, u.id, u.nombre, u.rol, u.email,
       u."permisoVerificarTransferBranchIds" AS override_actual
  FROM "User" u
 WHERE u.email = 'edgar.solis@microkapital.com'
UNION ALL
SELECT 'BRANCH', b.id, b.nombre, NULL, NULL,
       jsonb_build_object('verificacionCentralizada', b."verificacionCentralizada")
  FROM "Branch" b
 WHERE b.nombre ILIKE 'Veracruz'
    OR b.nombre ILIKE 'Veracruz Central';


-- ── 2. Actualizar el override de Edgar ───────────────────────────────
-- Sobreescribe (no acumula) el array a solo Veracruz Central. Si
-- ya tenia otras sucursales listadas por alguna razon, este UPDATE
-- las reemplaza. Cambia el WHERE del branch si el nombre exacto es
-- distinto en tu ambiente.
UPDATE "User" u SET
  "permisoVerificarTransferBranchIds" = jsonb_build_array(b.id::text),
  "updatedAt" = now()
FROM "Branch" b
WHERE u.email = 'edgar.solis@microkapital.com'
  AND (b.nombre ILIKE 'Veracruz' OR b.nombre ILIKE 'Veracruz Central')
  AND b.activa = true;


-- ── 3. Verificar el resultado ────────────────────────────────────────
SELECT u.nombre AS coordinador, u.rol,
       u."permisoVerificarTransferBranchIds" AS override_final,
       -- Ademas mostramos el nombre de la sucursal referenciada para
       -- confirmar que quedo apuntando a la correcta.
       (SELECT b.nombre FROM "Branch" b
         WHERE b.id::text = ANY(SELECT jsonb_array_elements_text(u."permisoVerificarTransferBranchIds"))
         LIMIT 1) AS branch_referida
  FROM "User" u
 WHERE u.email = 'edgar.solis@microkapital.com';


-- Si todo cuadra:
COMMIT;
-- Si no:
-- ROLLBACK;
