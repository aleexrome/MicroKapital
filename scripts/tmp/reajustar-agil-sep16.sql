-- ═════════════════════════════════════════════════════════════════════════
-- REAJUSTE: Creditos Agil que recorrieron pagos por 16-sep-2026 festivo
-- ═════════════════════════════════════════════════════════════════════════
--
-- Hasta 2026-09-15 la lista de festivos fijos tenia 16-sep marcado como
-- inhabil. En la practica MicroKapital si opera ese dia, asi que los
-- creditos Agil generaron sus calendarios recorriendo cualquier pago
-- del 16-sep al 17-sep, y arrastraron un dia mas todos los pagos
-- posteriores del calendario.
--
-- Este runbook baja 1 dia habil cada schedule pendiente de creditos
-- Agil vivos (ACTIVE / APPROVED / IN_ACTIVATION) cuyo calendario cruza
-- el 16-sep. Solo toca schedules NO cobrados (estado distinto a PAID,
-- ADVANCE, FINANCIADO); los cobrados se dejan tal cual porque el dinero
-- ya entro.
--
-- ATENCION: correr UNA sola vez. No es idempotente (correrlo dos veces
-- dobla la correccion). Envuelto en BEGIN/COMMIT: si algo raro,
-- ROLLBACK antes de commitear.
--
-- YA CORRIDO EN PROD 2026-09-15 (resultado: 0 pagos en finde,
-- verificacion OK).

BEGIN;

-- ── 1. Cuantos loans y schedules se van a mover ──────────────────────
WITH candidatos AS (
  SELECT ps.id
    FROM "PaymentSchedule" ps
    JOIN "Loan" l ON l.id = ps."loanId"
   WHERE l.tipo = 'AGIL'
     AND l.estado IN ('ACTIVE','APPROVED','IN_ACTIVATION')
     AND ps."fechaVencimiento" >= '2026-09-17'
     AND ps.estado NOT IN ('PAID','ADVANCE','FINANCIADO')
     AND EXISTS (
       SELECT 1 FROM "PaymentSchedule" ps2
        WHERE ps2."loanId" = ps."loanId"
          AND ps2."fechaVencimiento" < '2026-09-16'
     )
)
SELECT (SELECT COUNT(DISTINCT ps."loanId")
          FROM "PaymentSchedule" ps
         WHERE ps.id IN (SELECT id FROM candidatos)) AS creditos_afectados,
       (SELECT COUNT(*) FROM candidatos)             AS schedules_a_mover;


-- ── 2. Preview detallado (top 30) ────────────────────────────────────
SELECT cl."nombreCompleto" AS cliente,
       ps."numeroPago",
       ps."fechaVencimiento"::date AS antes,
       (CASE EXTRACT(DOW FROM ps."fechaVencimiento")
          WHEN 0 THEN ps."fechaVencimiento" - INTERVAL '2 days'
          WHEN 1 THEN ps."fechaVencimiento" - INTERVAL '3 days'
          WHEN 6 THEN ps."fechaVencimiento" - INTERVAL '1 day'
          ELSE      ps."fechaVencimiento" - INTERVAL '1 day'
        END)::date AS despues
  FROM "PaymentSchedule" ps
  JOIN "Loan"   l  ON l.id = ps."loanId"
  JOIN "Client" cl ON cl.id = l."clientId"
 WHERE l.tipo = 'AGIL'
   AND l.estado IN ('ACTIVE','APPROVED','IN_ACTIVATION')
   AND ps."fechaVencimiento" >= '2026-09-17'
   AND ps.estado NOT IN ('PAID','ADVANCE','FINANCIADO')
   AND EXISTS (
     SELECT 1 FROM "PaymentSchedule" ps2
      WHERE ps2."loanId" = ps."loanId"
        AND ps2."fechaVencimiento" < '2026-09-16'
   )
 ORDER BY cl."nombreCompleto", ps."numeroPago"
 LIMIT 30;


-- ── 3. Aplicar el ajuste ─────────────────────────────────────────────
UPDATE "PaymentSchedule" ps SET
  "fechaVencimiento" = CASE EXTRACT(DOW FROM ps."fechaVencimiento")
    WHEN 0 THEN ps."fechaVencimiento" - INTERVAL '2 days'  -- Dom → Vie
    WHEN 1 THEN ps."fechaVencimiento" - INTERVAL '3 days'  -- Lun → Vie
    WHEN 6 THEN ps."fechaVencimiento" - INTERVAL '1 day'   -- Sab → Vie
    ELSE      ps."fechaVencimiento" - INTERVAL '1 day'     -- Mar-Vie → dia habil anterior
  END
FROM "Loan" l
WHERE ps."loanId" = l.id
  AND l.tipo = 'AGIL'
  AND l.estado IN ('ACTIVE','APPROVED','IN_ACTIVATION')
  AND ps."fechaVencimiento" >= '2026-09-17'
  AND ps.estado NOT IN ('PAID','ADVANCE','FINANCIADO')
  AND EXISTS (
    SELECT 1 FROM "PaymentSchedule" ps2
     WHERE ps2."loanId" = ps."loanId"
       AND ps2."fechaVencimiento" < '2026-09-16'
  );


-- ── 4. AuditLog ──────────────────────────────────────────────────────
INSERT INTO "AuditLog" (
  id, "userId", accion, tabla, "registroId",
  "valoresAnteriores", "valoresNuevos", "createdAt"
)
VALUES (
  gen_random_uuid(), NULL,
  'REAJUSTE_AGIL_SEP16', 'PaymentSchedule', '(varios)',
  jsonb_build_object('motivo', '16-sep era festivo, se corrio 1 dia habil'),
  jsonb_build_object('scriptRunAt', now()::text),
  now()
);


-- ── 5. Verificacion: 0 pagos en fin de semana en la ventana afectada ─
SELECT COUNT(*) AS pagos_en_finde
  FROM "PaymentSchedule" ps
  JOIN "Loan" l ON l.id = ps."loanId"
 WHERE l.tipo = 'AGIL'
   AND ps."fechaVencimiento" BETWEEN '2026-09-16' AND '2026-11-01'
   AND EXTRACT(DOW FROM ps."fechaVencimiento") IN (0, 6);


COMMIT;
-- Si algo raro: ROLLBACK;
