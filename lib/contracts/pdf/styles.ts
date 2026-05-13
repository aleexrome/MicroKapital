import { StyleSheet } from '@react-pdf/renderer'

// Paleta de colores del módulo de contratos
export const COLORS = {
  black:       '#0A0A0A',
  textPrimary: '#0A0A0A',
  textMuted:   '#6B7280',
  border:      '#E5E7EB',
  borderSoft:  '#F3F4F6',
  accent:      '#3B82F6', // azul Microkapital
  white:       '#FFFFFF',
}

// Tamaños de fuente base
export const FONT_SIZES = {
  small:    9,
  body:    10,
  subHeader: 12,
  header:    14,
  title:     16,
}

// Márgenes y dimensiones de página
export const PAGE_MARGIN = 40
export const PAGE_SIZE = 'LETTER' as const

export const styles = StyleSheet.create({
  // Página
  page: {
    paddingTop:    PAGE_MARGIN + 85,  // espacio para el header fixed (logo grande)
    paddingBottom: PAGE_MARGIN + 50,  // espacio para el footer fixed
    paddingLeft:   PAGE_MARGIN,
    paddingRight:  PAGE_MARGIN,
    fontSize:      FONT_SIZES.body,
    color:         COLORS.textPrimary,
    fontFamily:    'Helvetica',
    lineHeight:    1.15,  // ≈ "single" de Word, en vez de 1.5 default
  },

  // Header (fixed en la parte superior)
  header: {
    position:        'absolute',
    top:             PAGE_MARGIN,
    left:            PAGE_MARGIN,
    right:           PAGE_MARGIN,
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingBottom:   8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize:   FONT_SIZES.subHeader,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.black,
    letterSpacing: 0.5,
  },
  headerLogo: {
    width:  170,
    height: 64,
    objectFit: 'contain',
  },

  // Footer (fixed en la parte inferior)
  footer: {
    position:      'absolute',
    bottom:        PAGE_MARGIN,
    left:          PAGE_MARGIN,
    right:         PAGE_MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems:    'center',
    paddingTop:    8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    fontSize:      FONT_SIZES.small,
    color:         COLORS.textMuted,
  },
  footerCol: {
    flexDirection: 'row',
    alignItems:    'center',
    flex:          1,
  },
  footerColCenter: {
    flex:       1,
    textAlign:  'center',
  },
  footerColRight: {
    flex:       1,
    textAlign:  'right',
  },

  // Tipografía — los títulos en negritas se mantienen al tamaño del
  // cuerpo (body) y sólo se distinguen por el peso. Antes eran 16/14/12 pt
  // y rompían el ritmo visual del documento + estiraban el plazo en hojas.
  title: {
    fontSize:   FONT_SIZES.body,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.black,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize:   FONT_SIZES.body,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.black,
    marginTop:    8,
    marginBottom: 4,
  },
  subTitle: {
    fontSize:   FONT_SIZES.body,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.black,
    marginTop:    6,
    marginBottom: 3,
  },
  paragraph: {
    fontSize:     FONT_SIZES.body,
    color:        COLORS.textPrimary,
    marginBottom: 6,
    textAlign:    'justify',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  small: {
    fontSize: FONT_SIZES.small,
    color:    COLORS.textMuted,
  },
  accent: {
    color: COLORS.accent,
  },

  // Tablas
  table: {
    width:           '100%',
    borderWidth:     1,
    borderColor:     COLORS.border,
    borderRadius:    2,
    marginVertical:  8,
  },
  tableRow: {
    flexDirection:    'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  tableHeader: {
    flexDirection:     'row',
    backgroundColor:   COLORS.borderSoft,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableCell: {
    flex:        1,
    paddingHorizontal: 8,
    paddingVertical:   6,
    fontSize:    FONT_SIZES.body,
    color:       COLORS.textPrimary,
  },
  tableCellHeader: {
    flex:        1,
    paddingHorizontal: 8,
    paddingVertical:   6,
    fontSize:    FONT_SIZES.body,
    fontFamily:  'Helvetica-Bold',
    color:       COLORS.black,
  },

  // Firmas
  signaturesRow: {
    flexDirection:  'row',
    justifyContent: 'space-around',
    marginTop:      40,
  },
  signatureBlock: {
    flex:       1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  signatureLine: {
    width:           '100%',
    borderTopWidth:  1,
    borderTopColor:  COLORS.black,
    marginBottom:    4,
  },
  signatureLabel: {
    fontSize:   FONT_SIZES.small,
    color:      COLORS.textMuted,
    textAlign:  'center',
  },
  signatureName: {
    fontSize:   FONT_SIZES.body,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.black,
    textAlign:  'center',
    marginBottom: 2,
  },

  // Utilidades de layout
  spacer: {
    height: 12,
  },
  spacerLg: {
    height: 24,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginVertical: 10,
  },

  // ─── Estilos específicos para los contratos / pagarés ────────────────────

  // Caja "BUENO POR" arriba a la derecha del pagaré
  buenoPorBox: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 160,
    borderWidth: 1,
    borderColor: COLORS.black,
    padding: 6,
  },
  buenoPorLabel: {
    fontSize: FONT_SIZES.small,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  buenoPorAmount: {
    fontSize: FONT_SIZES.header,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 4,
  },

  // Texto en mayúsculas y justificado (las plantillas usan mucho)
  upper: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    textAlign: 'justify',
    marginBottom: 6,
  },

  // Cláusula numerada
  clausulaTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: FONT_SIZES.body,
    marginTop: 8,
    marginBottom: 2,
  },

  // ─── Estilos del control de pagos (landscape) ────────────────────────────

  pageLandscape: {
    paddingTop: 30,
    paddingBottom: 30,
    paddingLeft: 24,
    paddingRight: 24,
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    fontFamily: 'Helvetica',
  },

  controlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  controlHeaderCol: {
    fontSize: FONT_SIZES.body,
  },
  controlBanner: {
    backgroundColor: '#FEF3C7', // amarillo
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginVertical: 6,
    fontSize: FONT_SIZES.body,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  controlNoteWarn: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 6,
    fontSize: FONT_SIZES.small,
    color: '#92400E',
  },
  controlNoteDanger: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 4,
    fontSize: FONT_SIZES.small,
    color: '#991B1B',
    fontFamily: 'Helvetica-Bold',
  },
  controlFooter: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textPrimary,
    marginTop: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },

  // Tabla del control: celdas más compactas
  controlTable: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.black,
    marginTop: 4,
  },
  controlRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.black,
    minHeight: 18,
  },
  controlRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.black,
    minHeight: 22,
  },
  controlCell: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    fontSize: 8,
    borderRightWidth: 0.5,
    borderRightColor: COLORS.black,
    justifyContent: 'center',
  },
  controlCellHeader: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    borderRightWidth: 0.5,
    borderRightColor: COLORS.black,
    textAlign: 'center',
    justifyContent: 'center',
  },
})
