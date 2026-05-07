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
 * Plantilla base — wrapper standalone que devuelve un <Document>
 * completo. Útil para PDFs de un solo documento (ej. test-pdf).
 *
 * Si quieres componer varias secciones en un PDF único, usa
 * `BaseTemplatePage` que devuelve solo `<Page>` y deja que el caller
 * envuelva todas las páginas en un `<Document>`.
 */
export function BaseTemplate({
  numeroContrato,
  lugarFirma,
  fechaFirma,
  children,
}: BaseTemplateProps) {
  return (
    <Document>
      <BaseTemplatePage
        numeroContrato={numeroContrato}
        lugarFirma={lugarFirma}
        fechaFirma={fechaFirma}
      >
        {children}
      </BaseTemplatePage>
    </Document>
  )
}

/**
 * Versión "Page" de la plantilla — devuelve solo `<Page>` con header
 * y footer fijos. Permite composición de múltiples secciones en un
 * mismo Document desde un caller externo.
 */
export function BaseTemplatePage({
  numeroContrato,
  lugarFirma,
  fechaFirma,
  children,
}: BaseTemplateProps) {
  return (
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
  )
}
