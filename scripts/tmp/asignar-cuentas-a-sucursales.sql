-- Asignación de cuentas bancarias a sucursales según la regla:
--   Veracruz            : Ixmel Banorte, Carol BBVA, Carmela Azteca
--   Martínez de la Torre: Luis Banorte, Diana Azteca
--   Minatitlán          : Ixmel Banorte, Carol BBVA, Ixmel Banamex (ambas Suc.)
--   San Mateo Atenco    : Cristina BBVA, Ixmel Banorte
--   Toluca              : Ixmel Banorte, Luis Banorte, Carmela Azteca, Cristina BBVA
--   Tenancingo          : todas (central)
--
-- Preview:
SELECT id, nombre FROM "Branch" WHERE activa = true ORDER BY nombre;
SELECT id, banco, titular FROM "CompanyBankAccount" WHERE activa = true ORDER BY titular, banco;

BEGIN;

WITH
  ba AS (
    SELECT id, titular, banco FROM "CompanyBankAccount" WHERE activa = true
  ),
  b AS (
    SELECT id, nombre FROM "Branch" WHERE activa = true
  ),
  -- IDs por alias corto para el mapeo declarativo
  cuentas AS (
    SELECT
      (SELECT id FROM ba WHERE titular ILIKE '%carol vel%'                                                          LIMIT 1) AS carol_bbva,
      (SELECT id FROM ba WHERE titular ILIKE '%ixmel%garcia rosales%' AND banco = 'BANORTE'                          LIMIT 1) AS ixmel_banorte,
      (SELECT id FROM ba WHERE titular ILIKE '%luis rosales%' AND banco = 'BANORTE'                                  LIMIT 1) AS luis_banorte,
      (SELECT id FROM ba WHERE titular ILIKE '%diana ayala%' AND banco = 'AZTECA'                                    LIMIT 1) AS diana_azteca,
      (SELECT id FROM ba WHERE titular ILIKE '%carmela moreno%' AND banco ILIKE '%azteca%'                           LIMIT 1) AS carmela_azteca,
      (SELECT id FROM ba WHERE titular ILIKE '%cristina%esquivel%' AND banco = 'BBVA'                                LIMIT 1) AS cristina_bbva,
      (SELECT id FROM ba WHERE titular ILIKE '%ixmel%' AND banco ILIKE '%citibanamex%' AND "numeroCuenta" ILIKE '%7020%' LIMIT 1) AS ixmel_bmex_7020,
      (SELECT id FROM ba WHERE titular ILIKE '%ixmel%' AND banco ILIKE '%citibanamex%' AND "numeroCuenta" ILIKE '%7017%' LIMIT 1) AS ixmel_bmex_7017,
      (SELECT id FROM ba WHERE titular ILIKE '%ixmel%' AND banco = 'Nu'                                              LIMIT 1) AS ixmel_nu,
      (SELECT id FROM ba WHERE titular ILIKE '%ixmel%' AND banco ILIKE '%spin%'                                      LIMIT 1) AS ixmel_spin,
      (SELECT id FROM ba WHERE titular ILIKE '%petra%'                                                               LIMIT 1) AS petra_spin
  ),
  sucursales AS (
    SELECT
      (SELECT id FROM b WHERE nombre ILIKE '%veracruz%'         LIMIT 1) AS veracruz,
      (SELECT id FROM b WHERE nombre ILIKE '%martinez%torre%'
                          OR nombre ILIKE '%martínez%torre%'    LIMIT 1) AS mdlt,
      (SELECT id FROM b WHERE nombre ILIKE '%minatitl%'         LIMIT 1) AS minatitlan,
      (SELECT id FROM b WHERE nombre ILIKE '%san mateo%atenco%' LIMIT 1) AS sma,
      (SELECT id FROM b WHERE nombre ILIKE '%toluca%'           LIMIT 1) AS toluca,
      (SELECT id FROM b WHERE nombre ILIKE '%tenancingo%'       LIMIT 1) AS tenancingo
  ),
  asignaciones (bankAccountId, branchId) AS (
    -- Veracruz
    SELECT c.ixmel_banorte,     s.veracruz   FROM cuentas c, sucursales s
    UNION ALL SELECT c.carol_bbva,      s.veracruz   FROM cuentas c, sucursales s
    UNION ALL SELECT c.carmela_azteca,  s.veracruz   FROM cuentas c, sucursales s
    -- Martínez de la Torre
    UNION ALL SELECT c.luis_banorte,    s.mdlt       FROM cuentas c, sucursales s
    UNION ALL SELECT c.diana_azteca,    s.mdlt       FROM cuentas c, sucursales s
    -- Minatitlán
    UNION ALL SELECT c.ixmel_banorte,   s.minatitlan FROM cuentas c, sucursales s
    UNION ALL SELECT c.carol_bbva,      s.minatitlan FROM cuentas c, sucursales s
    UNION ALL SELECT c.ixmel_bmex_7020, s.minatitlan FROM cuentas c, sucursales s
    UNION ALL SELECT c.ixmel_bmex_7017, s.minatitlan FROM cuentas c, sucursales s
    -- San Mateo Atenco
    UNION ALL SELECT c.cristina_bbva,   s.sma        FROM cuentas c, sucursales s
    UNION ALL SELECT c.ixmel_banorte,   s.sma        FROM cuentas c, sucursales s
    -- Toluca
    UNION ALL SELECT c.ixmel_banorte,   s.toluca     FROM cuentas c, sucursales s
    UNION ALL SELECT c.luis_banorte,    s.toluca     FROM cuentas c, sucursales s
    UNION ALL SELECT c.carmela_azteca,  s.toluca     FROM cuentas c, sucursales s
    UNION ALL SELECT c.cristina_bbva,   s.toluca     FROM cuentas c, sucursales s
    -- Tenancingo — acceso a todas (central)
    UNION ALL SELECT c.carol_bbva,      s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.ixmel_banorte,   s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.luis_banorte,    s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.diana_azteca,    s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.carmela_azteca,  s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.cristina_bbva,   s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.ixmel_bmex_7020, s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.ixmel_bmex_7017, s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.ixmel_nu,        s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.ixmel_spin,      s.tenancingo FROM cuentas c, sucursales s
    UNION ALL SELECT c.petra_spin,      s.tenancingo FROM cuentas c, sucursales s
  )
INSERT INTO "BankAccountBranch" ("bankAccountId", "branchId")
SELECT bankAccountId, branchId
  FROM asignaciones
 WHERE bankAccountId IS NOT NULL AND branchId IS NOT NULL
ON CONFLICT DO NOTHING;

-- Verificar
SELECT b.nombre AS sucursal, ba.titular, ba.banco, ba."numeroCuenta"
  FROM "BankAccountBranch" bab
  JOIN "Branch" b               ON b.id  = bab."branchId"
  JOIN "CompanyBankAccount" ba  ON ba.id = bab."bankAccountId"
 ORDER BY b.nombre, ba.titular;

COMMIT;
