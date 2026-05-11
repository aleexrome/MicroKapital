import { Page, View, Text, Image } from '@react-pdf/renderer'
import { styles } from './styles'
import { MICROKAPITAL_LOGO_URL } from './BaseTemplate'
import { formatCurrency, formatDateShort } from '../formatters'

export interface ControlPagosIndividualProps {
  nombreSucursal: string
  fechaInicio: Date
  fechaTermino: Date
  diaCobro: string
  horaLimiteCobro: string
  ciclo?: string
  cliente: { nombre: string; monto: number; pago: number }
  aval:    { nombre: string }
  fechasPagos: Date[]   // 12 fechas
}

const PLAZO_PAGOS = 12

export function ControlPagosIndividual(props: ControlPagosIndividualProps) {
  const {
    nombreSucursal, fechaInicio, fechaTermino, diaCobro, horaLimiteCobro,
    ciclo = '01', cliente, aval, fechasPagos,
  } = props

  // Anchos para landscape (12 columnas pago + base)
  const W_NO    = 22
  const W_ROL   = 32
  const W_NOMB  = 150
  const W_MONTO = 60
  const W_PAGO  = 60
  const W_CELDA = 38

  return (
    <Page size="LETTER" orientation="landscape" style={styles.pageLandscape}>
        {/* Header */}
        <View style={styles.controlHeader}>
          <View>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>
              CONTROL DE PAGOS — CRÉDITO INDIVIDUAL
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
          {diaCobro.toUpperCase()} ANTES DE LAS {horaLimiteCobro}
        </Text>

        <View style={styles.controlTable}>
          <View style={styles.controlRowHeader}>
            <Text style={[styles.controlCellHeader, { width: W_NO }]}>NO.</Text>
            <Text style={[styles.controlCellHeader, { width: W_ROL }]}>ROL</Text>
            <Text style={[styles.controlCellHeader, { width: W_NOMB, textAlign: 'left' }]}>NOMBRE</Text>
            <Text style={[styles.controlCellHeader, { width: W_MONTO }]}>MONTO</Text>
            <Text style={[styles.controlCellHeader, { width: W_PAGO }]}>PAGO</Text>
            {Array.from({ length: PLAZO_PAGOS }).map((_, i) => (
              <Text key={i} style={[styles.controlCellHeader, { width: W_CELDA }]}>
                P{i + 1}
                {fechasPagos[i] ? `\n${formatDateShort(fechasPagos[i])}` : ''}
              </Text>
            ))}
          </View>

          {/* Cliente (UNICO) */}
          <View style={styles.controlRow}>
            <Text style={[styles.controlCell, { width: W_NO, textAlign: 'center' }]}>1</Text>
            <Text style={[styles.controlCell, { width: W_ROL, textAlign: 'center' }]}>UNICO</Text>
            <Text style={[styles.controlCell, { width: W_NOMB }]}>{cliente.nombre.toUpperCase()}</Text>
            <Text style={[styles.controlCell, { width: W_MONTO, textAlign: 'right' }]}>{formatCurrency(cliente.monto)}</Text>
            <Text style={[styles.controlCell, { width: W_PAGO, textAlign: 'right' }]}>{formatCurrency(cliente.pago)}</Text>
            {Array.from({ length: PLAZO_PAGOS }).map((_, k) => (
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
            {Array.from({ length: PLAZO_PAGOS }).map((_, k) => (
              <Text key={k} style={[styles.controlCell, { width: W_CELDA }]}> </Text>
            ))}
          </View>

          {/* FECHA / HORA / BANCO */}
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

        <Text style={styles.controlNoteWarn}>MULTA POR RETARDO EN HORARIO $100 AL CLIENTE</Text>
        <Text style={styles.controlNoteDanger}>
          RESCISIÓN DE CONTRATO ANTICIPADAMENTE CON 2 ATRASOS CONSECUTIVOS DURANTE EL CICLO
        </Text>

        <Text style={styles.controlFooter}>
          ** SE DEBE TENER 0 DÍAS DE ATRASO EN HORARIO Y DÍA PARA PODER PEDIR FINANCIAMIENTO DE PAGOS. **
        </Text>
    </Page>
  )
}
