-- Agregar estado FINANCIADO: pagos del crédito anterior cubiertos por renovación anticipada
-- Se muestran en morado en el calendario (diferente a PAGADO verde, PENDIENTE amarillo, VENCIDO rojo)
ALTER TYPE "ScheduleStatus" ADD VALUE IF NOT EXISTS 'FINANCIADO';

-- Guardar qué IDs de pagos del crédito anterior se marcarán FINANCIADO al activar el nuevo crédito
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "pagosFinanciadosIds" JSONB;
