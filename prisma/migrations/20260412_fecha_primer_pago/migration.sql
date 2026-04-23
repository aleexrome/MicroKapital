-- Añadir campo para que DG fije la fecha del primer pago en la contrapropuesta
-- Esta fecha ancla el calendario de pagos al activar el crédito
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "fechaPrimerPago" TIMESTAMP;
