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
    paddingTop:    PAGE_MARGIN + 60,  // espacio para el header fixed
    paddingBottom: PAGE_MARGIN + 50,  // espacio para el footer fixed
    paddingLeft:   PAGE_MARGIN,
    paddingRight:  PAGE_MARGIN,
    fontSize:      FONT_SIZES.body,
    color:         COLORS.textPrimary,
    fontFamily:    'Helvetica',
    lineHeight:    1.5,
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
    width:  90,
    height: 36,
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

  // Tipografía
  title: {
    fontSize:   FONT_SIZES.title,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.black,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize:   FONT_SIZES.header,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.black,
    marginTop:    14,
    marginBottom: 6,
  },
  subTitle: {
    fontSize:   FONT_SIZES.subHeader,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.black,
    marginTop:    10,
    marginBottom: 4,
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
})
