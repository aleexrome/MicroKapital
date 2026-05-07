import { View, Text } from '@react-pdf/renderer'
import { BaseTemplatePage } from './BaseTemplate'
import { styles } from './styles'
import { formatCurrency, formatDateLong } from '../formatters'
import { convertirMontoALetras } from '../numerosEnLetras'

export interface ContratoSolidarioProps {
  numeroContrato: string
  nombreGrupo: string
  integrantes: Array<{ nombre: string; monto: number }>
  montoTotal: number
  plazoSemanas: number   // siempre 8 para solidario
  fechaFirma: Date
  representanteLegal: string
  ciudadFirma: string
  cat: number
  interesMoratorio: number
}

/**
 * Contrato + pagaré para Crédito Solidario (8 semanas, grupo).
 * Texto literal de CONTRATO_Y_PAGARE_SOLIDARIO.docx — incluyendo los
 * typos del original (CONSECUENCIA, VISTICA, ADECUADAS, etc.) para
 * coincidir exactamente con la plantilla aprobada.
 */
export function ContratoSolidario(props: ContratoSolidarioProps) {
  const {
    numeroContrato, nombreGrupo, integrantes, montoTotal,
    fechaFirma, representanteLegal, ciudadFirma, cat, interesMoratorio,
  } = props

  const numIntegrantes = integrantes.length
  const fechaDesembolso = formatDateLong(fechaFirma)
  const lugarFirma = `${ciudadFirma}, MÉX.`
  const montoLetras = convertirMontoALetras(montoTotal)
  const RL = representanteLegal.toUpperCase()
  const CIUDAD = ciudadFirma.toUpperCase()
  const GRUPO = nombreGrupo.toUpperCase()
  const MONTO = formatCurrency(montoTotal)

  return (
    <BaseTemplatePage
      numeroContrato={numeroContrato}
      lugarFirma={lugarFirma}
      fechaFirma={fechaDesembolso}
    >
      {/* ── SECCIÓN 1 — Caja "BUENO POR" ──────────────────────────────────── */}
      <View style={{ position: 'relative', minHeight: 80, marginBottom: 8 }}>
        <View style={styles.buenoPorBox}>
          <Text style={styles.buenoPorLabel}>BUENO POR:</Text>
          <Text style={styles.buenoPorAmount}>{MONTO}</Text>
        </View>

        {/* ── SECCIÓN 2 — Título del pagaré ──────────────────────────────── */}
        <Text style={styles.title}>PAGARE</Text>
      </View>

      {/* ── SECCIÓN 3 — Texto del pagaré ────────────────────────────────── */}
      <Text style={styles.upper}>
        NOS OBLIGAMOS Y COMPROMETEMOS A PAGAR EN FORMA INDIVIDUAL E INCONDICIONALMENTE LA
        CANTIDAD QUE SE LE FUE OTORGADO A: GRUPO {GRUPO} DE {numIntegrantes} PERSONAS, A {RL} EL
        DÍA {fechaDesembolso} EN LA CIUDAD DE {CIUDAD}, MÉXICO LA CANTIDAD {MONTO} ({montoLetras}).
      </Text>

      <Text style={styles.upper}>
        VALOR RECIBIDO A NUESTRA ENTERA SATISFACCIÓN. ESTE PAGARÉ FORMA PARTE A UNA SERIE
        ENUMERADA DE 1 AL 8 Y TODOS ESTÁN SUJETOS A LA CONDICIÓN DE QUE AL NO PAGARSE
        CUALQUIERA DE ELLOS EN FORMA DIARIA O SEMANAL O SU VENCIMIENTO SERÁN EXIGIBLES TODOS
        LOS QUE SIGAN EN NÚMERO, ADEMÁS DE LOS YA VENCIDOS DESDE LA FECHA DE VENCIMIENTO DE
        ESTE DOCUMENTO HASTA EL DÍA DE SU LIQUIDACIÓN Y CAUSARÁN INTERESES MORATORIOS AL TIPO
        DE {interesMoratorio.toFixed(0)}% MENSUAL PAGADERO EN ESTA CIUDAD JUNTAMENTE CON EL
        PRINCIPAL.
      </Text>

      {/* ── SECCIÓN 4 — Tabla DEUDOR INDIVIDUAL ─────────────────────────── */}
      <Text style={styles.subTitle}>DEUDOR INDIVIDUAL</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellHeader, { flex: 3 }]}>INTEGRANTE</Text>
          <Text style={[styles.tableCellHeader, { flex: 1.5 }]}>MONTO</Text>
          <Text style={[styles.tableCellHeader, { flex: 2 }]}>FIRMA</Text>
          <Text style={[styles.tableCellHeader, { flex: 1.5 }]}>HUELLA</Text>
        </View>
        {integrantes.map((i, idx) => (
          <View
            key={idx}
            style={idx === integrantes.length - 1 ? styles.tableRowLast : styles.tableRow}
          >
            <Text style={[styles.tableCell, { flex: 3 }]}>{i.nombre.toUpperCase()}</Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]}>{formatCurrency(i.monto)}</Text>
            <Text style={[styles.tableCell, { flex: 2 }]}> </Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]}> </Text>
          </View>
        ))}
      </View>

      {/* ── SECCIÓN 5 — Título del contrato ─────────────────────────────── */}
      <Text style={[styles.title, { marginTop: 24 }]} break>
        CONTRATO
      </Text>

      {/* ── SECCIÓN 6 — Texto introductorio ─────────────────────────────── */}
      <Text style={styles.upper}>
        CONTRATO DE {RL} PARA EL PRODUCTO DENOMINADO &quot;CRÉDITO SOLIDARIO&quot; QUE CELEBRA
        POR UNA PARTE {RL}&quot; Y POR OTRA PARTE EL INTEGRANTE DEL PRESENTE ACUERDO DE
        VOLUNTADES, Y QUE EN LO SUCESIVO SE LE DENOMINARA COMO EL &quot;CLIENTE&quot; AMBOS
        INTERVINIENTES SE LE DENOMINARA COMO &quot;LAS PARTES&quot; CON CAPACIDAD LEGAL PARA
        OBLIGARSE, MANIFESTANDO SU PLENA VOLUNTAD EN SUJETARSE AL TENOR DE LAS SIGUIENTES
        DECLARACIONES Y CLAUSULAS.
      </Text>

      {/* ── SECCIÓN 7 — Declaraciones ───────────────────────────────────── */}
      <Text style={styles.sectionTitle}>DECLARACIONES:</Text>

      <Text style={[styles.upper, styles.bold]}>LOS CLIENTES DECLARAN:</Text>

      <Text style={styles.upper}>
        QUE SON PERSONAS FÍSICAS DE NACIONALIDAD MEXICANA, CON PLENO GOCE Y EJERCICIO DE SUS
        FACULTADES PARA LA CELEBRACIÓN DEL PRESENTE CONTRATO.
      </Text>

      <Text style={styles.upper}>
        QUE SUS DATOS GENERALES SON LOS QUE HAN QUEDADO ASENTADOS LA SOLICITUD DE CRÉDITO,
        INSTRUMENTO POR MEDIO DEL CUAL MANIFIESTAN SU DESEO DE QUE SE LES OTORGUE EL CRÉDITO
        SOLICITADO, DE CONFORMIDAD A LOS TÉRMINOS Y CONDICIONES QUE TENGA ESTIPULADA &quot;{RL}&quot;
        LES DIO A CONOCER EL CONTENIDO DEL PRESENTE INSTRUMENTO Y DE LOS DEMÁS DOCUMENTOS A
        SUSCRIBIR, LOS CARGOS O GASTOS QUE SE GENEREN CONSECUENCIA DEL MISMO, ASÍ COMO EL COSTO
        ANUAL TOTAL DE FINANCIAMIENTO EXPRESADO EN TÉRMINOS PORCENTUALES ANUALES QUE, PARA
        FINES INFORMATIVOS Y DE COMPARACIÓN, INCORPORA LA TOTALIDAD DE LOS COSTOS Y
        PORCENTUALES ANUALES QUE, PARA FINES INFORMATIVOS Y DE COMPARACIÓN, INCORPORA LA
        TOTALIDAD DE LOS COSTOS Y GASTOS INHERENTES A LOS CRÉDITOS (CAT), CORRESPONDIENTE AL
        PRESENTE CRÉDITO.
      </Text>

      <Text style={styles.upper}>
        QUE CON LA FIRMA DE ESTE CONTRATO SE OBLIGAN A MANTENER UNA ACTIVIDAD ECONÓMICA
        PRODUCTIVA, LÍCITA Y RENTABLE, QUE PROVEA SU SUBSISTENCIA PERSONAL Y FAMILIAR, ASÍ
        COMO SU CAPACIDAD DE PAGO Y ELEGIBILIDAD CREDITICIA QUE DECLARAN BAJO PROTESTA DE
        DECIR VERDAD, QUE LA INFORMACIÓN Y DOCUMENTACIÓN PROPORCIONADA POR ELLOS, ES VISTICA Y
        CARECE DE TODA FALSEDAD.
      </Text>

      <Text style={[styles.upper, styles.bold]}>LAS PARTES&quot; DECLARAN:</Text>

      <Text style={styles.upper}>
        QUE SE RECONOCE MUTUAMENTE LA PERSONALIDAD QUE QUEDÓ ACREDITADA EN LOS TÉRMINOS DE LOS
        ANTECEDENTES ANTERIORES MANIFIESTAN LIBREMENTE SU VOLUNTAD PARA CELEBRAR EL PRESENTE
        CONTRATO EN LOS TÉRMINOS DE LAS SIGUIENTES:
      </Text>

      {/* ── SECCIÓN 8 — Cláusulas ───────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>CLAUSULAS</Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>PRIMERA: OBJETO DEL CONTRATO </Text>
        &quot;{RL}&quot; OTORGA UN CRÉDITO GRUPAL A FAVOR DEL &quot;CLIENTE&quot; POR LA CANTIDAD
        QUE SE INDICA EN LA LISTA DE INTEGRANTES DEL &quot;GRUPO&quot;, ASCIENDE A LA CANTIDAD
        DE {MONTO} ({montoLetras}). CONVENIDAS EN ESTE CONTRATO, OBLIGÁNDOSE A RESTITUIR A
        &quot;{RL}&quot;. EL IMPORTE DEL CRÉDITO MÁS IMPUESTOS, INTERESES Y GASTOS QUE SE
        ESTIPULEN O GENEREN HASTA EL DÍA DE LIQUIDACIÓN TOTAL DEL CRÉDITO.
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>SEGUNDA: DESTINO DEL CRÉDITO. </Text>
        &quot;EL CLIENTE&quot; SE OBLIGAN A DESTINAR EL IMPORTE DE CRÉDITO, APARA AQUELLA
        ACTIVIDAD ECONÓMICA ESTABLECIDA EN EL DOCUMENTO DENOMINADO SOLICITUD DE CRÉDITO.
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>TERCERA: DURACIÓN DEL CONTRATO. - </Text>
        EL PRESENTE CONTRATO TENDRÁ COMO PLAZO 8 SEMANAS, DENTRO DEL CUAL &quot;EL CLIENTE&quot;
        DEBERÁN LIQUIDAR A &quot;{RL}&quot; EL CRÉDITO O ANTES DEL PLAZO SI INCURREN EN
        CUALQUIERA DE LAS CAUSALES DE VENCIMIENTO ANTICIPADO ESTABLECIDAS; NO OBSTANTE, SU
        TERMINACIÓN, ESTE CONTRATO PRODUCIRÁ TODOS SUS EFECTOS LEGALES, HASTA QUE LOS CLIENTES
        HAYAN LIQUIDADO EN SU TOTALIDAD TODAS LAS CANTIDADES ADECUADAS QUE EXISTAN A SU CARGO.
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>CUARTA: DISPOSICIÓN DEL CRÉDITO. - </Text>
        LOS &quot;CLIENTES&quot; DISPONDRÁN DEL CRÉDITO EN UNA SOLA EXHIBICIÓN, MEDIANTE LA
        ENTREGA DE ÓRDENES DE PAGO O POR CUALQUIER OTRO MEDIO INCLUSO ELECTRÓNICO QUE
        CONSIDERE &quot;{RL}&quot;, A FAVOR DE CADA UNO DE LOS CLIENTES POR LA CANTIDAD
        PACTADA. POR VIRTUD DE LA FIRMA DEL PRESENTE CONTRATO. &quot;EL CLIENTE&quot; EXTIENDEN
        EL RECIBO MÁS AMPLIO Y SUFICIENTE QUE EN DERECHO PROCEDAN &quot;EL CLIENTE&quot; PODRÁN
        DISPONER DE SU CRÉDITO A LA VISTA.
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>QUINTA: FORMA DE PAGO, TASA DE INTERÉS Y PLAZO. - </Text>
        LOS CLIENTES SE OBLIGAN A PAGAR A &quot;{RL}&quot;:
      </Text>

      <Text style={styles.upper}>
        A). - EL MONTO PRINCIPAL DEL CRÉDITO CONFORME A LA CLÁUSULA PRIMERA DE ESTE CONTRATO,
        MEDIANTE LAS AMORTIZACIONES QUE CORRESPONDAN AL PLAZO DEL CRÉDITO SEÑALADO EN EL ANEXO
        I (CARATULA), LAS QUE COMPRENDAN EL ABONO CORRESPONDIENTE A LA SUERTE PRINCIPAL Y LOS
        INTERESES ORDINARIOS SOBRE SALDOS INSOLUTOS A RAZÓN DE UNA TASA FIJA ANUAL EL PAGO DE
        LOS INTERESES NO PODRÁ SER EXIGIDO POR ADELANTADO, SINO ÚNICAMENTE POR PERIODOS
        VENCIDOS.
      </Text>

      <Text style={styles.upper}>
        B). - EL IMPUESTO AL VALOR AGREGADO (IVA), O CUALQUIER IMPUESTO VIGENTE QUE EN SU CASO
        SE GENERE SOBRE INTERESES Y GASTOS.
      </Text>

      <Text style={styles.upper}>
        &quot;{RL}&quot; DURANTE LA VIGENCIA DE ESTE CONTRATO, NO MODIFICARA LAS TASAS DE
        INTERÉS DEL CRÉDITO NI LOS GASTOS ESTIPULADOS DEL MISMO.
      </Text>

      <Text style={styles.upper}>
        &quot;CLIENTE&quot; SE OBLIGAN A PAGAR A &quot;{RL}&quot; EL MONTO DEL CRÉDITO PRINCIPAL
        MÁS LOS INTERÉS SOBRE SALDOS INSOLUTOS, IMPUESTOS Y GASTOS QUE SE GENEREN HASTA EL DÍA
        DE LA LIQUIDACIÓN TOTAL DEL CRÉDITO, MEDIANTE EL NÚMERO DE AMORTIZACIONES SUCESIVAS QUE
        CORRESPONDAN AL NÚMERO DE MESES QUE INTEGRAN EL PLAZO DEL CRÉDITO.
      </Text>

      <Text style={styles.upper}>
        LOS PAGOS DEBERÁN HACERSE DE FORMA COMPLETA POR EL MONTO TOTAL DE LA AMORTIZACIÓN QUE
        CORRESPONDA, INCLUYENDO LOS IMPUESTOS, INTERESES SOBRE SALDOS INSOLUTOS Y LOS GASTOS
        QUE SE HAYAN CAUSADO. ESTA DISPOSICIÓN ES IRRENUNCIABLE Y SOLAMENTE PODRÁ SER
        MODIFICADA SEGÚN LO CONSIDERE &quot;{RL}&quot;
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>SEXTA: CAT.- </Text>
        PARA FINES INFORMATIVOS Y DE COMPARACIÓN, EL COSTO TOTAL ANUAL (EN DELANTE CAT) DEL
        CRÉDITO ES EL {cat.toFixed(0)}% POR CAT.- SE ENTIENDE EL COSTO ANUAL TOTAL DE
        FINANCIAMIENTO EL CUAL ES EXPRESADO EN TÉRMINOS PORCENTUALES ANUALES PARA FINES
        INFORMATIVOS Y DE COMPARACIÓN E INCORPORA LA TOTALIDAD DE LOS COSTOS Y GASTOS
        INHERENTES AL CRÉDITO.
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>SÉPTIMA: SALDOS Y ESTADOS DE CUENTA. - </Text>
        LOS CLIENTES PODRÁN SOLICITAR UN ESTADO DE CUENTA O BIEN REALIZAR MOVIMIENTOS SOBRE EL
        MISMO, DEBIENDO PARA TAL PROPORCIONAR SU NOMBRE, NUMERO DE CLIENTE O NÚMERO DE CRÉDITO
        &quot;{RL}&quot;
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>OCTAVA: RELACIÓN DE PAGO </Text>
        &quot;{RL}&quot; APLICARA LAS CANTIDADES QUE RECIBA EN PAGO POR ÓRDENES DE VENCIMIENTO,
        CONFORME AL SIGUIENTE ORDEN: IMPUESTOS, GASTO DE COBRANZA, INTERESES MORATORIOS,
        INTERESES ORDINARIOS Y EL PRINCIPAL PARA QUE EL CASO DE QUE {RL} HUBIERA TENIDO QUE
        DEMANDAR A &quot;EL CLIENTE&quot; POR INCUMPLIMIENTO, LOS PAGOS QUE REALICEN SE
        APLICARÁN EN PRIMER LUGAR A LOS GASTOS Y COSTAS DEL JUICIO Y DESPUÉS SE SEGUIRÁ EL
        ORDEN ESTABLECIDO EN LA PRESENTE CLAUSULA.
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>NOVENA: INCUMPLIMIENTO DE CONTRATO Y VENCIMIENTO ANTICIPADO. - </Text>
        EL CLIENTE RECONOCE Y ACEPTA QUE, EN CASO DE INCUMPLIMIENTO DE CUALQUIERA DE LAS
        OBLIGACIONES ESTABLECIDAS EN EL PRESENTE CONTRATO, ASÍ COMO SEA ANEXOS SERÁ CAUSA
        SUFICIENTE PARA QUE OPERE DE PLENO DERECHO Y SIN DECLARACIÓN LOS CASOS PREVISTOS POR EL
        ARTÍCULO 301 DE LA LEY GENERAL DE TÍTULOS Y OPERACIONES DE CRÉDITO DE CUALQUIER O
        CUALQUIER LEGISLACIÓN APLICABLE. LOS &quot;CLIENTES&quot; Y &quot;{RL}&quot; PODRÁN
        DAR POR TERMINADO ANTICIPADAMENTE EL CONTRATO DE ACUERDO A LO SIGUIENTE:
      </Text>

      <Text style={styles.upper}>
        1.- EL CLIENTE QUE SE ENCUENTREN AL CORRIENTE CON SUS PAGOS Y QUE DECIDAN LIQUIDAR
        ANTICIPADAMENTE EL TOTAL DE SU SALDO INSOLUTO, PODRÁN SOLICITAR LA TERMINACIÓN
        ANTICIPADA DEL CONTRATO, PRESENTANDO UNA SOLICITUD POR ESCRITO A &quot;{RL}&quot; A
        TRAVÉS DEL FORMATO QUE ESTE SEÑALE CON AL MENOS OCHO DÍAS PREVIOS A SU SIGUIENTE
        EXIGIBILIDAD, QUIEN LE ENTREGARA UN ACUSE DE RECIBO DE DICHA SOLICITUD &quot;{RL}&quot;
        DARÁ POR TERMINADO EL CONTRATO EL DÍA HÁBIL SIGUIENTE A AQUEL EN QUE RECIBA LA
        SOLICITUD, EN CASO DE QUE NO EXISTAN ADEUDOS &quot;EL CLIENTE&quot; COMO COMPROBANTE
        DE TERMINACIÓN DEL CONTRATO, SU PAGARE INDIVIDUAL QUE DOCUMENTE LA DISPOSICIÓN DEL
        CRÉDITO OTORGADO, DEBIDAMENTE CANCELADO, PARA LO CUAL AMBOS DOCUMENTOS SERÁN PRUEBA
        SUFICIENTE DE QUE SE DÉ POR TERMINADA LA RELACIÓN CONTRACTUAL Y DE LA EXISTENCIA DE
        ADEUDOS DERIVADOS DE DICHA RELACIÓN.
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>DECIMA: PAGARE. - </Text>
        DEL CLIENTE SUSCRIBIRÁ A LA ORDEN DE &quot;{RL}&quot; UN PAGARE INDIVIDUAL QUE DOCUMENTE
        LA DISPOSICIÓN DEL CRÉDITO OTORGADO. ESTOS TÍTULOS SE CONSIDERARÁN PAGADEROS A LA VISTA
        Y EN CASO DE CUMPLIMIENTO NORMAL Y PUNTUAL DE LOS &quot;CLIENTES&quot; SERÁN
        CANCELADOS: POR LO QUE UNA VEZ LIQUIDADO EN SU TOTALIDAD LOS IMPUESTOS, INTERESES SOBRE
        SALDOS INSOLUTOS, GASTOS Y EL PRINCIPAL POR PARTE DE LOS &quot;CLIENTES&quot;
        &quot;{RL}&quot; DEVOLVERÁ LOS PAGARÉS A LOS &quot;CLIENTES&quot; LO QUE SERÁ PRUEBA
        SUFICIENTE DE LA CANCELACIÓN DEL CRÉDITO. LOS PAGARÉS TAMBIÉN DEBERÁN SER SUSCRITOS POR
        UNO O DOS AVALES CONFORME A LAS POLÍTICAS DE &quot;{RL}&quot;
      </Text>

      <Text style={styles.upper}>
        <Text style={styles.bold}>DECIMA PRIMERA: CESIÓN DE DERECHOS. - </Text>
        LOS &quot;CLIENTES AUTORIZAN DESDE ESTE MOMENTO Y EXPRESAMENTE A &quot;{RL}&quot; PARA
        QUE PUEDA CEDER O DESCONTAR, GRAVAR, ENAJENAR O TRANSMITIR, AUN ANTES DE SU VENCIMIENTO
        DEL PRESENTE CONTRATO LOS DERECHOS DE CRÉDITO, SIN QUE ELLO IMPLIQUE UNA RENOVACIÓN
        DEL MISMO. LOS CLIENTES&quot; NO PODRÁN CEDER SUS DERECHOS Y OBLIGACIONES DERIVADOS DEL
        PRESENTE CONTRATO SI NO MEDIANTE PREVIO CONSENTIMIENTO ESCRITO Y FIRMADO POR
        &quot;{RL}&quot;
      </Text>

      {/* ── SECCIÓN 9 — Cierre del contrato ─────────────────────────────── */}
      <Text style={[styles.upper, { marginTop: 12 }]}>
        UNA VEZ QUE LOS &quot;CLIENTES Y &quot;{RL}&quot; LEYERON EL PRESENTE CONTRATO Y
        QUEDARON ENTENDIDAS TODAS Y CADA UNA DE LAS OBLIGACIONES CONSIGNADAS EN EL MISMO, LO
        FIRMAN EN LA CIUDAD DE {CIUDAD}, MEXICO, {fechaDesembolso} QUEDANDO EN EJEMPLAR DE
        DICHO CONTRATO Y SEA ANEXOS EN PODER DE CADA UNA DE LAS PARTES.
      </Text>

      {/* ── SECCIÓN 10 — Tabla CLIENTE (al final) ───────────────────────── */}
      <Text style={[styles.subTitle, { marginTop: 16 }]}>CLIENTE</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellHeader, { flex: 3 }]}>INTEGRANTE</Text>
          <Text style={[styles.tableCellHeader, { flex: 1.5 }]}>MONTO</Text>
          <Text style={[styles.tableCellHeader, { flex: 2 }]}>FIRMA</Text>
          <Text style={[styles.tableCellHeader, { flex: 1.5 }]}>HUELLA</Text>
        </View>
        {integrantes.map((i, idx) => (
          <View
            key={`firma-${idx}`}
            style={idx === integrantes.length - 1 ? styles.tableRowLast : styles.tableRow}
          >
            <Text style={[styles.tableCell, { flex: 3 }]}>{i.nombre.toUpperCase()}</Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]}>{formatCurrency(i.monto)}</Text>
            <Text style={[styles.tableCell, { flex: 2 }]}> </Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]}> </Text>
          </View>
        ))}
      </View>

      {/* ── SECCIÓN 11 — Firma del representante legal ──────────────────── */}
      <View style={[styles.signaturesRow, { marginTop: 24 }]}>
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureName}>{RL}</Text>
          <Text style={styles.signatureLabel}>REPRESENTANTE LEGAL</Text>
        </View>
      </View>

      {/* ── SECCIÓN 12 — Texto final ────────────────────────────────────── */}
      <Text style={[styles.upper, { marginTop: 16 }]}>
        LAS PERSONAS QUE AQUÍ FIRMA LO HACE A RUEGO Y ENCARGO DEL CLIENTE QUE HA PLASMADO SU
        FIRMA Y HUELLA DIGITAL EN LA LISTA DE INTEGRANTES (ANEXO I), HACIENDO CONSTAR EN ELLO
        QUE CONOCE Y ESTÁ DE ACUERDO EN LAS CARACTERÍSTICAS DE LA MISMA Y CON EL CONTENIDO DEL
        CONTRATO DE CRÉDITO SIMPLE PARA EL PRODUCTO DE NOMINA CRÉDITO GRUPAL.
      </Text>
    </BaseTemplatePage>
  )
}
