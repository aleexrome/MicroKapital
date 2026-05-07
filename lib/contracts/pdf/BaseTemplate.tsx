import { Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { styles, PAGE_SIZE } from './styles'

export const MICROKAPITAL_LOGO_URL =
  'https://res.cloudinary.com/djs8dtzrq/image/upload/v1777329446/PHOTO-2026-04-27-16-21-06-removebg-preview_fczmpb.png'

interface BaseTemplateProps {
  numeroContrato: string
  lugarFirma: string
  fechaFirma: string
  children: React.ReactNode
}

/**
 * Plantilla base para todos los PDFs del módulo de contratos.
 *
 * Renderiza un <Document> con una <Page> que tiene header y footer
 * fijos (en cada página). El contenido del documento se pasa como
 * `children` y se renderiza entre el header y el footer, respetando
 * los márgenes definidos en `styles.page`.
 *
 * El footer muestra:
 *   [folio]  ·  Página X de Y  ·  [lugar, fecha]
 */
export function BaseTemplate({
  numeroContrato,
  lugarFirma,
  fechaFirma,
  children,
}: BaseTemplateProps) {
  return (
    <Document>
      <Page size={PAGE_SIZE} style={styles.page}>
        {/* Header — fijo en cada página */}
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>MICROKAPITAL FINANCIERA</Text>
          <Image src={MICROKAPITAL_LOGO_URL} style={styles.headerLogo} />
        </View>

        {/* Contenido del documento */}
        {children}

        {/* Footer — fijo en cada página, con paginación dinámica */}
        <View style={styles.footer} fixed>
          <View style={styles.footerCol}>
            <Text>Folio: {numeroContrato}</Text>
          </View>
          <Text
            style={styles.footerColCenter}
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
          <Text style={styles.footerColRight}>
            {lugarFirma}, {fechaFirma}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
