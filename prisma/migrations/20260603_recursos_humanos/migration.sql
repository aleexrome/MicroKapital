-- Migration: Recursos Humanos — tabla EmployeeRecord independiente del modelo User.
-- Run this in Supabase SQL Editor for production.
--
-- El registro de RH lleva datos administrativos (sueldo, fecha de baja,
-- contacto de emergencia, etc.) y no necesita ligarse al User que opera
-- la app: hay empleados sin cuenta y cuentas sin ficha de RH.

-- Enum de estatus
DO $$ BEGIN
  CREATE TYPE "EmpleadoEstatus" AS ENUM ('ACTIVO', 'BAJA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabla principal
CREATE TABLE IF NOT EXISTS "EmployeeRecord" (
  "id"                  TEXT             NOT NULL,
  "companyId"           TEXT             NOT NULL,
  "nombre"              TEXT             NOT NULL,
  "sucursal"            TEXT,
  "estatus"             "EmpleadoEstatus" NOT NULL DEFAULT 'ACTIVO',
  "nacionalidad"        TEXT,
  "edad"                INTEGER,
  "identificacion"      TEXT,
  "estadoCivil"         TEXT,
  "domicilio"           TEXT,
  "sueldo"              DECIMAL(12, 2),
  "base"                TEXT,
  "puesto"              TEXT,
  "profesion"           TEXT,
  "telefono"            TEXT,
  "contactoEmergencia"  TEXT,
  "parentesco"          TEXT,
  "telefono2"           TEXT,
  "fechaEntrada"        DATE,
  "fechaBaja"           DATE,
  "createdAt"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "EmployeeRecord_pkey" PRIMARY KEY ("id")
);

-- FK a Company
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'EmployeeRecord_companyId_fkey'
  ) THEN
    ALTER TABLE "EmployeeRecord"
      ADD CONSTRAINT "EmployeeRecord_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Índice por companyId para la query del listado
CREATE INDEX IF NOT EXISTS "EmployeeRecord_companyId_idx" ON "EmployeeRecord" ("companyId");
