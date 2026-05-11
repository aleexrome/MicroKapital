import { Page, View, Text, Image } from '@react-pdf/renderer'
import { styles } from './styles'
import { MICROKAPITAL_LOGO_URL } from './BaseTemplate'
import { formatCurrency, formatDateShort } from '../formatters'

export interface ControlPagosSolidarioProps {
  nombreGrupo: string
  nombreSucursal: string
  fechaInicio: Date
  fechaTermino: Date
  diaCobro: string
  horaLimiteCobro: string
  ciclo?: string
  integrantes: Array<{
    nombre: string
    esCoordinadora: boolean
    monto: number
    pago: number
  }>
  fechasPagos: Date[]   // 8 fechas
}

const PLAZO_PAGOS = 8

export function ControlPagosSolidario(props: ControlPagosSolidarioProps) {
  const {
    nombreGrupo, nombreSucursal, fechaInicio, fechaTermino,
    diaCobro, horaLimiteCobro, ciclo = '01',
    integrantes, fechasPagos,
  } = props

  const totalMonto = integrantes.reduce((s, i) => s + i.monto, 0)
  const totalPago  = integrantes.reduce((s, i) => s + i.pago, 0)

  // Anchos de columna fijos para que cuadre el header con las filas
  const W_NO    = 22
  const W_ROL   = 22
  const W_NOMB  = 180
  const W_MONTO = 70
  const W_PAGO  = 60
  const W_CELDA = 56  // cada celda de PAGO N

  return (
    <Page size="LETTER" orientation="landscape" style={styles.pageLandscape}>
        {/* Header con logo */}
        <View style={styles.controlHeader}>
          <View>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>
              CONTROL DE PAGOS — CRÉDITO SOLIDARIO
            </Text>
            <Text style={{ fontSize: 9, marginTop: 2 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>NOMBRE DEL GRUPO: </Text>
              {nombreGrupo.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 9 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>CL: </Text>
              {ciclo}
            </Text>
            <Text style={{ fontSize: 9 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>SUCURSAL: </Text>
              {nombreSucursal.toUpperCase()}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Image src={MICROKAPITAL_LOGO_URL} style={{ width: 140, height: 56, objectFit: 'contain' }} />
            <Text style={{ fontSize: 9, marginTop: 4 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>FECHA DE INICIO: </Text>
              {formatDateShort(fechaInicio)}
            </Text>
            <Text style={{ fontSize: 9 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>FECHA DE TÉRMINO: </Text>
              {formatDateShort(fechaTermino)}
            </Text>
          </View>
        </View>

        {/* Banner amarillo */}
        <Text style={styles.controlBanner}>
          {diaCobro.toUpperCase()} ANTES DE LAS {horaLimiteCobro}
        </Text>

        {/* Tabla principal */}
        <View style={styles.controlTable}>
          {/* Header */}
          <View style={styles.controlRowHeader}>
            <Text style={[styles.controlCellHeader, { width: W_NO }]}>NO.</Text>
            <Text style={[styles.controlCellHeader, { width: W_ROL }]}>C</Text>
            <Text style={[styles.controlCellHeader, { width: W_NOMB, textAlign: 'left' }]}>NOMBRE DEL CLIENTE</Text>
            <Text style={[styles.controlCellHeader, { width: W_MONTO }]}>MONTO</Text>
            <Text style={[styles.controlCellHeader, { width: W_PAGO }]}>PAGO</Text>
            {Array.from({ length: PLAZO_PAGOS }).map((_, i) => (
              <Text key={i} style={[styles.controlCellHeader, { width: W_CELDA }]}>
                PAGO {i + 1}
                {fechasPagos[i] ? `\n${formatDateShort(fechasPagos[i])}` : ''}
              </Text>
            ))}
          </View>

          {/* Filas de integrantes */}
          {integrantes.map((i, idx) => (
            <View key={idx} style={styles.controlRow}>
              <Text style={[styles.controlCell, { width: W_NO, textAlign: 'center' }]}>{idx + 1}</Text>
              <Text style={[styles.controlCell, { width: W_ROL, textAlign: 'center' }]}>
                {i.esCoordinadora ? 'C' : 'I'}
              </Text>
              <Text style={[styles.controlCell, { width: W_NOMB }]}>{i.nombre.toUpperCase()}</Text>
              <Text style={[styles.controlCell, { width: W_MONTO, textAlign: 'right' }]}>{formatCurrency(i.monto)}</Text>
              <Text style={[styles.controlCell, { width: W_PAGO, textAlign: 'right' }]}>{formatCurrency(i.pago)}</Text>
              {Array.from({ length: PLAZO_PAGOS }).map((_, k) => (
                <Text key={k} style={[styles.controlCell, { width: W_CELDA }]}> </Text>
              ))}
            </View>
          ))}

          {/* Fila TOTAL */}
          <View style={[styles.controlRow, { backgroundColor: '#F3F4F6' }]}>
            <Text style={[styles.controlCellHeader, { width: W_NO + W_ROL + W_NOMB, textAlign: 'left' }]}>TOTAL</Text>
            <Text style={[styles.controlCellHeader, { width: W_MONTO, textAlign: 'right' }]}>{formatCurrency(totalMonto)}</Text>
            <Text style={[styles.controlCellHeader, { width: W_PAGO, textAlign: 'right' }]}>{formatCurrency(totalPago)}</Text>
            {Array.from({ length: PLAZO_PAGOS }).map((_, k) => (
              <Text key={k} style={[styles.controlCell, { width: W_CELDA }]}> </Text>
            ))}
          </View>

          {/* Filas vacías FECHA / HORA / BANCO */}
          {['FECHA', 'HORA', 'BANCO'].map((label) => (
            <View key={label} style={styles.controlRow}>
              <Text style={[styles.controlCellHeader, { width: W_NO + W_ROL + W_NOMB + W_MONTO + W_PAGO, textAlign: 'left' }]}>
                {label}
              </Text>
              {Array.from({ length: PLAZO_PAGOS }).map((_, k) => (
                <Text key={k} style={[styles.controlCell, { width: W_CELDA }]}> </Text>
              ))}
            </View>
          ))}
        </View>

        {/* Notas */}
        <Text style={styles.controlNoteWarn}>MULTA POR RETARDO EN HORARIO $200 POR INTEGRANTE</Text>
        <Text style={styles.controlNoteDanger}>MORA POR DÍA DE ATRASO: 10% PAGARÉ TOTAL GRUPAL</Text>

        {/* Footer */}
        <Text style={styles.controlFooter}>
          SON OBLIGADOS SOLIDARIOS, TODOS SON AVAL DE TODOS
          {'\n'}
          ** SE DEBE TENER 0 DÍAS DE ATRASO EN HORARIO Y DÍA PARA PODER PEDIR FINANCIAMIENTO DE PAGOS. **
        </Text>
    </Page>
  )
}
