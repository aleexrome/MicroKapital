-- =====================================================================
-- DIAGNÓSTICO de filas afectadas por el bug de zona horaria pre-PR #78
-- =====================================================================
--
-- Antes del fix de PR #78, los endpoints escribían `new Date()` (instante
-- UTC del servidor) en columnas `timestamp without time zone` que
-- representan fecha calendario CDMX. Cuando la operación ocurría entre
-- las 18:00 y las 23:59 CDMX, la hora UTC resultante (00:00–05:59 del
-- DÍA SIGUIENTE) caía en la "semana siguiente" al filtrarse contra
-- rangos sáb–vie corregidos.
--
-- Estas queries SOLO leen — no modifican datos. Confirma volumen y
-- muestra la distribución antes de aprobar el UPDATE en
-- backfill-timezone-fix.sql.
--
-- Criterio de detección: EXTRACT(HOUR FROM col) < 6
--   - Hora 00:00–05:59 UTC = 18:00–23:59 CDMX del día anterior
--   - Hora 06:00 exacto NO se cuenta (es lo que produce todayMx() del
--     código nuevo, que ya está normalizado al inicio del día CDMX)
-- =====================================================================


-- ── 1) Loan.fechaDesembolso — total afectados ───────────────────────────
SELECT COUNT(*) AS total_loans_afectados
FROM "Loan"
WHERE "fechaDesembolso" IS NOT NULL
  AND EXTRACT(HOUR FROM "fechaDesembolso") < 6;


-- ── 2) Loan.fechaDesembolso — distribución por mes ──────────────────────
SELECT
  TO_CHAR(date_trunc('month', "fechaDesembolso"), 'YYYY-MM') AS mes,
  COUNT(*) AS afectados
FROM "Loan"
WHERE "fechaDesembolso" IS NOT NULL
  AND EXTRACT(HOUR FROM "fechaDesembolso") < 6
GROUP BY date_trunc('month', "fechaDesembolso")
ORDER BY mes DESC;


-- ── 3) Loan.fechaDesembolso — distribución por estado ───────────────────
SELECT
  estado,
  COUNT(*) AS afectados
FROM "Loan"
WHERE "fechaDesembolso" IS NOT NULL
  AND EXTRACT(HOUR FROM "fechaDesembolso") < 6
GROUP BY estado
ORDER BY afectados DESC;


-- ── 4) Loan.fechaDesembolso — sample para auditoría visual ──────────────
--
-- ATENCIÓN: revisa la columna `fecha_corregida_propuesta`. Si una fila
-- tiene `fechaDesembolso = '2026-05-09 00:00:00'` (medianoche UTC exacto),
-- es candidato a haber sido escrito por approve/route.ts:95 vía
-- `new Date('2026-05-09')` desde la contrapropuesta del DG — es decir,
-- NO es el bug del `new Date()` automático, es una fecha que el DG eligió
-- manualmente como "May 9". Restar 6h convertiría May 9 → May 8.
--
-- Si ves muchas filas con hora exacta 00:00:00.000, considera ajustar el
-- criterio del UPDATE para excluirlas (`EXTRACT(HOUR ...) > 0` o algo
-- equivalente sobre minute/second/ms).

SELECT
  id,
  "numeroCredito",
  estado,
  "fechaDesembolso",
  "fechaDesembolso" - INTERVAL '6 hours' AS fecha_corregida_propuesta
FROM "Loan"
WHERE "fechaDesembolso" IS NOT NULL
  AND EXTRACT(HOUR FROM "fechaDesembolso") < 6
ORDER BY "fechaDesembolso" DESC
LIMIT 30;


-- ── 5) Loan.fechaDesembolso — cuántos son exactos a 00:00:00.000 ────────
--
-- (Candidatos a ser fechas elegidas por el DG, NO bug automático)
SELECT COUNT(*) AS loans_con_hora_exacta_00_00_00
FROM "Loan"
WHERE "fechaDesembolso" IS NOT NULL
  AND "fechaDesembolso"::time = '00:00:00';


-- ── 6) PaymentSchedule.pagadoAt — total afectados ───────────────────────
SELECT COUNT(*) AS total_schedules_afectados
FROM "PaymentSchedule"
WHERE "pagadoAt" IS NOT NULL
  AND EXTRACT(HOUR FROM "pagadoAt") < 6;


-- ── 7) PaymentSchedule.pagadoAt — distribución por mes ──────────────────
SELECT
  TO_CHAR(date_trunc('month', "pagadoAt"), 'YYYY-MM') AS mes,
  COUNT(*) AS afectados
FROM "PaymentSchedule"
WHERE "pagadoAt" IS NOT NULL
  AND EXTRACT(HOUR FROM "pagadoAt") < 6
GROUP BY date_trunc('month', "pagadoAt")
ORDER BY mes DESC;


-- ── 8) PaymentSchedule.pagadoAt — distribución por estado ───────────────
SELECT
  estado,
  COUNT(*) AS afectados
FROM "PaymentSchedule"
WHERE "pagadoAt" IS NOT NULL
  AND EXTRACT(HOUR FROM "pagadoAt") < 6
GROUP BY estado
ORDER BY afectados DESC;


-- ── 9) PaymentSchedule.pagadoAt — sample para auditoría visual ──────────
SELECT
  ps.id,
  ps."numeroPago",
  ps.estado,
  ps."pagadoAt",
  ps."pagadoAt" - INTERVAL '6 hours' AS fecha_corregida_propuesta,
  l."numeroCredito"
FROM "PaymentSchedule" ps
JOIN "Loan" l ON l.id = ps."loanId"
WHERE ps."pagadoAt" IS NOT NULL
  AND EXTRACT(HOUR FROM ps."pagadoAt") < 6
ORDER BY ps."pagadoAt" DESC
LIMIT 30;
