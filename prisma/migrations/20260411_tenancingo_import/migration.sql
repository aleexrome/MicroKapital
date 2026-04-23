-- ============================================================
-- MIGRACIÓN: TENANCINGO_.xlsx → Tablas Prisma
-- Ejecutar en: Supabase SQL Editor
-- Prerequisito: cargar primero el SQL de staging (tablas
--   asesores, grupos_solidarios, creditos_grupo,
--   creditos_individual, creditos_agil)
--
-- IDs fijos de producción:
--   Company:   19c8ceb6-64db-4ac1-8990-b97a0b12f11c
--   Branch:    83323ea9-e623-4fa4-bf16-1017c8c2b9ed
--   Jaime:     5097ba3b-9e0f-42b2-aa24-caca4e3b0fc7
--   Cristina:  1ffc5781-5913-42fb-9430-29d6e0e4d397
--   Luis:      e19ba894-0563-482f-88b3-fc6a0d221c13
--   Gpe Reza:  666a4dc0-3118-42aa-8cef-4e25b332db33
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 0: BORRAR DATOS DE PRUEBA (descomenta si los hay)
-- Verifica primero con:
--   SELECT COUNT(*) FROM "Client" WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed';
-- ============================================================
/*
DELETE FROM "PaymentSchedule"
  WHERE "loanId" IN (
    SELECT id FROM "Loan"
    WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed');

DELETE FROM "LoanApproval"
  WHERE "loanId" IN (
    SELECT id FROM "Loan"
    WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed');

DELETE FROM "Loan"    WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed';
DELETE FROM "LoanGroup" WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed';
DELETE FROM "Client"  WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed';
*/

-- ============================================================
-- TABLAS TEMPORALES DE APOYO
-- ============================================================

-- Asesor → cobrador_id + día de cobro solidario
CREATE TEMP TABLE _am (nombre TEXT PRIMARY KEY, cid TEXT, dia TEXT);
INSERT INTO _am VALUES
  ('JAIME ESTRADA REZA',       '5097ba3b-9e0f-42b2-aa24-caca4e3b0fc7', 'DOMINGO'),
  ('CRISTINA ESQUIVEL GARCIA', '1ffc5781-5913-42fb-9430-29d6e0e4d397', 'LUNES'),
  ('LUIS ROSALES ESTRADA',     'e19ba894-0563-482f-88b3-fc6a0d221c13', 'DOMINGO'),
  ('GUADALUPE REZA ROSALES',   '666a4dc0-3118-42aa-8cef-4e25b332db33', 'LUNES');

-- Fechas de cobro solidario por cobrador (8 períodos del ciclo actual)
CREATE TEMP TABLE _sd (
  cid TEXT PRIMARY KEY,
  p1 DATE, p2 DATE, p3 DATE, p4 DATE,
  p5 DATE, p6 DATE, p7 DATE, p8 DATE
);
INSERT INTO _sd VALUES
  ('5097ba3b-9e0f-42b2-aa24-caca4e3b0fc7',   -- JAIME  (Domingo)
   '2026-04-05','2026-04-12','2026-04-19','2026-04-26',
   '2026-05-03','2026-05-10','2026-05-17','2026-05-24'),
  ('1ffc5781-5913-42fb-9430-29d6e0e4d397',   -- CRISTINA (Lunes)
   '2026-03-30','2026-04-06','2026-04-13','2026-04-20',
   '2026-04-27','2026-05-04','2026-05-11','2026-05-18'),
  ('e19ba894-0563-482f-88b3-fc6a0d221c13',   -- LUIS  (Domingo)
   '2026-04-12','2026-04-19','2026-04-26','2026-05-03',
   '2026-05-10','2026-05-17','2026-05-24','2026-05-31'),
  ('666a4dc0-3118-42aa-8cef-4e25b332db33',   -- GPE REZA (Lunes)
   '2026-03-23','2026-03-30','2026-04-06','2026-04-13',
   '2026-04-20','2026-04-27','2026-05-04','2026-05-11');

-- ============================================================
-- PASO 1: CLIENTES  → "Client"
-- Recopila pares únicos (cliente, asesor) de las 3 tablas.
-- Los ágiles se deduplan: si hay versión con estatus='LIQUIDADO'
-- y otra sin él para el mismo (asesor, cliente, fecha), se toma
-- sólo una entrada en _cm (la persona es la misma).
-- ============================================================
CREATE TEMP TABLE _cm AS
WITH dedup_agil AS (
  SELECT DISTINCT ON (id_asesor, cliente, fecha_desembolso)
    id_asesor, cliente
  FROM creditos_agil
  ORDER BY id_asesor, cliente, fecha_desembolso,
           (CASE WHEN estatus = 'LIQUIDADO' THEN 0 ELSE 1 END)
)
SELECT
  gen_random_uuid()::TEXT AS client_id,
  u.cliente               AS nombre,
  a.nombre                AS asesor,
  am.cid                  AS cobrador_id
FROM (
  SELECT DISTINCT cg.cliente, cg.id_asesor FROM creditos_grupo     cg
  UNION
  SELECT DISTINCT ci.cliente, ci.id_asesor FROM creditos_individual ci
  UNION
  SELECT DISTINCT da.cliente, da.id_asesor FROM dedup_agil          da
) u
JOIN asesores a ON a.id_asesor = u.id_asesor
JOIN _am am     ON am.nombre   = a.nombre;

INSERT INTO "Client" (
  id, "companyId", "branchId", "cobradorId",
  "nombreCompleto", activo, "createdAt", "updatedAt"
)
SELECT
  client_id,
  '19c8ceb6-64db-4ac1-8990-b97a0b12f11c',
  '83323ea9-e623-4fa4-bf16-1017c8c2b9ed',
  cobrador_id, nombre, TRUE, NOW(), NOW()
FROM _cm;

-- ============================================================
-- PASO 2: GRUPOS SOLIDARIOS  → "LoanGroup"
-- ============================================================
CREATE TEMP TABLE _lgm AS
SELECT
  gen_random_uuid()::TEXT AS group_id,
  gs.id_grupo,
  am.cid AS cobrador_id
FROM grupos_solidarios gs
JOIN asesores a ON a.id_asesor = gs.id_asesor
JOIN _am am     ON am.nombre   = a.nombre;

INSERT INTO "LoanGroup" (id, "branchId", "cobradorId", nombre, activo, "createdAt")
SELECT
  lgm.group_id,
  '83323ea9-e623-4fa4-bf16-1017c8c2b9ed',
  lgm.cobrador_id,
  gs.nombre_grupo,
  TRUE, NOW()
FROM _lgm lgm
JOIN grupos_solidarios gs ON gs.id_grupo = lgm.id_grupo;

-- ============================================================
-- PASO 3: CRÉDITOS SOLIDARIOS  → "Loan" + "PaymentSchedule"
-- Estado: cartera_vigente = 0  → LIQUIDATED; si no → ACTIVE
-- Pagos:  num_pagos_realizados determina cuántos están PAID
-- Montos: cobro_p1..8 como montoPagado (NaN → pago_semanal)
-- ============================================================
CREATE TEMP TABLE _sl AS
SELECT
  gen_random_uuid()::TEXT AS loan_id,
  cm.client_id,
  lgm.group_id,
  am.cid  AS cobrador_id,
  am.dia  AS dia_pago,
  sd.p1, sd.p2, sd.p3, sd.p4, sd.p5, sd.p6, sd.p7, sd.p8,
  -- Importes (NaN → 0, redondeados a 2 decimales)
  COALESCE(ROUND(NULLIF(cg.kapital,         'NaN'::numeric), 2), 0) AS capital,
  COALESCE(ROUND(NULLIF(cg.interes,         'NaN'::numeric), 2), 0) AS interes,
  COALESCE(ROUND(NULLIF(cg.k_mas_i,         'NaN'::numeric), 2), 0) AS total_pago,
  COALESCE(ROUND(NULLIF(cg.pactado_semanal, 'NaN'::numeric), 2), 0) AS pago_semanal,
  -- Tasa de interés semanal = interes / (kapital * plazo)
  CASE
    WHEN NULLIF(cg.kapital, 'NaN'::numeric) > 0 AND COALESCE(cg.plazo_semanas, 0) > 0
    THEN ROUND(NULLIF(cg.interes, 'NaN'::numeric)
               / (NULLIF(cg.kapital, 'NaN'::numeric) * cg.plazo_semanas), 4)
    ELSE 0
  END AS tasa_interes,
  -- Cobros por período (NaN → 0)
  COALESCE(ROUND(NULLIF(cg.cobro_p1, 'NaN'::numeric), 2), 0) AS c1,
  COALESCE(ROUND(NULLIF(cg.cobro_p2, 'NaN'::numeric), 2), 0) AS c2,
  COALESCE(ROUND(NULLIF(cg.cobro_p3, 'NaN'::numeric), 2), 0) AS c3,
  COALESCE(ROUND(NULLIF(cg.cobro_p4, 'NaN'::numeric), 2), 0) AS c4,
  COALESCE(ROUND(NULLIF(cg.cobro_p5, 'NaN'::numeric), 2), 0) AS c5,
  COALESCE(ROUND(NULLIF(cg.cobro_p6, 'NaN'::numeric), 2), 0) AS c6,
  COALESCE(ROUND(NULLIF(cg.cobro_p7, 'NaN'::numeric), 2), 0) AS c7,
  COALESCE(ROUND(NULLIF(cg.cobro_p8, 'NaN'::numeric), 2), 0) AS c8,
  -- Estado del crédito
  CASE
    WHEN NULLIF(cg.cartera_vigente, 'NaN'::numeric) = 0 THEN 'LIQUIDATED'
    ELSE 'ACTIVE'
  END AS estado,
  -- Número de pagos ya realizados (columna generada en staging)
  COALESCE(cg.num_pagos_realizados, 0) AS num_pagos,
  COALESCE(cg.plazo_semanas, 8)::INT   AS plazo
FROM creditos_grupo cg
JOIN grupos_solidarios gs ON gs.id_grupo  = cg.id_grupo
JOIN _lgm lgm             ON lgm.id_grupo = gs.id_grupo
JOIN asesores a           ON a.id_asesor  = cg.id_asesor
JOIN _am am               ON am.nombre    = a.nombre
JOIN _cm cm               ON cm.nombre    = cg.cliente
                         AND cm.cobrador_id = am.cid
JOIN _sd sd               ON sd.cid       = am.cid;

-- Insertar Loan (SOLIDARIO)
INSERT INTO "Loan" (
  id, "companyId", "branchId", "cobradorId", "clientId", "loanGroupId",
  tipo, estado,
  capital, comision, "montoReal", "tasaInteres",
  interes, "totalPago", "pagoSemanal",
  plazo, "diaPago",
  "createdAt", "updatedAt"
)
SELECT
  loan_id,
  '19c8ceb6-64db-4ac1-8990-b97a0b12f11c',
  '83323ea9-e623-4fa4-bf16-1017c8c2b9ed',
  cobrador_id, client_id, group_id,
  'SOLIDARIO'::"LoanType", estado::"LoanStatus",
  capital, 0, capital, tasa_interes,
  interes, total_pago, pago_semanal,
  plazo, dia_pago,
  NOW(), NOW()
FROM _sl;

-- Insertar PaymentSchedule (SOLIDARIO: 8 períodos)
-- Se omiten créditos con pago_semanal = 0 (datos incompletos)
INSERT INTO "PaymentSchedule" (
  id, "loanId", "numeroPago", "fechaVencimiento",
  "montoEsperado", "montoPagado", estado, "pagadoAt", "createdAt"
)
SELECT
  gen_random_uuid()::TEXT,
  sl.loan_id,
  n,
  CASE n
    WHEN 1 THEN sl.p1 WHEN 2 THEN sl.p2 WHEN 3 THEN sl.p3 WHEN 4 THEN sl.p4
    WHEN 5 THEN sl.p5 WHEN 6 THEN sl.p6 WHEN 7 THEN sl.p7 WHEN 8 THEN sl.p8
  END AS fecha_venc,
  sl.pago_semanal,
  CASE
    WHEN sl.estado = 'LIQUIDATED' OR n <= sl.num_pagos THEN
      CASE n
        WHEN 1 THEN NULLIF(sl.c1, 0) WHEN 2 THEN NULLIF(sl.c2, 0)
        WHEN 3 THEN NULLIF(sl.c3, 0) WHEN 4 THEN NULLIF(sl.c4, 0)
        WHEN 5 THEN NULLIF(sl.c5, 0) WHEN 6 THEN NULLIF(sl.c6, 0)
        WHEN 7 THEN NULLIF(sl.c7, 0) WHEN 8 THEN NULLIF(sl.c8, 0)
        ELSE NULL
      END
    ELSE 0
  END AS monto_pagado,
  CASE
    WHEN sl.estado = 'LIQUIDATED' OR n <= sl.num_pagos
    THEN 'PAID'::"ScheduleStatus"
    ELSE 'PENDING'::"ScheduleStatus"
  END,
  CASE
    WHEN sl.estado = 'LIQUIDATED' OR n <= sl.num_pagos THEN
      (CASE n
        WHEN 1 THEN sl.p1 WHEN 2 THEN sl.p2 WHEN 3 THEN sl.p3 WHEN 4 THEN sl.p4
        WHEN 5 THEN sl.p5 WHEN 6 THEN sl.p6 WHEN 7 THEN sl.p7 WHEN 8 THEN sl.p8
      END)::TIMESTAMP
    ELSE NULL
  END AS pagado_at,
  NOW()
FROM _sl sl
CROSS JOIN generate_series(1, 8) AS n
WHERE sl.pago_semanal > 0;

-- ============================================================
-- PASO 4: CRÉDITOS INDIVIDUALES  → "Loan" + "PaymentSchedule"
-- Estado: adeudo = 0   → LIQUIDATED; si no → ACTIVE
-- Schedule: hasta 12 fechas reales de la hoja de cálculo
-- ============================================================
CREATE TEMP TABLE _il AS
SELECT
  gen_random_uuid()::TEXT AS loan_id,
  cm.client_id,
  am.cid  AS cobrador_id,
  -- Fechas
  ci.fecha_desembolso,
  UPPER(COALESCE(ci.dia_pago, am.dia)) AS dia_pago,
  ci.fecha_pago_1  AS p1,  ci.fecha_pago_2  AS p2,  ci.fecha_pago_3  AS p3,
  ci.fecha_pago_4  AS p4,  ci.fecha_pago_5  AS p5,  ci.fecha_pago_6  AS p6,
  ci.fecha_pago_7  AS p7,  ci.fecha_pago_8  AS p8,  ci.fecha_pago_9  AS p9,
  ci.fecha_pago_10 AS p10, ci.fecha_pago_11 AS p11, ci.fecha_pago_12 AS p12,
  -- Importes (NaN → 0)
  COALESCE(ROUND(NULLIF(ci.kapital,         'NaN'::numeric), 2), 0) AS capital,
  COALESCE(ROUND(NULLIF(ci.comision,        'NaN'::numeric), 2), 0) AS comision,
  COALESCE(
    ROUND(NULLIF(ci.real,    'NaN'::numeric), 2),
    ROUND(NULLIF(ci.kapital, 'NaN'::numeric), 2),
    0)                                                               AS monto_real,
  COALESCE(ROUND(NULLIF(ci.pago_por_mil,    'NaN'::numeric), 4), 0) AS tasa_interes,
  COALESCE(ROUND(NULLIF(ci.interes,         'NaN'::numeric), 2), 0) AS interes,
  COALESCE(ROUND(NULLIF(ci.k_mas_i,         'NaN'::numeric), 2), 0) AS total_pago,
  COALESCE(ROUND(NULLIF(ci.pactado_semanal, 'NaN'::numeric), 2), 0) AS pago_semanal,
  COALESCE(ci.plazo_semanas, 12)::INT AS plazo,
  -- Número de pagos (NaN → 0)
  COALESCE(NULLIF(ci.num_pago, 'NaN'::numeric)::INT, 0) AS num_pagos,
  -- Estado
  CASE
    WHEN NULLIF(ci.adeudo, 'NaN'::numeric) = 0 THEN 'LIQUIDATED'
    ELSE 'ACTIVE'
  END AS estado
FROM creditos_individual ci
JOIN asesores a ON a.id_asesor = ci.id_asesor
JOIN _am am     ON am.nombre   = a.nombre
JOIN _cm cm     ON cm.nombre   = ci.cliente
              AND cm.cobrador_id = am.cid;

-- Insertar Loan (INDIVIDUAL)
INSERT INTO "Loan" (
  id, "companyId", "branchId", "cobradorId", "clientId",
  tipo, estado,
  capital, comision, "montoReal", "tasaInteres",
  interes, "totalPago", "pagoSemanal",
  plazo, "fechaDesembolso", "diaPago",
  "createdAt", "updatedAt"
)
SELECT
  loan_id,
  '19c8ceb6-64db-4ac1-8990-b97a0b12f11c',
  '83323ea9-e623-4fa4-bf16-1017c8c2b9ed',
  cobrador_id, client_id,
  'INDIVIDUAL'::"LoanType", estado::"LoanStatus",
  capital, comision, monto_real, tasa_interes,
  interes, total_pago, pago_semanal,
  plazo, fecha_desembolso, dia_pago,
  NOW(), NOW()
FROM _il;

-- Insertar PaymentSchedule (INDIVIDUAL: hasta 12 períodos con fechas reales)
INSERT INTO "PaymentSchedule" (
  id, "loanId", "numeroPago", "fechaVencimiento",
  "montoEsperado", "montoPagado", estado, "pagadoAt", "createdAt"
)
SELECT
  gen_random_uuid()::TEXT,
  il.loan_id, p.num, p.fecha,
  il.pago_semanal,
  CASE
    WHEN il.estado = 'LIQUIDATED' OR p.num <= il.num_pagos
    THEN il.pago_semanal
    ELSE 0
  END,
  CASE
    WHEN il.estado = 'LIQUIDATED' OR p.num <= il.num_pagos
    THEN 'PAID'::"ScheduleStatus"
    ELSE 'PENDING'::"ScheduleStatus"
  END,
  CASE
    WHEN il.estado = 'LIQUIDATED' OR p.num <= il.num_pagos
    THEN p.fecha::TIMESTAMP
    ELSE NULL
  END,
  NOW()
FROM _il il
CROSS JOIN LATERAL (
  SELECT 1  AS num, il.p1  AS fecha UNION ALL
  SELECT 2,         il.p2            UNION ALL
  SELECT 3,         il.p3            UNION ALL
  SELECT 4,         il.p4            UNION ALL
  SELECT 5,         il.p5            UNION ALL
  SELECT 6,         il.p6            UNION ALL
  SELECT 7,         il.p7            UNION ALL
  SELECT 8,         il.p8            UNION ALL
  SELECT 9,         il.p9            UNION ALL
  SELECT 10,        il.p10           UNION ALL
  SELECT 11,        il.p11           UNION ALL
  SELECT 12,        il.p12
) AS p(num, fecha)
WHERE p.fecha IS NOT NULL
  AND il.pago_semanal > 0;

-- ============================================================
-- PASO 5: CRÉDITOS ÁGILES  → "Loan" + "PaymentSchedule"
-- Deduplicación: si existe la misma persona/fecha con
--   estatus='LIQUIDADO' y otra sin él, se toma la LIQUIDADO.
-- Estado: estatus='LIQUIDADO' | saldo_actual=0 | adeudo_total=0
--         → LIQUIDATED; si no → ACTIVE
-- Schedule: hasta 24 fechas diarias reales; se omiten si
--   pago_diario=0 (datos históricos incompletos)
-- ============================================================
CREATE TEMP TABLE _al AS
WITH dedup AS (
  SELECT DISTINCT ON (ca.id_asesor, ca.cliente, ca.fecha_desembolso)
    ca.*
  FROM creditos_agil ca
  ORDER BY ca.id_asesor, ca.cliente, ca.fecha_desembolso,
           (CASE WHEN ca.estatus = 'LIQUIDADO' THEN 0 ELSE 1 END)
)
SELECT
  gen_random_uuid()::TEXT AS loan_id,
  cm.client_id,
  am.cid  AS cobrador_id,
  -- Fechas
  d.fecha_desembolso,
  d.fecha_pago_1  AS p1,  d.fecha_pago_2  AS p2,  d.fecha_pago_3  AS p3,
  d.fecha_pago_4  AS p4,  d.fecha_pago_5  AS p5,  d.fecha_pago_6  AS p6,
  d.fecha_pago_7  AS p7,  d.fecha_pago_8  AS p8,  d.fecha_pago_9  AS p9,
  d.fecha_pago_10 AS p10, d.fecha_pago_11 AS p11, d.fecha_pago_12 AS p12,
  d.fecha_pago_13 AS p13, d.fecha_pago_14 AS p14, d.fecha_pago_15 AS p15,
  d.fecha_pago_16 AS p16, d.fecha_pago_17 AS p17, d.fecha_pago_18 AS p18,
  d.fecha_pago_19 AS p19, d.fecha_pago_20 AS p20, d.fecha_pago_21 AS p21,
  d.fecha_pago_22 AS p22, d.fecha_pago_23 AS p23, d.fecha_pago_24 AS p24,
  -- Importes (NaN → 0)
  COALESCE(ROUND(NULLIF(d.capital,      'NaN'::numeric), 2), 0) AS capital,
  COALESCE(ROUND(NULLIF(d.xc_por_mil,   'NaN'::numeric), 4), 0) AS tasa_interes,
  COALESCE(ROUND(NULLIF(d.ganancina,    'NaN'::numeric), 2), 0) AS interes,
  COALESCE(ROUND(NULLIF(d.adeudo_total, 'NaN'::numeric), 2), 0) AS total_pago,
  COALESCE(ROUND(NULLIF(d.pago_diario,  'NaN'::numeric), 2), 0) AS pago_diario,
  COALESCE(d.plazo_dias, 24)::INT AS plazo,
  COALESCE(NULLIF(d.num_pago, 'NaN'::numeric)::INT, 0) AS num_pagos,
  -- Estado
  CASE
    WHEN d.estatus = 'LIQUIDADO'                         THEN 'LIQUIDATED'
    WHEN NULLIF(d.saldo_actual,  'NaN'::numeric) = 0     THEN 'LIQUIDATED'
    WHEN NULLIF(d.adeudo_total,  'NaN'::numeric) = 0     THEN 'LIQUIDATED'
    ELSE 'ACTIVE'
  END AS estado
FROM dedup d
JOIN asesores a ON a.id_asesor = d.id_asesor
JOIN _am am     ON am.nombre   = a.nombre
JOIN _cm cm     ON cm.nombre   = d.cliente
              AND cm.cobrador_id = am.cid;

-- Insertar Loan (AGIL)
INSERT INTO "Loan" (
  id, "companyId", "branchId", "cobradorId", "clientId",
  tipo, estado,
  capital, comision, "montoReal", "tasaInteres",
  interes, "totalPago", "pagoDiario",
  plazo, "fechaDesembolso",
  "createdAt", "updatedAt"
)
SELECT
  loan_id,
  '19c8ceb6-64db-4ac1-8990-b97a0b12f11c',
  '83323ea9-e623-4fa4-bf16-1017c8c2b9ed',
  cobrador_id, client_id,
  'AGIL'::"LoanType", estado::"LoanStatus",
  capital, 0, capital, tasa_interes,
  interes, total_pago, pago_diario,
  plazo, fecha_desembolso,
  NOW(), NOW()
FROM _al;

-- Insertar PaymentSchedule (AGIL: hasta 24 períodos diarios)
-- Se omiten los créditos LIQUIDADO históricos sin pago_diario
INSERT INTO "PaymentSchedule" (
  id, "loanId", "numeroPago", "fechaVencimiento",
  "montoEsperado", "montoPagado", estado, "pagadoAt", "createdAt"
)
SELECT
  gen_random_uuid()::TEXT,
  al.loan_id, p.num, p.fecha,
  al.pago_diario,
  CASE
    WHEN al.estado = 'LIQUIDATED' OR p.num <= al.num_pagos
    THEN al.pago_diario
    ELSE 0
  END,
  CASE
    WHEN al.estado = 'LIQUIDATED' OR p.num <= al.num_pagos
    THEN 'PAID'::"ScheduleStatus"
    ELSE 'PENDING'::"ScheduleStatus"
  END,
  CASE
    WHEN al.estado = 'LIQUIDATED' OR p.num <= al.num_pagos
    THEN p.fecha::TIMESTAMP
    ELSE NULL
  END,
  NOW()
FROM _al al
CROSS JOIN LATERAL (
  SELECT 1  AS num, al.p1  AS fecha UNION ALL
  SELECT 2,         al.p2            UNION ALL
  SELECT 3,         al.p3            UNION ALL
  SELECT 4,         al.p4            UNION ALL
  SELECT 5,         al.p5            UNION ALL
  SELECT 6,         al.p6            UNION ALL
  SELECT 7,         al.p7            UNION ALL
  SELECT 8,         al.p8            UNION ALL
  SELECT 9,         al.p9            UNION ALL
  SELECT 10,        al.p10           UNION ALL
  SELECT 11,        al.p11           UNION ALL
  SELECT 12,        al.p12           UNION ALL
  SELECT 13,        al.p13           UNION ALL
  SELECT 14,        al.p14           UNION ALL
  SELECT 15,        al.p15           UNION ALL
  SELECT 16,        al.p16           UNION ALL
  SELECT 17,        al.p17           UNION ALL
  SELECT 18,        al.p18           UNION ALL
  SELECT 19,        al.p19           UNION ALL
  SELECT 20,        al.p20           UNION ALL
  SELECT 21,        al.p21           UNION ALL
  SELECT 22,        al.p22           UNION ALL
  SELECT 23,        al.p23           UNION ALL
  SELECT 24,        al.p24
) AS p(num, fecha)
WHERE p.fecha IS NOT NULL
  AND al.pago_diario > 0;

-- ============================================================
-- VERIFICACIÓN FINAL (se ve en el resultado del query)
-- ============================================================
SELECT tabla, conteo FROM (
  SELECT 1 AS ord, 'Clientes'           AS tabla,
    COUNT(*) AS conteo
  FROM "Client"
  WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed'
  UNION ALL
  SELECT 2, 'Grupos solidarios',
    COUNT(*)
  FROM "LoanGroup"
  WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed'
  UNION ALL
  SELECT 3, 'Créditos SOLIDARIO',
    COUNT(*)
  FROM "Loan"
  WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed'
    AND tipo = 'SOLIDARIO'
  UNION ALL
  SELECT 4, 'Créditos INDIVIDUAL',
    COUNT(*)
  FROM "Loan"
  WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed'
    AND tipo = 'INDIVIDUAL'
  UNION ALL
  SELECT 5, 'Créditos AGIL',
    COUNT(*)
  FROM "Loan"
  WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed'
    AND tipo = 'AGIL'
  UNION ALL
  SELECT 6, 'Créditos ACTIVE',
    COUNT(*)
  FROM "Loan"
  WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed'
    AND estado = 'ACTIVE'
  UNION ALL
  SELECT 7, 'Créditos LIQUIDATED',
    COUNT(*)
  FROM "Loan"
  WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed'
    AND estado = 'LIQUIDATED'
  UNION ALL
  SELECT 8, 'Calendarios de pago',
    COUNT(*)
  FROM "PaymentSchedule"
  WHERE "loanId" IN (
    SELECT id FROM "Loan"
    WHERE "branchId" = '83323ea9-e623-4fa4-bf16-1017c8c2b9ed')
) t ORDER BY ord;

COMMIT;
