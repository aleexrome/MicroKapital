-- Limpieza de clientes duplicados — casos seguros
--
-- Ejecutar en Supabase SQL Editor DENTRO DE UNA TRANSACCIÓN.
-- Si algo no cuadra, ROLLBACK y hablamos.
--
-- Estrategia:
--   1) Para pares donde UN registro no tiene préstamos activos (vivos=0)
--      y el hermano SÍ, se soft-elimina el sin vivos. El histórico queda
--      registrado bajo el cliente borrado pero no aparece en cartera.
--   2) Para pares "shell con préstamos + rico sin préstamos" (el shell
--      tiene los préstamos vivos pero no tiene datos; el rico tiene los
--      datos completos pero 0 préstamos), copiamos los datos del rico al
--      shell y borramos al rico. Así conservamos los préstamos vivos Y
--      los datos completos.
--
-- Los 12 casos ambiguos (ambos hermanos con préstamos vivos) están
-- listados como comentarios al final — decidir manualmente y correr
-- el UPDATE correspondiente.

BEGIN;

-- ── Type B: shell con préstamos → copiar datos del rico y borrar rico ──

-- ADRIANA ESCAMILLA GUADARRAMA (Jaime, Tenancingo)
UPDATE "Client" c1 SET
  telefono           = COALESCE(c1.telefono,           c2.telefono),
  "telefonoAlt"      = COALESCE(c1."telefonoAlt",      c2."telefonoAlt"),
  email              = COALESCE(c1.email,              c2.email),
  domicilio          = COALESCE(c1.domicilio,          c2.domicilio),
  "numIne"           = COALESCE(c1."numIne",           c2."numIne"),
  curp               = COALESCE(c1.curp,               c2.curp),
  "referenciaNombre" = COALESCE(c1."referenciaNombre", c2."referenciaNombre"),
  "referenciaTelefono"= COALESCE(c1."referenciaTelefono", c2."referenciaTelefono"),
  "fechaNacimiento"  = COALESCE(c1."fechaNacimiento",  c2."fechaNacimiento")
FROM "Client" c2
WHERE c1.id = '011d8ed2-11b1-4dba-a44b-6b0121e9d137'
  AND c2.id = 'd0d4845d-036d-4bfc-b6bd-c32621b807b3';

-- LESLIE YOLOTZIN BERRIOZABAL MELCHOR (America, San Mateo Atenco)
UPDATE "Client" c1 SET
  telefono           = COALESCE(c1.telefono,           c2.telefono),
  "telefonoAlt"      = COALESCE(c1."telefonoAlt",      c2."telefonoAlt"),
  email              = COALESCE(c1.email,              c2.email),
  domicilio          = COALESCE(c1.domicilio,          c2.domicilio),
  "numIne"           = COALESCE(c1."numIne",           c2."numIne"),
  curp               = COALESCE(c1.curp,               c2.curp),
  "referenciaNombre" = COALESCE(c1."referenciaNombre", c2."referenciaNombre"),
  "referenciaTelefono"= COALESCE(c1."referenciaTelefono", c2."referenciaTelefono"),
  "fechaNacimiento"  = COALESCE(c1."fechaNacimiento",  c2."fechaNacimiento")
FROM "Client" c2
WHERE c1.id = '0ceaeb13-3e80-444c-a540-e0b97b9eab3e'
  AND c2.id = 'c296f591-3dcd-41ec-bb2b-69d5e684d8f5';

-- MARIA ELENA ORTIZ BERNAL (Diana shell + Héctor rico, ambos Toluca)
UPDATE "Client" c1 SET
  telefono           = COALESCE(c1.telefono,           c2.telefono),
  "telefonoAlt"      = COALESCE(c1."telefonoAlt",      c2."telefonoAlt"),
  email              = COALESCE(c1.email,              c2.email),
  domicilio          = COALESCE(c1.domicilio,          c2.domicilio),
  "numIne"           = COALESCE(c1."numIne",           c2."numIne"),
  curp               = COALESCE(c1.curp,               c2.curp),
  "referenciaNombre" = COALESCE(c1."referenciaNombre", c2."referenciaNombre"),
  "referenciaTelefono"= COALESCE(c1."referenciaTelefono", c2."referenciaTelefono"),
  "fechaNacimiento"  = COALESCE(c1."fechaNacimiento",  c2."fechaNacimiento")
FROM "Client" c2
WHERE c1.id = '5799bab3-9c68-4afb-a5c5-d339404a23a4'
  AND c2.id = '36f53289-e329-4d48-89ad-cb4a60669ccd';

-- MARIBEL MARTINEZ HERNANDEZ (Diana shell + Héctor rico, Toluca)
UPDATE "Client" c1 SET
  telefono           = COALESCE(c1.telefono,           c2.telefono),
  "telefonoAlt"      = COALESCE(c1."telefonoAlt",      c2."telefonoAlt"),
  email              = COALESCE(c1.email,              c2.email),
  domicilio          = COALESCE(c1.domicilio,          c2.domicilio),
  "numIne"           = COALESCE(c1."numIne",           c2."numIne"),
  curp               = COALESCE(c1.curp,               c2.curp),
  "referenciaNombre" = COALESCE(c1."referenciaNombre", c2."referenciaNombre"),
  "referenciaTelefono"= COALESCE(c1."referenciaTelefono", c2."referenciaTelefono"),
  "fechaNacimiento"  = COALESCE(c1."fechaNacimiento",  c2."fechaNacimiento")
FROM "Client" c2
WHERE c1.id = '6b7d151a-5786-4e14-9356-6c0de8c547ca'
  AND c2.id = '571ae541-f412-48a6-abd3-7367e33ba681';

-- NOELIA VILLANUEVA ESPEJO (Paula misma, Veracruz)
UPDATE "Client" c1 SET
  telefono           = COALESCE(c1.telefono,           c2.telefono),
  "telefonoAlt"      = COALESCE(c1."telefonoAlt",      c2."telefonoAlt"),
  email              = COALESCE(c1.email,              c2.email),
  domicilio          = COALESCE(c1.domicilio,          c2.domicilio),
  "numIne"           = COALESCE(c1."numIne",           c2."numIne"),
  curp               = COALESCE(c1.curp,               c2.curp),
  "referenciaNombre" = COALESCE(c1."referenciaNombre", c2."referenciaNombre"),
  "referenciaTelefono"= COALESCE(c1."referenciaTelefono", c2."referenciaTelefono"),
  "fechaNacimiento"  = COALESCE(c1."fechaNacimiento",  c2."fechaNacimiento")
FROM "Client" c2
WHERE c1.id = 'e36e88b2-0e4e-480e-b0c0-ce6f4a8bbe6d'
  AND c2.id = 'fdd8d834-c6b7-457e-bd57-7a96ff9412f3';

-- TERESA MERCADO RAYON (Diana shell + Héctor rico, Toluca)
UPDATE "Client" c1 SET
  telefono           = COALESCE(c1.telefono,           c2.telefono),
  "telefonoAlt"      = COALESCE(c1."telefonoAlt",      c2."telefonoAlt"),
  email              = COALESCE(c1.email,              c2.email),
  domicilio          = COALESCE(c1.domicilio,          c2.domicilio),
  "numIne"           = COALESCE(c1."numIne",           c2."numIne"),
  curp               = COALESCE(c1.curp,               c2.curp),
  "referenciaNombre" = COALESCE(c1."referenciaNombre", c2."referenciaNombre"),
  "referenciaTelefono"= COALESCE(c1."referenciaTelefono", c2."referenciaTelefono"),
  "fechaNacimiento"  = COALESCE(c1."fechaNacimiento",  c2."fechaNacimiento")
FROM "Client" c2
WHERE c1.id = 'a19d41bf-8c37-453c-9baa-042969c18dbf'
  AND c2.id = '2fa05326-7498-40cd-8c31-f414836684d5';


-- ── Soft-delete de todos los duplicados sin préstamos activos ──
UPDATE "Client" SET "eliminadoEn" = now() WHERE id IN (
  -- Type A: mismo CURP, uno sin vivos
  '646f6615-a40f-4760-8ee7-5dd1ac92a58d', -- DAVID CRUZ SOTO (Jessika)
  '0bf715d2-7fee-49fe-ba0c-f00d6d4e7542', -- ANA KAREN FLORES GONZALEZ (Miguel)
  'b2d6884b-4f79-4e31-9490-067ca48e4064', -- MARIA DEL SOCORRO GALLARDO (Miguel)
  '2f44604d-b75c-4131-b1d8-d4f003694b7d', -- KARINA GOMEZ MONTELLANO (Miguel)
  '1ea7be1c-b319-40b4-9050-b1e3c0174bf8', -- SARA GONZALEZ VALENCIA (Miguel)
  'f9d0ce47-17f8-456e-bde6-b9b16d5b4404', -- MATILDE GUTIERREZ (Jessika)
  '652bc891-4e45-4047-ac11-b702fa199622', -- ALICIA LOBATO SIMBRON (Karen, sin loans)
  '42399b37-d56d-4a70-9d27-b3d34190d900', -- CAMERINA BEATRIZ MARQUEZ (Karen, INE dummy)
  '8c5fdf0e-5fb9-4b09-9c1f-dd91361c8413', -- EDUARDO MACIAS GARCIA (SAIRA, sin loans)
  '7a04b31f-f2f0-4ac7-8f31-5af8b437f1a2', -- KARLA MEJIA GONZALEZ (Miguel)
  'd583c571-5e8d-473b-9bdb-18fc9e2fec08', -- MARIA LUISA MORALES (Miguel)
  '0229e624-de3b-4fe3-8473-3bbcf9148c01', -- MARGARITA NUÑEZ (Reza, INE "SN")
  'd4d48c79-57fc-4661-a5a8-ba29d257b457', -- NOCOLASA (typo Guadalupe Castro)
  '88a10839-ad4c-4db6-b41a-c9878293d847', -- ESTEFANI PALOMARES (Miguel)
  'dd91c665-961e-4d11-a4f0-60a2d7320628', -- PAOLA POLO MUNGUIA (Catalina, sin loans)
  'aa061be2-c6c9-4531-aca9-7f45698a9227', -- JULIA REYES BRACAMONTE (Miguel)
  'c5c33b71-7f53-4700-836f-39a015db4365', -- RAQUEL REDONDO HERNANDEZ (Miguel)
  'ddde121c-68ec-4d7e-9231-1d84072fd9bf', -- CITLALLI DE LOS SANTOS (Reza, más viejo)
  'a79e6cfe-288b-4ea7-ba1c-c2f7871dc32b', -- DIANA SANCHEZ ALVA (Miguel)
  '5fe868ab-d8a0-498b-a3b1-4e95fcf16850', -- DONIA SOTO DAMIAN (Valentina, typo)
  '5dc2831b-5399-4f6e-a800-d5a461fd265e', -- MARTHA TRUJILLO NIETO (LA, sin loans)
  'fa9606e4-e17c-4bfa-a9b9-f66115749412', -- MARTHA VARA OLMEDO (Reza, más viejo)

  -- Type A: mismo nombre (shells de import batch abril 11-12)
  'ba32c2f6-348b-45f8-a459-2eaf1baf0573', -- ALEJANDRA ESCUDERO (Miguel)
  '7d7201e9-fa92-4db1-93ba-164781c613c9', -- ALEJANDRO JUAREZ (LA, shell)
  '308a2664-4eed-4b59-97e2-5fb0d0de40d2', -- ANA ROSA CASTRO MILLAN (Reza)
  '651cd90d-215e-4891-a526-42bf692b4284', -- ANABEL RINCON ROSAS (Karen, shell)
  'bc1fab45-dd61-4e7f-b20f-c2874c70e7a5', -- BRENDA VALENCIA (Miguel)
  '7c85b0eb-827e-44af-8581-780d23362182', -- CLAUDIA VENTURA (Miguel)
  'edb7e72d-03c5-4510-bf69-7393e3ce3150', -- ELIZABETH NAVA (Miguel)
  '13f620a9-6928-424f-9a5d-d14873702afd', -- ERIKA ORTIZ (Miguel)
  '60d50714-d9c9-413a-86b5-1540b9755404', -- ERIKA ZUÑIGA NICOLAS (Guadalupe Castro)
  '4735c0c3-4ab4-4283-8957-025807cabd97', -- EULALIA VILCHIS (Diana Elizabeth, jul 13)
  '0339cd45-6beb-4cec-b656-a72dbcbcfa6a', -- EVELIN GUTIERREZ (Miguel)
  '76a06d6d-43cc-40b2-9baf-2ce048baf054', -- KARLA MARTÍNEZ (Miguel)
  '1826c92f-625f-4193-94e6-b914cd4f0797', -- LETICIA SEGURA (Miguel)
  '6f81bc0d-03c6-4d5c-ba25-30617604d812', -- MAGDALENA QUINTERO (Guadalupe Castro)
  '7a4d8a05-d132-4060-95cb-d66aa8e887b6', -- MARIA FERNANDA DE JESUS (Miguel)
  'c630a821-4d61-44c7-b356-acd33b060e30', -- MARIA SONIA ALVAREZ (Miguel)
  'ec6c5d53-a323-42a7-9d2e-011e09f06e0f', -- MIRIAM DALILA ROSALES (Miguel)
  '69c601e7-aeb4-4612-8227-1ce4f96314b0', -- NADIA ROMERO (Paula, shell)
  '938a221c-4696-4ea5-b3dc-449de0773014', -- NAYELI VIDAL PEREZ (Miguel)
  '1cb08308-bdce-41be-a78e-ea5a041bbfc1', -- NICOLASA HERAZ (Miguel)
  'e219b728-cb84-40c7-a1d8-7e2d4e8e5342', -- NUBIA VENTURA (Miguel, shell)
  '77861431-b346-45d9-a4ea-e0782670b431', -- ROCIO ROBLES PEREZ (Miguel)
  'b6193588-6820-4899-8b29-10d89581a17b', -- ROSA VALENCIA PIÑA (Miguel)
  '88660759-9d16-468a-b1e7-0afa32727e56', -- ROSALINA CAMACHO (Cristina)
  '7e2af0a8-e7c5-4c45-aba1-bd82f3892473', -- SILVIA MENDOZA (Guadalupe Castro)
  '43bfb126-4505-48d0-bad3-4f59991da8d8', -- SUSANA RIVERA (Paula, shell)
  'ef90ef8a-1130-442b-bdb6-ab188e18096a', -- TRINIDAD VILLA (Guadalupe Castro, shell)
  '37262623-a121-4e85-b12a-728b0231d125', -- VERONICA CRUZ CORREA (Miguel)
  '80581a92-fc4a-489a-bdec-a7305867ec70', -- YENI MENDEZ RAMOS (Miguel)

  -- Type B: registros ricos ya migrados al shell (arriba) — borrar
  'd0d4845d-036d-4bfc-b6bd-c32621b807b3', -- ADRIANA ESCAMILLA (rico)
  'c296f591-3dcd-41ec-bb2b-69d5e684d8f5', -- LESLIE BERRIOZABAL (rico)
  '36f53289-e329-4d48-89ad-cb4a60669ccd', -- MARIA ELENA ORTIZ (rico)
  '571ae541-f412-48a6-abd3-7367e33ba681', -- MARIBEL MARTINEZ (rico)
  'fdd8d834-c6b7-457e-bd57-7a96ff9412f3', -- NOELIA VILLANUEVA (rico)
  '2fa05326-7498-40cd-8c31-f414836684d5'  -- TERESA MERCADO (rico)
);

-- Verificar antes de commit
SELECT
  (SELECT COUNT(*) FROM "Client" WHERE "eliminadoEn" IS NOT NULL) AS total_eliminados,
  (SELECT COUNT(*) FROM "Client" WHERE "eliminadoEn" IS NULL)     AS total_activos;

-- Si todo se ve bien:
COMMIT;
-- Si no:
-- ROLLBACK;


-- ═════════════════════════════════════════════════════════════════════════
-- CASOS AMBIGUOS — NO se tocan aquí, requieren tu decisión
-- ═════════════════════════════════════════════════════════════════════════
--
-- Para cada uno, decidir cuál coordinador se queda al cliente. El "loser"
-- tiene préstamos VIVOS; si lo eliminas, esos préstamos se ocultan de
-- cobranzas. Considera antes: mover el préstamo al cliente ganador
-- (UPDATE "Loan" SET "clientId"='<ganador>' WHERE "clientId"='<loser>')
-- antes de eliminar al loser.
--
-- 1. MARIA DEL CARMEN ALTAMIRANO ANDRADE (CURP AAAC780923MVZLNR05)
--    - 1ba10211-716c-47c0-b684-55ceae95b114  Eduardo Zúñiga (Minatitlán, may 20)
--    - c8f84a07-d476-4100-bd7b-b7a2dfc71adc  Jessika Pérez  (Minatitlán, jun 29)
--
-- 2. ANTONIA/ALEJANDRA CABRERA VILLEGAS (mismo CURP CAVA870314MVZBLL02, dos nombres)
--    - 295c60d3-6325-48b4-a600-aa263ab449ab  ANTONIA ALEJANDRA VILLEGAS GARCIA (Karen, abr 21)
--    - daa2237f-8e74-4b5f-8ae2-fe2e8b6635dc  ALEJANDRA CABRERA VILLEGAS         (Karen, abr 21)
--    ⚠ Mismo CURP, distinto nombre — verificar cuál es el nombre correcto.
--
-- 3. SARA ARACELI GONZALEZ VALENCIA (CURP GOVS701123, América tiene dos registros)
--    - 0636531d-e97d-497c-9af3-7fe1250a3b6f  América (may 27)
--    - 6d967088-af74-4605-ab8a-7fd142104ea5  América (jun 15)
--    Nota: Miguel's 1ea7be1c ya está en el DELETE de arriba.
--
-- 4. MARIBEL MIJANGOS GARCIA (CURP MIGM750712)
--    - 1a7c032a-a758-44da-acf0-fc8c3b62d60c  Eduardo Zúñiga (may 20)
--    - 4f001bd9-c346-4273-be34-3554626375cc  Jessika Pérez  (jun 23)
--
-- 5. JESSICA LIZZET NAVA ANGELINA (CURP NAAJ910724, América dos registros)
--    - 8ac80f81-3b03-4349-b7c3-b6e2e6737330  América (jun 5)
--    - c11e26de-d3a0-4d9a-b8be-2530d0a3a70b  América (jul 3)
--
-- 6. ROCIO ROBLES PEREZ (CURP ROPR781215, América dos registros)
--    - b9b1986f-2144-4a45-9317-deafe3fcfc69  América (jun 1)
--    - 6d4dd6b2-f985-4323-8ccb-c55174a77574  América (jun 24)
--    Nota: Miguel's 77861431 ya en el DELETE.
--
-- 7. BEATRIZ ADRIANA SEGURA NUÑEZ (CURP SENB940701)
--    - 003acd79-53ad-4919-8a39-8bb44c8d5b94  Guadalupe Reza (Tenancingo, abr 17)
--    - 0a6a8edb-a319-4b08-bc04-bb5c507b3829  Luis Alberto   (Tenancingo, jun 19)
--
-- 8. FRANCISCA BONILLA HERNANDEZ (INE IDMEX1678332509, CURPs difieren por typo)
--    - 6ced57b2-db4c-4d24-9c9b-53a7d42b2407  Eduardo (CURP BOHF65060MVZNRR07 — typo)
--    - 7634a1f3-85e5-4970-ae3c-12ee11b9a5bf  Jessika (CURP BOHF650609MVZNRR07 — correcto)
--
-- 9. ANA MARÍA ESQUIVEL TENORIO (nombre, América ambos)
--    - 4a2271a9-9a54-4d73-9f91-0c6067c0d2ec  América (may 27, sin data)
--    - 6ed38bb3-e4aa-471b-99e9-b8aaf7d0cde0  América (jun 17, con data)
--
-- 10. CLAUDIA ESPERANZA VENTURA RODRIGUEZ (nombre, América ambos, después del Miguel eliminado)
--    - 120119dd-b6f5-41f9-8266-b82a30e51b2b  América (may 27, shell)
--    - cb011143-61c7-4f50-9395-e7aeddcef4ba  América (jun 16, con data)
--
-- 11. PATRICIA NICOLAS MARTINEZ (nombre, dos Toluca)
--    - d8f226bd-9eb8-49f4-8336-bea160954e3a  Diana Elizabeth (shell)
--    - f4f80674-9be5-447c-8b68-59016e3e5603  Valentina       (shell)
--
-- 12. SOLEDAD MILLAN VAZQUEZ (nombre, Tenancingo)
--    - 8dd885f5-78ae-474a-95e6-a1aceafe01ed  Guadalupe Reza (shell, abr 11)
--    - f7b70690-21e3-4283-838a-458e0d324637  Luis Alberto   (real,  jun 18)
