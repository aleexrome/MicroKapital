-- ═════════════════════════════════════════════════════════════════════════
-- MERGE MASIVO DE CLIENTES DUPLICADOS — CATEGORÍA SEGURA
-- ═════════════════════════════════════════════════════════════════════════
--
-- Fusiona 43 pares de duplicados donde el PERDEDOR no tiene préstamos
-- activos. Para cada par:
--
--   1. Mueve TODO lo del perdedor al ganador (loans, pagos, moras, docs,
--      score events, coberturas grupales). Los cobradorId de los loans se
--      mantienen intactos para no romper el histórico de quién los dio.
--   2. Rellena campos vacíos del ganador con datos del perdedor
--      (COALESCE — no pisa lo que el ganador ya tiene).
--   3. Soft-elimina al perdedor (eliminadoEn = now()).
--
-- Se ejecuta dentro de una transacción con verificación previa y posterior.
-- Revisa los SELECT antes de hacer COMMIT. Si algo cuadra mal → ROLLBACK.
--
-- Los 12 casos CRÍTICOS (ambos con préstamos vivos) están listados como
-- comentario al final para que los revises manualmente.

BEGIN;

-- ── Mapping perdedor → ganador ────────────────────────────────────────
CREATE TEMP TABLE dedup_map (perdedor uuid, ganador uuid, cliente text);

INSERT INTO dedup_map (perdedor, ganador, cliente) VALUES
  ('646f6615-a40f-4760-8ee7-5dd1ac92a58d','1d00f19a-4c16-4973-8cd9-4299afb0dc4b','DAVID CRUZ SOTO'),
  ('0bf715d2-7fee-49fe-ba0c-f00d6d4e7542','27fa4a16-dbb2-41d6-a0b1-bfb7703ad1a0','ANA KAREN FLORES GONZALEZ'),
  ('b2d6884b-4f79-4e31-9490-067ca48e4064','b952536d-478a-49e8-9924-cba0c96dfc3d','MARIA DEL SOCORRO GALLARDO RAMOS'),
  ('2f44604d-b75c-4131-b1d8-d4f003694b7d','94658bcb-fb34-464a-a21f-5c222f4a0321','KARINA GOMEZ MONTELLANO'),
  ('f9d0ce47-17f8-456e-bde6-b9b16d5b4404','3fd0631a-8d54-44a6-b4ce-f5712cf5f1d5','MATILDE GUTIERREZ ALVARADO'),
  ('652bc891-4e45-4047-ac11-b702fa199622','7767bc40-503a-4dba-bc6d-eb6db5fe2c5c','ALICIA/DAMARIS LOBATO SIMBRON'),
  ('42399b37-d56d-4a70-9d27-b3d34190d900','3a8b4255-2a49-4bb6-bd11-d15b9f06e4a4','CAMERINA BEATRIZ MARQUEZ CASAS'),
  ('8c5fdf0e-5fb9-4b09-9c1f-dd91361c8413','f13961df-3dd0-4d04-acbd-d111fb8d0209','EDUARDO MACIAS GARCIA'),
  ('7a04b31f-f2f0-4ac7-8f31-5af8b437f1a2','c122f448-e6c4-4b86-82f3-f575e72d786b','KARLA FABIOLA MEJIA GONZALEZ'),
  ('d583c571-5e8d-473b-9bdb-18fc9e2fec08','ae0bf053-7d90-4c4e-8d19-5f632fae4789','MARIA LUISA MORALES CHAVEZ'),
  ('0229e624-de3b-4fe3-8473-3bbcf9148c01','283818d2-02ad-4173-a207-69cfb5488bf6','MARGARITA NUÑEZ VASQUEZ'),
  ('d4d48c79-57fc-4661-a5a8-ba29d257b457','1b1fedef-d6f4-499a-a0af-dd21500fd7f4','NICOLASA OROZCO ENTOTE'),
  ('88a10839-ad4c-4db6-b41a-c9878293d847','2de70557-e7e9-4d3a-84e6-247524dd870f','ESTEFANI YAZMIN PALOMARES REYES'),
  ('dd91c665-961e-4d11-a4f0-60a2d7320628','652012e8-3f79-49f9-8158-22587542f573','JOSEFINA/PAOLA POLO MUNGUIA'),
  ('aa061be2-c6c9-4531-aca9-7f45698a9227','8cb45bff-ef05-4389-9654-03b82cbecece','JULIA REYES BRACAMONTE'),
  ('c5c33b71-7f53-4700-836f-39a015db4365','379ae5cb-258d-4940-b484-b3d85c6b837d','RAQUEL REDONDO HERNANDEZ'),
  ('a79e6cfe-288b-4ea7-ba1c-c2f7871dc32b','08c350a6-ab57-4363-90ab-d1b14d1e861d','DIANA SANCHEZ ALVA'),
  ('5fe868ab-d8a0-498b-a3b1-4e95fcf16850','ca4fef81-6020-421d-9476-b3387f07028d','SONIA/DONIA DAMIAN SOTO'),
  ('5dc2831b-5399-4f6e-a800-d5a461fd265e','49c36e6e-7f6c-4897-817d-8155b6b30c48','MARGARITA/MARTHA TRUJILLO NIETO'),
  ('fa9606e4-e17c-4bfa-a9b9-f66115749412','ae81cbac-082e-4616-91c0-41bb8a232f2f','MARTHA VARA OLMEDO'),
  ('ba32c2f6-348b-45f8-a459-2eaf1baf0573','c1ebcf07-5928-4bba-9810-3b56a915c830','ALEJANDRA ESCUDERO BALDERAS'),
  ('7d7201e9-fa92-4db1-93ba-164781c613c9','fff34188-4c3e-43f3-906c-1b97fdfc893f','ALEJANDRO JUAREZ LINARES'),
  ('651cd90d-215e-4891-a526-42bf692b4284','c36846be-af2a-46bd-bb20-eb0fb36be256','ANABEL RINCON ROSAS'),
  ('bc1fab45-dd61-4e7f-b20f-c2874c70e7a5','281d3194-e614-491a-b45b-30ee1b8cc97f','BRENDA SARA VALENCIA'),
  ('ddde121c-68ec-4d7e-9231-1d84072fd9bf','c6f81c11-ff56-408a-a84d-b4ee8928f997','CITLALLI DE LOS SANTOS AYALA'),
  ('edb7e72d-03c5-4510-bf69-7393e3ce3150','aebb7c60-2e42-4c06-b2c4-d22b17c8466b','ELIZABETH NAVA SANCHEZ'),
  ('13f620a9-6928-424f-9a5d-d14873702afd','57f51767-b519-45d9-8e85-b0eecd6de38d','ERIKA ORTIZ GARCIA'),
  ('60d50714-d9c9-413a-86b5-1540b9755404','22aa544e-e3f0-4a46-b10c-7dbfe8eddb17','ERIKA ZUÑIGA NICOLAS'),
  ('0339cd45-6beb-4cec-b656-a72dbcbcfa6a','f9d18f99-77c3-4b61-896b-b772c967c5d5','EVELIN GUTIERREZ DELGADILLO'),
  ('76a06d6d-43cc-40b2-9baf-2ce048baf054','e3069f30-99e1-4f71-92e9-651563d5bb19','KARLA ISABEL MARTÍNEZ ALVARADO'),
  ('c296f591-3dcd-41ec-bb2b-69d5e684d8f5','0ceaeb13-3e80-444c-a540-e0b97b9eab3e','LESLIE YOLOTZIN BERRIOZABAL MELCHOR'),
  ('1826c92f-625f-4193-94e6-b914cd4f0797','666cfe27-b257-4274-9fc7-79ad43cdcbe6','LETICIA SEGURA BECERRIL'),
  ('6f81bc0d-03c6-4d5c-ba25-30617604d812','6d80bea5-fb61-4855-ada8-71a3c147b299','MAGDALENA QUINTERO VILCHIS'),
  ('36f53289-e329-4d48-89ad-cb4a60669ccd','5799bab3-9c68-4afb-a5c5-d339404a23a4','MARIA ELENA ORTIZ BERNAL'),
  ('7a4d8a05-d132-4060-95cb-d66aa8e887b6','3ffd9143-68c7-4543-afe8-08149aef1e01','MARIA FERNANDA DE JESUS ROBLES'),
  ('c630a821-4d61-44c7-b356-acd33b060e30','3541e999-52a3-4fbe-93bf-83d95ed690b9','MARIA SONIA ALVAREZ MANJARREZ'),
  ('571ae541-f412-48a6-abd3-7367e33ba681','6b7d151a-5786-4e14-9356-6c0de8c547ca','MARIBEL MARTINEZ HERNANDEZ'),
  ('ec6c5d53-a323-42a7-9d2e-011e09f06e0f','2706af0a-6446-4db6-89e3-80c3487fb5d4','MIRIAM DALILA ROSALES ROMERO'),
  ('69c601e7-aeb4-4612-8227-1ce4f96314b0','256a0513-c452-4687-aa8c-e32042ee76d6','NADIA ELENA ROMERO ORTIZ'),
  ('938a221c-4696-4ea5-b3dc-449de0773014','1317b382-e7d0-4856-a904-2ee69f427270','NAYELI VIDAL PEREZ'),
  ('1cb08308-bdce-41be-a78e-ea5a041bbfc1','961825b3-d594-4b16-bf8b-9ca56546dce3','NICOLASA HERAZ CASTAÑEDA'),
  ('fdd8d834-c6b7-457e-bd57-7a96ff9412f3','e36e88b2-0e4e-480e-b0c0-ce6f4a8bbe6d','NOELIA VILLANUEVA ESPEJO'),
  ('e219b728-cb84-40c7-a1d8-7e2d4e8e5342','72406a61-5033-49d0-a1a7-9e9cb00c2283','NUBIA MARIELA VENTURA APARICIO'),
  ('b6193588-6820-4899-8b29-10d89581a17b','ee97fe62-c96b-4f1f-b3d1-fda3f744450a','ROSA VALENCIA PIÑA'),
  ('88660759-9d16-468a-b1e7-0afa32727e56','0648a3f1-5bd9-40f2-b02f-57bae64fd643','ROSALINA CAMACHO GARCIA'),
  ('7e2af0a8-e7c5-4c45-aba1-bd82f3892473','c147d38d-a2a1-43e9-ab72-04e19e78e110','SILVIA MENDOZA CRUZ'),
  ('43bfb126-4505-48d0-bad3-4f59991da8d8','eff99a9c-7d7f-48c1-b5f6-44b459518067','SUSANA RIVERA ROSAS'),
  ('2fa05326-7498-40cd-8c31-f414836684d5','a19d41bf-8c37-453c-9baa-042969c18dbf','TERESA MERCADO RAYON'),
  ('ef90ef8a-1130-442b-bdb6-ab188e18096a','e2b431b8-6ee1-448b-9ca3-1a7c0415c19b','TRINIDAD VILLA ALMAZAN'),
  ('37262623-a121-4e85-b12a-728b0231d125','b409140d-2237-493c-a529-c597f56d9d72','VERONICA CRUZ CORREA'),
  ('80581a92-fc4a-489a-bdec-a7305867ec70','8eb583ca-fa3a-4d4b-9220-e35a4dd38a65','YENI GUADALUPE MENDEZ RAMOS'),
  ('d0d4845d-036d-4bfc-b6bd-c32621b807b3','011d8ed2-11b1-4dba-a44b-6b0121e9d137','ADRIANA ESCAMILLA GUADARRAMA'),
  ('308a2664-4eed-4b59-97e2-5fb0d0de40d2','76a67cd1-716c-4b0b-be8e-138a9f140c35','ANA ROSA CASTRO MILLAN');


-- ── Estado ANTES ─────────────────────────────────────────────────────
SELECT
  m.cliente,
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


-- ── Mover TODO del perdedor al ganador ────────────────────────────────
UPDATE "Loan"           l SET "clientId" = m.ganador FROM dedup_map m WHERE l."clientId" = m.perdedor;
UPDATE "Payment"        p SET "clientId" = m.ganador FROM dedup_map m WHERE p."clientId" = m.perdedor;
UPDATE "MoraCobro"      mc SET "clientId" = m.ganador FROM dedup_map m WHERE mc."clientId" = m.perdedor;
UPDATE "ClientDocument" d SET "clientId" = m.ganador FROM dedup_map m WHERE d."clientId" = m.perdedor;
UPDATE "ScoreEvent"     s SET "clientId" = m.ganador FROM dedup_map m WHERE s."clientId" = m.perdedor;
UPDATE "Payment"        p SET "coberturaClientId" = m.ganador FROM dedup_map m WHERE p."coberturaClientId" = m.perdedor;


-- ── Rellenar campos vacíos del ganador con datos del perdedor ─────────
-- Nota: si el ganador ya tiene un valor no-null, se respeta; solo se
-- copia lo que le falta.
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


-- ── Soft-delete de los perdedores ─────────────────────────────────────
UPDATE "Client" c SET "eliminadoEn" = now()
FROM dedup_map m WHERE c.id = m.perdedor;


-- ── Estado DESPUÉS ────────────────────────────────────────────────────
-- Los perdedores deben mostrar todos los contadores en 0 y eliminadoEn ≠ null.
-- Los ganadores deben mostrar la suma de los dos.
SELECT
  m.cliente,
  m.perdedor,
  (SELECT "eliminadoEn" FROM "Client" WHERE id = m.perdedor)::date AS p_eliminado,
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


-- Si el resultado se ve bien:
COMMIT;

-- Si algo pinta mal:
-- ROLLBACK;


-- ═════════════════════════════════════════════════════════════════════════
-- CASOS CRÍTICOS — 12 pares, ambos con préstamos vivos (NO se tocaron)
-- ═════════════════════════════════════════════════════════════════════════
-- Estos requieren decisión gerencial: hay DINERO EN LA CALLE en dos
-- registros del mismo cliente físico, con dos coordinadores (o el mismo)
-- cobrando en paralelo. Para cada uno:
--
--   1. Decide con qué registro se queda el cliente (típicamente el más
--      reciente o el que tiene mejor score).
--   2. Los loan_ids del perdedor: decides si:
--        a) los mueves también al ganador y reasignas cobradorId al del
--           ganador (transfiere el cobro al nuevo coord), o
--        b) los dejas donde están, cobrados por el coordinador original
--           hasta que se liquiden y luego borras al perdedor.
--   3. Corres la plantilla merge-cliente-template.sql adaptada al caso.
--
--
-- 1. MARIA DEL CARMEN ALTAMIRANO ANDRADE  (Minatitlán)
--    Eduardo Zúñiga → 1ba10211-716c-47c0-b684-55ceae95b114  (loan 7704cd18)
--    Jessika Pérez  → c8f84a07-d476-4100-bd7b-b7a2dfc71adc  (loan d32a5fcf)
--
-- 2. CAVA870314MVZBLL02  (Veracruz, Karen ambos, NOMBRES DISTINTOS)
--    ⚠ Mismo CURP con dos nombres → probablemente el CURP de uno está mal.
--    El CURP encaja con "CABRERA VILLEGAS" (daa2237f).
--    → Si son 2 personas distintas: quitar CURP a 295c60d3 (ANTONIA
--      VILLEGAS GARCIA) y capturar el correcto. NO fusionar.
--    295c60d3-6325-48b4-a600-aa263ab449ab  ANTONIA ALEJANDRA VILLEGAS GARCIA
--    daa2237f-8e74-4b5f-8ae2-fe2e8b6635dc  ALEJANDRA CABRERA VILLEGAS
--
-- 3. SARA ARACELI GONZALEZ VALENCIA  (San Mateo Atenco)
--    ⚠ MISMA América tiene DOS registros activos + Miguel shell.
--    Miguel 1ea7be1c ya está incluido en el merge seguro de arriba.
--    Falta decidir entre los dos de América:
--    0636531d-e97d-497c-9af3-7fe1250a3b6f  (más viejo, loan d642e79f)
--    6d967088-af74-4605-ab8a-7fd142104ea5  (más nuevo, loan e3e94197)
--
-- 4. MARIBEL MIJANGOS GARCIA  (Minatitlán)
--    Eduardo Zúñiga  → 1a7c032a-a758-44da-acf0-fc8c3b62d60c  (loan 75720539)
--    Jessika Pérez   → 4f001bd9-c346-4273-be34-3554626375cc  (loan 83ed7508)
--
-- 5. JESSICA LIZZET NAVA ANGELINA  (San Mateo Atenco)
--    ⚠ MISMA América tiene DOS registros activos.
--    8ac80f81-3b03-4349-b7c3-b6e2e6737330  (jun 5, loan ea8c8f31)
--    c11e26de-d3a0-4d9a-b8be-2530d0a3a70b  (jul 3, loan eb0fdcfe)
--
-- 6. ROCIO ROBLES PEREZ  (San Mateo Atenco)
--    ⚠ MISMA América tiene DOS registros activos + Miguel shell.
--    Miguel 77861431 ya está incluido en el merge seguro (arriba).
--    Falta decidir entre los dos de América:
--    b9b1986f-2144-4a45-9317-deafe3fcfc69  (jun 1, loan 83ec7329)
--    6d4dd6b2-f985-4323-8ccb-c55174a77574  (jun 24, loan b1b21956)
--
-- 7. BEATRIZ ADRIANA SEGURA NUÑEZ  (Tenancingo)
--    María Guadalupe Reza  → 003acd79-53ad-4919-8a39-8bb44c8d5b94  (loan 423b8e6d — muy activa, 4 total)
--    Luis Alberto Rosales  → 0a6a8edb-a319-4b08-bc04-bb5c507b3829  (loan 55caf7f3)
--
-- 8. FRANCISCA BONILLA HERNANDEZ  (Minatitlán)
--    Eduardo Zúñiga   → 6ced57b2-db4c-4d24-9c9b-53a7d42b2407  (CURP BOHF65060MVZNRR07 — typo)
--    Jessika Pérez    → 7634a1f3-85e5-4970-ae3c-12ee11b9a5bf  (CURP BOHF650609MVZNRR07 — correcta)
--
-- 9. CLAUDIA ESPERANZA VENTURA RODRIGUEZ  (San Mateo Atenco)
--    Miguel 7c85b0eb ya está incluido en el merge seguro (arriba).
--    ⚠ MISMA América tiene DOS registros activos:
--    120119dd-b6f5-41f9-8266-b82a30e51b2b  (may 27, sin data, loan 0badba68)
--    cb011143-61c7-4f50-9395-e7aeddcef4ba  (jun 16, con data, loan 22649b8b)
--
-- 10. ANA MARÍA ESQUIVEL TENORIO  (San Mateo Atenco)
--    ⚠ MISMA América tiene DOS registros activos:
--    4a2271a9-9a54-4d73-9f91-0c6067c0d2ec  (may 27, sin data, loan b2930375)
--    6ed38bb3-e4aa-471b-99e9-b8aaf7d0cde0  (jun 17, con data, loan 12993801)
--
-- 11. PATRICIA NICOLAS MARTINEZ  (Toluca)
--    Valentina Rodríguez  → f4f80674-9be5-447c-8b68-59016e3e5603  (loan f6104ebe)
--    Diana Elizabeth Ayala → d8f226bd-9eb8-49f4-8336-bea160954e3a  (loan f2eae5f2)
--
-- 12. SOLEDAD MILLAN VAZQUEZ  (Tenancingo)
--    María Guadalupe Reza  → 8dd885f5-78ae-474a-95e6-a1aceafe01ed  (loan fbdfc641)
--    Luis Alberto Rosales  → f7b70690-21e3-4283-838a-458e0d324637  (loan f1436802)
