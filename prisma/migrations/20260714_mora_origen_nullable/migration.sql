-- Migration: MoraCobro.paymentOrigenId → nullable
-- Permite capturar mora/multa sola (sin pago principal aún) — el
-- coordinador cobra la mora ahora y el pago se aplica después.
-- El índice UNIQUE se mantiene: en Postgres varias filas con NULL
-- no chocan con el unique constraint.

ALTER TABLE "MoraCobro" ALTER COLUMN "paymentOrigenId" DROP NOT NULL;
