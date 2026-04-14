-- Permiso especial: permite a un usuario (ej. gerente de sucursal) aplicar y deshacer
-- pagos de los clientes de su propia sucursal, sin ser Director General ni Super Admin.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permisoAplicarPagos" BOOLEAN NOT NULL DEFAULT FALSE;
