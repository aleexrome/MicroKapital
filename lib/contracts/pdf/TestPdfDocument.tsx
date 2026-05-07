import { View, Text } from '@react-pdf/renderer'
import { BaseTemplate } from './BaseTemplate'
import { styles } from './styles'

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod ' +
  'tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
  'quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'

/**
 * Documento dummy para validar la BaseTemplate antes de crear los
 * contratos reales. Solo se usa desde el endpoint /api/contracts/test-pdf.
 */
export function TestPdfDocument() {
  return (
    <BaseTemplate
      numeroContrato="MK-TEN-2026-00001"
      lugarFirma="TENANCINGO, MEX."
      fechaFirma="7 de mayo de 2026"
    >
      <View>
        <Text style={styles.title}>PDF de prueba — Microkapital</Text>
        <Text style={styles.small}>
          Documento generado para validar la plantilla base. No tiene valor legal.
        </Text>

        <View style={styles.spacer} />

        <Text style={styles.paragraph}>{LOREM}</Text>
        <Text style={styles.paragraph}>{LOREM}</Text>
        <Text style={styles.paragraph}>{LOREM}</Text>

        <Text style={styles.sectionTitle}>Tabla de ejemplo</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableCellHeader}>Concepto</Text>
            <Text style={styles.tableCellHeader}>Monto</Text>
            <Text style={styles.tableCellHeader}>Detalle</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCell}>Capital</Text>
            <Text style={styles.tableCell}>$10,000.00</Text>
            <Text style={styles.tableCell}>Crédito solidario</Text>
          </View>
          <View style={styles.tableRowLast}>
            <Text style={styles.tableCell}>Interés</Text>
            <Text style={styles.tableCell}>$4,000.00</Text>
            <Text style={styles.tableCell}>40% sobre capital</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Firmas</Text>
        <View style={styles.signaturesRow}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>NOMBRE DE PRUEBA</Text>
            <Text style={styles.signatureLabel}>Cliente</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>REPRESENTANTE LEGAL</Text>
            <Text style={styles.signatureLabel}>Microkapital Financiera</Text>
          </View>
        </View>
      </View>
    </BaseTemplate>
  )
}
