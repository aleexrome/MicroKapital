import { Page, View, Text, Image } from '@react-pdf/renderer'
import { styles } from './styles'
import { MICROKAPITAL_LOGO_URL } from './BaseTemplate'
import { formatCurrency, formatDateShort } from '../formatters'

export interface SolicitudCreditoIntegrante {
  rol: 'Coordinadora' | 'Integrante' | 'Cliente' | 'Aval'
  numero: number
  nombre: string
  montoAnterior?: number
  montoSolicitado: number
}

export interface SolicitudCreditoProps {
  tipoCredito: 'SOLIDARIO' | 'INDIVIDUAL' | 'AGIL'
  nombreGrupo?: string
  nombreSucursal: string
  coordinador: string
  fecha: Date
  integrantes: SolicitudCreditoIntegrante[]
  total: number
  pactado: number
  pactadoFrecuencia: 'SEMANAL' | 'DIARIO'
}

const TIPO_LABEL: Record<SolicitudCreditoProps['tipoCredito'], string> = {
  SOLIDARIO:  'CRÉDITO SOLIDARIO',
  INDIVIDUAL: 'CRÉDITO INDIVIDUAL',
  AGIL:       'CRÉDITO ÁGIL',
}

/**
 * Caratula del paquete de contratos. Cubre los 3 productos —
 * cambia la lista de integrantes y el tipo de pactado (semanal/diario).
 */
export function SolicitudCredito(props: SolicitudCreditoProps) {
  const {
    tipoCredito, nombreGrupo, nombreSucursal, coordinador, fecha,
    integrantes, total, pactado, pactadoFrecuencia,
  } = props

  return (
    <Page size="LETTER" style={styles.page}>
        {/* Header con logo */}
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>MICROKAPITAL FINANCIERA</Text>
          <Image src={MICROKAPITAL_LOGO_URL} style={styles.headerLogo} />
        </View>

        <Text style={[styles.title, { textAlign: 'center', marginBottom: 16 }]}>
          SOLICITUD DE CRÉDITO
        </Text>

        <Text style={{ textAlign: 'center', fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 20 }}>
          {TIPO_LABEL[tipoCredito]}
        </Text>

        {/* Datos arriba */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            {tipoCredito === 'SOLIDARIO' && nombreGrupo && (
              <Text style={{ fontSize: 10, marginBottom: 2 }}>
                <Text style={styles.bold}>NOMBRE DEL GRUPO: </Text>
                {nombreGrupo.toUpperCase()}
              </Text>
            )}
            <Text style={{ fontSize: 10, marginBottom: 2 }}>
              <Text style={styles.bold}>SUCURSAL: </Text>
              {nombreSucursal.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 10, marginBottom: 2 }}>
              <Text style={styles.bold}>COORDINADOR: </Text>
              {coordinador.toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 10 }}>
              <Text style={styles.bold}>FECHA: </Text>
              {formatDateShort(fecha)}
            </Text>
          </View>
        </View>

        {/* Tabla principal */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCellHeader, { flex: 2 }]}>ROL</Text>
            <Text style={[styles.tableCellHeader, { flex: 0.7 }]}>#</Text>
            <Text style={[styles.tableCellHeader, { flex: 4 }]}>NOMBRE COMPLETO</Text>
            <Text style={[styles.tableCellHeader, { flex: 1.5 }]}>MONTO ANTERIOR</Text>
            <Text style={[styles.tableCellHeader, { flex: 1.5 }]}>MONTO SOLICITADO</Text>
            <Text style={[styles.tableCellHeader, { flex: 2 }]}>FIRMA</Text>
          </View>
          {integrantes.map((i, idx) => (
            <View
              key={idx}
              style={idx === integrantes.length - 1 ? styles.tableRowLast : styles.tableRow}
            >
              <Text style={[styles.tableCell, { flex: 2 }]}>{i.rol}</Text>
              <Text style={[styles.tableCell, { flex: 0.7, textAlign: 'center' }]}>{i.numero}</Text>
              <Text style={[styles.tableCell, { flex: 4 }]}>{i.nombre.toUpperCase()}</Text>
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
                {i.montoAnterior !== undefined ? formatCurrency(i.montoAnterior) : '—'}
              </Text>
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>
                {formatCurrency(i.montoSolicitado)}
              </Text>
              <Text style={[styles.tableCell, { flex: 2 }]}> </Text>
            </View>
          ))}
        </View>

        {/* Fila TOTAL */}
        <View style={[styles.table, { marginTop: -1 }]}>
          <View style={[styles.tableRow, { backgroundColor: '#F3F4F6' }]}>
            <Text style={[styles.tableCellHeader, { flex: 6.7 }]}>TOTAL</Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]}> </Text>
            <Text style={[styles.tableCellHeader, { flex: 1.5, textAlign: 'right' }]}>
              {formatCurrency(total)}
            </Text>
            <Text style={[styles.tableCell, { flex: 2 }]}> </Text>
          </View>
          <View style={styles.tableRowLast}>
            <Text style={[styles.tableCellHeader, { flex: 6.7 }]}>
              PACTADO {pactadoFrecuencia}
            </Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]}> </Text>
            <Text style={[styles.tableCellHeader, { flex: 1.5, textAlign: 'right' }]}>
              {formatCurrency(pactado)}
            </Text>
            <Text style={[styles.tableCell, { flex: 2 }]}> </Text>
          </View>
        </View>
    </Page>
  )
}
