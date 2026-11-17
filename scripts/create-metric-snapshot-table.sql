-- MetricSnapshot: fotografía horaria del estado de cobranza para el
-- dashboard /reportes/tiempo-real. Un cron escribe un registro cada
-- 30 min durante horario laboral CDMX. La gráfica de "evolución de
-- la mora" lee `moraPendienteSemana` y la curva cae a lo largo del
-- día conforme los coords cobran.

CREATE TABLE "MetricSnapshot" (
  "id"                   TEXT          NOT NULL,
  "companyId"            TEXT          NOT NULL,
  "capturadoEn"          TIMESTAMP(3)  NOT NULL,
  "cobradoSemana"        DECIMAL(14,2) NOT NULL,
  "pactadoSemana"        DECIMAL(14,2) NOT NULL,
  "pactadoVencidoSemana" DECIMAL(14,2) NOT NULL,
  "moraPendienteSemana"  DECIMAL(14,2) NOT NULL,
  "colocacionSemana"     DECIMAL(14,2) NOT NULL,
  "createdAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetricSnapshot_companyId_capturadoEn_idx"
  ON "MetricSnapshot"("companyId", "capturadoEn");

ALTER TABLE "MetricSnapshot"
  ADD CONSTRAINT "MetricSnapshot_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
