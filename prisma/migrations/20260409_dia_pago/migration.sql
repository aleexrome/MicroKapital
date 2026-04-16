-- AlterTable: agregar campo diaPago al modelo Loan
-- Día de la semana en que el cliente realiza su pago (DOMINGO, LUNES, etc.)
ALTER TABLE "Loan" ADD COLUMN "diaPago" TEXT;
