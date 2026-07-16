-- ═════════════════════════════════════════════════════════════════════════
-- MERGE DE DUPLICADOS DE DOS COORDINADORES DISTINTOS
-- ═════════════════════════════════════════════════════════════════════════
--
-- Regla: se queda el registro que tiene el préstamo VIVO. El otro se
-- soft-elimina y todo su histórico (loans liquidados, pagos, moras, docs,
-- score events, coberturas) se consolida en el ganador.
--
-- El Loan.cobradorId de los préstamos históricos se mantiene intacto —
-- así el cobrador original sigue apareciendo en reportes de quien
-- otorgó/cobró ese préstamo. Solo el Client.cobradorId queda en el
-- ganador (que es quien cobra hoy).
--
-- Casos incluidos aquí (36):
--   ▸ Transferencias Miguel → América (San Mateo Atenco): ~20
--   ▸ Transferencias Jessika → Eduardo (Minatitlán): 3
--   ▸ SAIRA → Catalina (Martínez de la Torre): 1
--   ▸ Guadalupe Castro → Valentina (Toluca): 3
--   ▸ Diana Elizabeth → Valentina (Toluca): 1
--   ▸ Héctor → Diana Elizabeth Ayala (Toluca): 3 tipo B
--   ▸ Cristina → Jaime (Tenancingo): 1
--   ▸ Reza → Jaime (Tenancingo): 1
--   ▸ MARIA SONIA ALVAREZ: ambos 0 vivos, ganador = América (más reciente,
--     con INE/CURP capturado)
--
-- Casos NO incluidos (para revisión posterior):
--   ▸ 6 con ambos con préstamos vivos en dos coords (decisión gerencial:
--     ALTAMIRANO, MIJANGOS, BONILLA, SEGURA, MILLAN, NICOLAS)
--   ▸ 3 Miguel-shells con dos-América-vivas (ROCIO, SARA, CLAUDIA)
--     — resolver primero el par América-América
--   ▸ CAVA870314 VILLEGAS (2 nombres distintos con mismo CURP, probable
--     error de captura)

BEGIN;

CREATE TEMP TABLE dedup_map (perdedor text, ganador text, cliente text, coord_out text, coord_in text);

INSERT INTO dedup_map VALUES
  ('646f6615-a40f-4760-8ee7-5dd1ac92a58d','1d00f19a-4c16-4973-8cd9-4299afb0dc4b','DAVID CRUZ SOTO',           'Jessika','Eduardo'),
  ('0bf715d2-7fee-49fe-ba0c-f00d6d4e7542','27fa4a16-dbb2-41d6-a0b1-bfb7703ad1a0','ANA KAREN FLORES',          'Miguel','América'),
  ('b2d6884b-4f79-4e31-9490-067ca48e4064','b952536d-478a-49e8-9924-cba0c96dfc3d','SOCORRO GALLARDO',          'Miguel','América'),
  ('2f44604d-b75c-4131-b1d8-d4f003694b7d','94658bcb-fb34-464a-a21f-5c222f4a0321','KARINA GOMEZ',              'Miguel','América'),
  ('f9d0ce47-17f8-456e-bde6-b9b16d5b4404','3fd0631a-8d54-44a6-b4ce-f5712cf5f1d5','MATILDE GUTIERREZ',         'Jessika','Eduardo'),
  ('8c5fdf0e-5fb9-4b09-9c1f-dd91361c8413','f13961df-3dd0-4d04-acbd-d111fb8d0209','EDUARDO MACIAS',            'SAIRA','Catalina'),
  ('7a04b31f-f2f0-4ac7-8f31-5af8b437f1a2','c122f448-e6c4-4b86-82f3-f575e72d786b','KARLA MEJIA',               'Miguel','América'),
  ('d583c571-5e8d-473b-9bdb-18fc9e2fec08','ae0bf053-7d90-4c4e-8d19-5f632fae4789','MARIA LUISA MORALES',       'Miguel','América'),
  ('88a10839-ad4c-4db6-b41a-c9878293d847','2de70557-e7e9-4d3a-84e6-247524dd870f','ESTEFANI PALOMARES',        'Miguel','América'),
  ('aa061be2-c6c9-4531-aca9-7f45698a9227','8cb45bff-ef05-4389-9654-03b82cbecece','JULIA REYES',               'Miguel','América'),
  ('c5c33b71-7f53-4700-836f-39a015db4365','379ae5cb-258d-4940-b484-b3d85c6b837d','RAQUEL REDONDO',            'Miguel','América'),
  ('a79e6cfe-288b-4ea7-ba1c-c2f7871dc32b','08c350a6-ab57-4363-90ab-d1b14d1e861d','DIANA SANCHEZ',             'Miguel','América'),
  ('ba32c2f6-348b-45f8-a459-2eaf1baf0573','c1ebcf07-5928-4bba-9810-3b56a915c830','ALEJANDRA ESCUDERO',        'Miguel','América'),
  ('bc1fab45-dd61-4e7f-b20f-c2874c70e7a5','281d3194-e614-491a-b45b-30ee1b8cc97f','BRENDA VALENCIA',           'Miguel','América'),
  ('edb7e72d-03c5-4510-bf69-7393e3ce3150','aebb7c60-2e42-4c06-b2c4-d22b17c8466b','ELIZABETH NAVA',            'Miguel','América'),
  ('13f620a9-6928-424f-9a5d-d14873702afd','57f51767-b519-45d9-8e85-b0eecd6de38d','ERIKA ORTIZ',               'Miguel','América'),
  ('60d50714-d9c9-413a-86b5-1540b9755404','22aa544e-e3f0-4a46-b10c-7dbfe8eddb17','ERIKA ZUÑIGA',              'Guadalupe','Valentina'),
  ('4735c0c3-4ab4-4283-8957-025807cabd97','09299758-fbb0-4db5-9c1f-bd33a005471c','EULALIA VILCHIS',           'Diana E.','Valentina'),
  ('0339cd45-6beb-4cec-b656-a72dbcbcfa6a','f9d18f99-77c3-4b61-896b-b772c967c5d5','EVELIN GUTIERREZ',          'Miguel','América'),
  ('76a06d6d-43cc-40b2-9baf-2ce048baf054','e3069f30-99e1-4f71-92e9-651563d5bb19','KARLA MARTÍNEZ',            'Miguel','América'),
  ('1826c92f-625f-4193-94e6-b914cd4f0797','666cfe27-b257-4274-9fc7-79ad43cdcbe6','LETICIA SEGURA',            'Miguel','América'),
  ('6f81bc0d-03c6-4d5c-ba25-30617604d812','6d80bea5-fb61-4855-ada8-71a3c147b299','MAGDALENA QUINTERO',        'Guadalupe','Valentina'),
  ('36f53289-e329-4d48-89ad-cb4a60669ccd','5799bab3-9c68-4afb-a5c5-d339404a23a4','MARIA ELENA ORTIZ',         'Héctor','Diana Ayala'),
  ('7a4d8a05-d132-4060-95cb-d66aa8e887b6','3ffd9143-68c7-4543-afe8-08149aef1e01','MARIA FERNANDA DE JESUS',   'Miguel','América'),
  ('c630a821-4d61-44c7-b356-acd33b060e30','3541e999-52a3-4fbe-93bf-83d95ed690b9','MARIA SONIA ALVAREZ',       'Miguel','América'),
  ('571ae541-f412-48a6-abd3-7367e33ba681','6b7d151a-5786-4e14-9356-6c0de8c547ca','MARIBEL MARTINEZ',          'Héctor','Diana Ayala'),
  ('ec6c5d53-a323-42a7-9d2e-011e09f06e0f','2706af0a-6446-4db6-89e3-80c3487fb5d4','MIRIAM DALILA',             'Miguel','América'),
  ('938a221c-4696-4ea5-b3dc-449de0773014','1317b382-e7d0-4856-a904-2ee69f427270','NAYELI VIDAL',              'Miguel','América'),
  ('1cb08308-bdce-41be-a78e-ea5a041bbfc1','961825b3-d594-4b16-bf8b-9ca56546dce3','NICOLASA HERAZ',            'Miguel','América'),
  ('b6193588-6820-4899-8b29-10d89581a17b','ee97fe62-c96b-4f1f-b3d1-fda3f744450a','ROSA VALENCIA',             'Miguel','América'),
  ('88660759-9d16-468a-b1e7-0afa32727e56','0648a3f1-5bd9-40f2-b02f-57bae64fd643','ROSALINA CAMACHO',          'Cristina','Jaime'),
  ('7e2af0a8-e7c5-4c45-aba1-bd82f3892473','c147d38d-a2a1-43e9-ab72-04e19e78e110','SILVIA MENDOZA',            'Guadalupe','Valentina'),
  ('2fa05326-7498-40cd-8c31-f414836684d5','a19d41bf-8c37-453c-9baa-042969c18dbf','TERESA MERCADO',            'Héctor','Diana Ayala'),
  ('37262623-a121-4e85-b12a-728b0231d125','b409140d-2237-493c-a529-c597f56d9d72','VERONICA CRUZ',             'Miguel','América'),
  ('80581a92-fc4a-489a-bdec-a7305867ec70','8eb583ca-fa3a-4d4b-9220-e35a4dd38a65','YENI MENDEZ',               'Miguel','América'),
  ('308a2664-4eed-4b59-97e2-5fb0d0de40d2','76a67cd1-716c-4b0b-be8e-138a9f140c35','ANA ROSA CASTRO',           'Reza','Jaime');


-- ── Estado ANTES ─────────────────────────────────────────────────────
SELECT
  m.cliente,
  m.coord_out || ' → ' || m.coord_in AS transferencia,
  m.perdedor,
  (SELECT COUNT(*) FROM "Loan"      WHERE "clientId" = m.perdedor) AS p_loans,
  (SELECT COUNT(*) FROM "Payment"   WHERE "clientId" = m.perdedor) AS p_pagos,
  (SELECT COUNT(*) FROM "MoraCobro" WHERE "clientId" = m.perdedor) AS p_moras,
  m.ganador,
  (SELECT COUNT(*) FROM "Loan"      WHERE "clientId" = m.ganador) AS g_loans,
  (SELECT COUNT(*) FROM "Payment"   WHERE "clientId" = m.ganador) AS g_pagos,
  (SELECT COUNT(*) FROM "MoraCobro" WHERE "clientId" = m.ganador) AS g_moras
FROM dedup_map m
ORDER BY m.cliente;


-- ── Mover TODO del perdedor al ganador ───────────────────────────────
UPDATE "Loan"           l  SET "clientId" = m.ganador FROM dedup_map m WHERE l."clientId"  = m.perdedor;
UPDATE "Payment"        p  SET "clientId" = m.ganador FROM dedup_map m WHERE p."clientId"  = m.perdedor;
UPDATE "MoraCobro"      mc SET "clientId" = m.ganador FROM dedup_map m WHERE mc."clientId" = m.perdedor;
UPDATE "ClientDocument" d  SET "clientId" = m.ganador FROM dedup_map m WHERE d."clientId"  = m.perdedor;
UPDATE "ScoreEvent"     s  SET "clientId" = m.ganador FROM dedup_map m WHERE s."clientId"  = m.perdedor;
UPDATE "Payment"        p  SET "cubridoPorClienteId" = m.ganador FROM dedup_map m WHERE p."cubridoPorClienteId" = m.perdedor;


-- ── COALESCE: rellenar campos vacíos del ganador ─────────────────────
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
  m.coord_out || ' → ' || m.coord_in AS transferencia,
  m.perdedor,
  (SELECT "eliminadoEn" FROM "Client" WHERE id = m.perdedor)::date AS p_elim,
  (SELECT COUNT(*) FROM "Loan"    WHERE "clientId" = m.perdedor) AS p_loans,
  (SELECT COUNT(*) FROM "Payment" WHERE "clientId" = m.perdedor) AS p_pagos,
  m.ganador,
  (SELECT COUNT(*) FROM "Loan"    WHERE "clientId" = m.ganador) AS g_loans,
  (SELECT COUNT(*) FROM "Payment" WHERE "clientId" = m.ganador) AS g_pagos,
  (SELECT COUNT(*) FROM "MoraCobro" WHERE "clientId" = m.ganador) AS g_moras
FROM dedup_map m
ORDER BY m.cliente;


-- Si todo cuadra:
COMMIT;
-- Si algo pinta mal:
-- ROLLBACK;
