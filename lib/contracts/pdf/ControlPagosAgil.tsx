import { Page, View, Text, Image } from '@react-pdf/renderer'
import { styles } from './styles'
import { MICROKAPITAL_LOGO_URL } from './BaseTemplate'
import { formatCurrency, formatDateShort } from '../formatters'

export interface ControlPagosAgilProps {
  nombreSucursal: string
  fechaInicio: Date
  fechaTermino: Date
  horaLimiteCobro: string
  ciclo?: string
  cliente: { nombre: string; monto: number; pago: number }
  aval:    { nombre: string }
  fechasPagos: Date[]   // 24 fechas
}

const PLAZO_PAGOS = 24
const PAGOS_PRIMERA_TABLA  = 12
const PAGOS_SEGUNDA_TABLA  = 12

export function ControlPagosAgil(props: ControlPagosAgilProps) {
  const {
    nombreSucursal, fechaInicio, fechaTermino, horaLimiteCobro,
    ciclo = '01', cliente, aval, fechasPagos,
  } = props

  const W_NO    = 22
  const W_ROL   = 32
  const W_NOMB  = 150
  const W_MONTO = 60
  const W_PAGO  = 60
  const W_CELDA = 38

  // Render de una sub-tabla con N columnas de pago a partir del índice base
  const renderTabla = (offset: number, cantidad: number, label: string) => (
    <View style={[styles.controlTable, { marginTop: 8 }]}>
      <View style={styles.controlRowHeader}>
        <Text style={[styles.controlCellHeader, { width: W_NO }]}>NO.</Text>
        <Text style={[styles.controlCellHeader, { width: W_ROL }]}>ROL</Text>
        <Text style={[styles.controlCellHeader, { width: W_NOMB, textAlign: 'left' }]}>{label}</Text>
        <Text style={[styles.controlCellHeader, { width: W_MONTO }]}>MONTO</Text>
        <Text style={[styles.controlCellHeader, { width: W_PAGO }]}>PAGO</Text>
        {Array.from({ length: cantidad }).map((_, i) => {
          const idx = offset + i
          return (
            <Text key={i} style={[styles.controlCellHeader, { width: W_CELDA }]}>
              P{idx + 1}
              {fechasPagos[idx] ? `\n${formatDateShort(fechasPagos[idx])}` : ''}
            </Text>
          )
        })}
      </View>

      {/* Cliente */}
      <View style={styles.controlRow}>
        <Text style={[styles.controlCell, { width: W_NO, textAlign: 'center' }]}>1</Text>
        <Text style={[styles.controlCell, { width: W_ROL, textAlign: 'center' }]}>UNICO</Text>
        <Text style={[styles.controlCell, { width: W_NOMB }]}>{cliente.nombre.toUpperCase()}</Text>
        <Text style={[styles.controlCell, { width: W_MONTO, textAlign: 'right' }]}>{formatCurrency(cliente.monto)}</Text>
        <Text style={[styles.controlCell, { width: W_PAGO, textAlign: 'right' }]}>{formatCurrency(cliente.pago)}</Text>
        {Array.from({ length: cantidad }).map((_, k) => (
          <Text key={k} style={[styles.controlCell, { width: W_CELDA }]}> </Text>
        ))}
      </View>

      {/* Aval */}
      <View style={styles.controlRow}>
        <Text style={[styles.controlCell, { width: W_NO, textAlign: 'center' }]}>2</Text>
        <Text style={[styles.controlCell, { width: W_ROL, textAlign: 'center' }]}>AVAL</Text>
        <Text style={[styles.controlCell, { width: W_NOMB }]}>{aval.nombre.toUpperCase()}</Text>
        <Text style={[styles.controlCell, { width: W_MONTO }]}> </Text>
        <Text style={[styles.controlCell, { width: W_PAGO }]}> </Text>
        {Array.from({ length: cantidad }).map((_, k) => (
          <Text key={k} style={[styles.controlCell, { width: W_CELDA }]}> </Text>
        ))}
      </View>

      {/* FECHA / HORA / BANCO */}
      {['FECHA', 'HORA', 'BANCO'].map((l) => (
        <View key={l} style={styles.controlRow}>
          <Text style={[styles.controlCellHeader, { width: W_NO + W_ROL + W_NOMB + W_MONTO + W_PAGO, textAlign: 'left' }]}>
            {l}
          </Text>
          {Array.from({ length: cantidad }).map((_, k) => (
            <Text key={k} style={[styles.controlCell, { width: W_CELDA }]}> </Text>
          ))}
        </View>
      ))}
    </View>
  )

  return (
    <Page size="LETTER" orientation="landscape" style={styles.pageLandscape}>
        {/* Header */}
        <View style={styles.controlHeader}>
          <View>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>
              CONTROL DE PAGOS — CRÉDITO ÁGIL
            </Text>
            <Text style={{ fontSize: 9, marginTop: 2 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>CLIENTE: </Text>
              {cliente.nombre.toUpperCase()}
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

        <Text style={styles.controlBanner}>
          DIARIO ANTES DE LAS {horaLimiteCobro}
        </Text>

        {/* 24 columnas no caben — partimos en 2 sub-tablas de 12 */}
        {renderTabla(0, PAGOS_PRIMERA_TABLA, 'NOMBRE (PAGOS 1-12)')}
        {renderTabla(PAGOS_PRIMERA_TABLA, PAGOS_SEGUNDA_TABLA, 'NOMBRE (PAGOS 13-24)')}

        <Text style={styles.controlNoteWarn}>MULTA POR RETARDO EN HORARIO $50 AL CLIENTE</Text>
        <Text style={styles.controlNoteDanger}>MORA POR DÍA DE ATRASO: $100</Text>
        <Text style={[styles.controlNoteDanger, { backgroundColor: '#FEE2E2' }]}>
          ** PARA RENOVACIÓN ANTICIPADA SE DEBE CUBRIR HASTA PAGO {PLAZO_PAGOS - 4} Y SOLICITAR
          FINANCIAMIENTO DE LAS ÚLTIMAS 4 FICHAS **
        </Text>
    </Page>
  )
}
