-- Migration: dirección y teléfono alterno del aval
-- Run this in Supabase SQL Editor for production
--
-- El aval ahora guarda también dirección y un segundo teléfono. Esto es
-- para alimentar el sistema de recordatorios automáticos por voz: si no
-- contesta el teléfono principal del aval, la IA puede intentar con el
-- alterno; y la dirección sirve como fallback para visita en campo.

ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "avalTelefonoAlt" TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "avalDireccion"   TEXT;
