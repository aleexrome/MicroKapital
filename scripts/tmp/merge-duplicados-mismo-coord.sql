-- ═════════════════════════════════════════════════════════════════════════
-- MERGE DE DUPLICADOS DEL MISMO COORDINADOR
-- ═════════════════════════════════════════════════════════════════════════
--
-- Fusiona 18 pares donde AMBOS registros pertenecen al MISMO coordinador
-- y el perdedor no tiene préstamos activos. Casos típicos:
--   - Coordinador registró al cliente dos veces (una con typo en nombre,
--     otra correcto) y le dio préstamos en ambos.
--   - Shell viejo (sin datos) + registro rico posterior — mismo coord.
--   - Un registro con SOLIDARIO y otro con ÁGIL/INDIVIDUAL (el mismo
--     cliente físico usó ambos productos, pero cada uno bajo un cliente_id
--     distinto).
--
-- En todos estos casos es SEGURO fusionar sin decisión gerencial porque
-- el coordinador es el mismo — nadie pierde al cliente en su vista, y el
-- cobrador de los loans se mantiene intacto.
--
-- Los casos de DIFERENTE coordinador (o mismo coord con ambos con
-- préstamos vivos) NO están aquí — requieren decisión manual.

BEGIN;

-- perdedor/ganador van como TEXT porque Prisma mapea String @id a text
-- (no a uuid); igualar tipos evita el error 42883.
CREATE TEMP TABLE dedup_map (perdedor text, ganador text, cliente text, coord text);

INSERT INTO dedup_map (perdedor, ganador, cliente, coord) VALUES
  -- CURP match, mismo coord
  ('42399b37-d56d-4a70-9d27-b3d34190d900','3a8b4255-2a49-4bb6-bd11-d15b9f06e4a4','CAMERINA BEATRIZ MARQUEZ',     'Karen Itzel Vidal'),
  ('652bc891-4e45-4047-ac11-b702fa199622','7767bc40-503a-4dba-bc6d-eb6db5fe2c5c','ALICIA/DAMARIS LOBATO SIMBRON', 'Karen Itzel Vidal'),
  ('0229e624-de3b-4fe3-8473-3bbcf9148c01','283818d2-02ad-4173-a207-69cfb5488bf6','MARGARITA NUÑEZ VASQUEZ',       'María Guadalupe Reza'),
  ('fa9606e4-e17c-4bfa-a9b9-f66115749412','ae81cbac-082e-4616-91c0-41bb8a232f2f','MARTHA VARA OLMEDO',            'María Guadalupe Reza'),
  ('ddde121c-68ec-4d7e-9231-1d84072fd9bf','c6f81c11-ff56-408a-a84d-b4ee8928f997','CITLALLI DE LOS SANTOS AYALA',  'María Guadalupe Reza'),
  ('d4d48c79-57fc-4661-a5a8-ba29d257b457','1b1fedef-d6f4-499a-a0af-dd21500fd7f4','NICOLASA OROZCO ENTOTE',        'Guadalupe Castro'),
  ('dd91c665-961e-4d11-a4f0-60a2d7320628','652012e8-3f79-49f9-8158-22587542f573','JOSEFINA/PAOLA POLO MUNGUIA',   'Catalina Salazar'),
  ('5fe868ab-d8a0-498b-a3b1-4e95fcf16850','ca4fef81-6020-421d-9476-b3387f07028d','SONIA/DONIA DAMIAN SOTO',       'Valentina Rodríguez'),
  ('5dc2831b-5399-4f6e-a800-d5a461fd265e','49c36e6e-7f6c-4897-817d-8155b6b30c48','MARGARITA/MARTHA TRUJILLO',     'Luis Alberto Rosales'),
  -- Nombre match, mismo coord
  ('d0d4845d-036d-4bfc-b6bd-c32621b807b3','011d8ed2-11b1-4dba-a44b-6b0121e9d137','ADRIANA ESCAMILLA GUADARRAMA',  'Jaime Alonso Estrada'),
  ('7d7201e9-fa92-4db1-93ba-164781c613c9','fff34188-4c3e-43f3-906c-1b97fdfc893f','ALEJANDRO JUAREZ LINARES',      'Luis Alberto Rosales'),
  ('651cd90d-215e-4891-a526-42bf692b4284','c36846be-af2a-46bd-bb20-eb0fb36be256','ANABEL RINCON ROSAS',           'Karen Itzel Vidal'),
  ('c296f591-3dcd-41ec-bb2b-69d5e684d8f5','0ceaeb13-3e80-444c-a540-e0b97b9eab3e','LESLIE BERRIOZABAL MELCHOR',    'America Yazmin Zarazua'),
  ('69c601e7-aeb4-4612-8227-1ce4f96314b0','256a0513-c452-4687-aa8c-e32042ee76d6','NADIA ELENA ROMERO ORTIZ',      'Paula Angélica Medina'),
  ('fdd8d834-c6b7-457e-bd57-7a96ff9412f3','e36e88b2-0e4e-480e-b0c0-ce6f4a8bbe6d','NOELIA VILLANUEVA ESPEJO',      'Paula Angélica Medina'),
  ('e219b728-cb84-40c7-a1d8-7e2d4e8e5342','72406a61-5033-49d0-a1a7-9e9cb00c2283','NUBIA MARIELA VENTURA APARICIO','Miguel Ángel Morales'),
  ('43bfb126-4505-48d0-bad3-4f59991da8d8','eff99a9c-7d7f-48c1-b5f6-44b459518067','SUSANA RIVERA ROSAS',           'Paula Angélica Medina'),
  ('ef90ef8a-1130-442b-bdb6-ab188e18096a','e2b431b8-6ee1-448b-9ca3-1a7c0415c19b','TRINIDAD VILLA ALMAZAN',        'Guadalupe Castro');


-- ── Estado ANTES ──────────────────────────────────────────────────────
SELECT
  m.cliente,
  m.coord,
  m.perdedor,
  (SELECT COUNT(*) FROM "Loan"           WHERE "clientId" = m.perdedor) AS p_loans,
  (SELECT COUNT(*) FROM "Payment"        WHERE "clientId" = m.perdedor) AS p_pagos,
  (SELECT COUNT(*) FROM "MoraCobro"      WHERE "clientId" = m.perdedor) AS p_moras,
  (SELECT COUNT(*) FROM "ClientDocument" WHERE "clientId" = m.perdedor) AS p_docs,
  m.ganador,
  (SELECT COUNT(*) FROM "Loan"           WHERE "clientId" = m.ganador) AS g_loans,
  (SELECT COUNT(*) FROM "Payment"        WHERE "clientId" = m.ganador) AS g_pagos,
  (SELECT COUNT(*) FROM "MoraCobro"      WHERE "clientId" = m.ganador) AS g_moras,
  (SELECT COUNT(*) FROM "ClientDocument" WHERE "clientId" = m.ganador) AS g_docs
FROM dedup_map m
ORDER BY m.cliente;


-- ── Mover TODO del perdedor al ganador ───────────────────────────────
UPDATE "Loan"           l  SET "clientId" = m.ganador FROM dedup_map m WHERE l."clientId"  = m.perdedor;
UPDATE "Payment"        p  SET "clientId" = m.ganador FROM dedup_map m WHERE p."clientId"  = m.perdedor;
UPDATE "MoraCobro"      mc SET "clientId" = m.ganador FROM dedup_map m WHERE mc."clientId" = m.perdedor;
UPDATE "ClientDocument" d  SET "clientId" = m.ganador FROM dedup_map m WHERE d."clientId"  = m.perdedor;
UPDATE "ScoreEvent"     s  SET "clientId" = m.ganador FROM dedup_map m WHERE s."clientId"  = m.perdedor;
-- Cobertura solidaria: el campo real en Payment es cubridoPorClienteId.
UPDATE "Payment"        p  SET "cubridoPorClienteId" = m.ganador FROM dedup_map m WHERE p."cubridoPorClienteId" = m.perdedor;


-- ── Rellenar campos vacíos del ganador con datos del perdedor ────────
UPDATE "Client" c1 SET
  telefono             = COALESCE(c1.telefono,             c2.telefono),
  "telefonoAlt"        = COALESCE(c1."telefonoAlt",        c2."telefonoAlt"),
  email                = COALESCE(c1.email,                c2.email),
  domicilio            = COALESCE(c1.domicilio,            c2.domicilio),
  "numIne"             = COALESCE(c1."numIne",             c2."numIne"),
  curp                 = COALESCE(c1.curp,                 c2.curp),
  "referenciaNombre"   = COALESCE(c1."referenciaNombre",   c2."referenciaNombre"),
  "referenciaTelefono" = COALESCE(c1."referenciaTelefono", c2."referenciaTelefono"),
  "fechaNacimiento"    = COALESCE(c1."fechaNacimiento",    c2."fechaNacimiento"),
  "fotoUrl"            = COALESCE(c1."fotoUrl",            c2."fotoUrl")
FROM "Client" c2, dedup_map m
WHERE c1.id = m.ganador AND c2.id = m.perdedor;


-- ── Soft-delete de los perdedores ────────────────────────────────────
UPDATE "Client" c SET "eliminadoEn" = now()
FROM dedup_map m WHERE c.id = m.perdedor;


-- ── Estado DESPUÉS ────────────────────────────────────────────────────
SELECT
  m.cliente,
  m.perdedor,
  (SELECT "eliminadoEn" FROM "Client" WHERE id = m.perdedor)::date AS p_eliminado,
  (SELECT COUNT(*) FROM "Loan"           WHERE "clientId" = m.perdedor) AS p_loans,
  (SELECT COUNT(*) FROM "Payment"        WHERE "clientId" = m.perdedor) AS p_pagos,
  m.ganador,
  (SELECT COUNT(*) FROM "Loan"           WHERE "clientId" = m.ganador) AS g_loans,
  (SELECT COUNT(*) FROM "Payment"        WHERE "clientId" = m.ganador) AS g_pagos,
  (SELECT COUNT(*) FROM "MoraCobro"      WHERE "clientId" = m.ganador) AS g_moras,
  (SELECT COUNT(*) FROM "ClientDocument" WHERE "clientId" = m.ganador) AS g_docs
FROM dedup_map m
ORDER BY m.cliente;


-- Si todo cuadra:
COMMIT;
-- Si algo pinta mal:
-- ROLLBACK;


-- ═════════════════════════════════════════════════════════════════════════
-- QUE QUEDA PENDIENTE PARA REVISIÓN MANUAL
-- ═════════════════════════════════════════════════════════════════════════
--
-- ▶ CASOS CON DOS COORDINADORES DISTINTOS (unos con activos y otros sin):
--   Aquí necesitas decidir si el cliente físico se queda con el
--   coordinador nuevo, el viejo, o se mantienen separados hasta que se
--   liquide el préstamo pendiente. La mayoría son "transferencias de
--   cartera Miguel → América" en San Mateo Atenco y "Jessika → Eduardo"
--   en Minatitlán.
--
--   ─ DAVID CRUZ SOTO           (Jessika 0 vivos, Eduardo 1 vivo)
--   ─ ANA KAREN FLORES GONZALEZ (Miguel 0, América 1)
--   ─ SOCORRO GALLARDO          (Miguel 0, América 1)
--   ─ KARINA GOMEZ              (Miguel 0, América 1)
--   ─ MATILDE GUTIERREZ         (Jessika 0, Eduardo 1)
--   ─ EDUARDO MACIAS            (SAIRA 0, Catalina 1)
--   ─ KARLA MEJIA               (Miguel 0, América 1)
--   ─ MARIA LUISA MORALES       (Miguel 0, América 1)
--   ─ ESTEFANI PALOMARES        (Miguel 0, América 1)
--   ─ JULIA REYES               (Miguel 0, América 1)
--   ─ RAQUEL REDONDO            (Miguel 0, América 1)
--   ─ DIANA SANCHEZ             (Miguel 0, América 1)
--   ─ ALEJANDRA ESCUDERO        (Miguel 0, América 1)
--   ─ BRENDA VALENCIA           (Miguel 0, América 1)
--   ─ ELIZABETH NAVA            (Miguel 0, América 1)
--   ─ ERIKA ORTIZ               (Miguel 0, América 1)
--   ─ ERIKA ZUÑIGA              (Guadalupe 0, Valentina 1)
--   ─ EULALIA VILCHIS           (Diana E. 0, Valentina 2 vivos)
--   ─ EVELIN GUTIERREZ          (Miguel 0, América 1)
--   ─ KARLA MARTÍNEZ            (Miguel 0, América 1)
--   ─ LETICIA SEGURA            (Miguel 0, América 1)
--   ─ MAGDALENA QUINTERO        (Guadalupe 0, Valentina 2)
--   ─ MARIA ELENA ORTIZ         (Héctor 0, Diana Ayala 1)
--   ─ MARIA FERNANDA DE JESUS   (Miguel 0, América 1)
--   ─ MARIA SONIA ALVAREZ       (Miguel 0, América 0 — ambos sin vivos)
--   ─ MARIBEL MARTINEZ          (Héctor 0, Diana Ayala 1)
--   ─ MIRIAM DALILA             (Miguel 0, América 1)
--   ─ NAYELI VIDAL              (Miguel 0, América 1)
--   ─ NICOLASA HERAZ            (Miguel 0, América 1)
--   ─ ROSA VALENCIA             (Miguel 0, América 1)
--   ─ ROSALINA CAMACHO          (Cristina 0, Jaime 1)
--   ─ SILVIA MENDOZA            (Guadalupe 0, Valentina 1)
--   ─ TERESA MERCADO            (Héctor 0, Diana Ayala 1)
--   ─ VERONICA CRUZ             (Miguel 0, América 1)
--   ─ YENI MENDEZ               (Miguel 0, América 1)
--   ─ ANA ROSA CASTRO           (Reza 0, Jaime 1)
--   ─ ROCIO ROBLES Miguel shell (Miguel 0 vivos + dos América vivos)
--   ─ SARA GONZALEZ Miguel shell(Miguel 0 vivos + dos América vivos)
--   ─ CLAUDIA VENTURA Miguel shl(Miguel 0 vivos + dos América vivos)
--
--
-- ▶ CASOS CON AMBOS LADOS ACTIVOS (dinero en dos coords, decisión gerencial):
--   ─ MARIA DEL CARMEN ALTAMIRANO (Eduardo vs Jessika)
--   ─ MARIBEL MIJANGOS            (Eduardo vs Jessika)
--   ─ FRANCISCA BONILLA           (Eduardo vs Jessika)
--   ─ BEATRIZ SEGURA              (Reza vs Luis Alberto)
--   ─ SOLEDAD MILLAN              (Reza vs Luis Alberto)
--   ─ PATRICIA NICOLAS            (Valentina vs Diana Ayala)
--
--
-- ▶ CASOS DE MISMO COORD PERO AMBOS CON PRÉSTAMOS VIVOS (bug: dos loans
--   paralelos al mismo cliente físico):
--   ─ SARA GONZALEZ VALENCIA  (América x2)
--   ─ JESSICA LIZZET NAVA     (América x2)
--   ─ ROCIO ROBLES            (América x2)
--   ─ CLAUDIA VENTURA         (América x2)
--   ─ ANA MARÍA ESQUIVEL      (América x2)
--   ─ CAVA870314 VILLEGAS     (Karen x2, pero NOMBRES DISTINTOS —
--                              probable CURP mal capturado en uno)
