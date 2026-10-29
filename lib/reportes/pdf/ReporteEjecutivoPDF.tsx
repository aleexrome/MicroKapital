import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import type { SucursalEjecutivo, CoordinadorEjecutivo } from '@/lib/reportes/ejecutivo'

const LOGO_URL =
  'https://res.cloudinary.com/djs8dtzrq/image/upload/v1777329446/PHOTO-2026-04-27-16-21-06-removebg-preview_fczmpb.png'

const COLORS = {
  text:        '#0A0A0A',
  muted:       '#6B7280',
  border:      '#E5E7EB',
  borderSoft:  '#F3F4F6',
  verde:       '#059669',
  verdeBg:     '#D1FAE5',
  amarillo:    '#B45309',
  amarilloBg:  '#FEF3C7',
  rojo:        '#B91C1C',
  rojoBg:      '#FEE2E2',
  azulAccent:  '#1E40AF',
  azulBg:      '#DBEAFE',
}

const COLOR_META: Record<CoordinadorEjecutivo['color'], { fg: string; bg: string; label: string }> = {
  verde:    { fg: COLORS.verde,    bg: COLORS.verdeBg,    label: 'Bueno' },
  amarillo: { fg: COLORS.amarillo, bg: COLORS.amarilloBg, label: 'Medio' },
  rojo:     { fg: COLORS.rojo,     bg: COLORS.rojoBg,     label: 'Bajo'  },
}

const ROL_LABEL: Record<string, string> = {
  COORDINADOR:   'Coord',
  COBRADOR:      'Cobradora',
  GERENTE:       'Gerente',
  GERENTE_ZONAL: 'GZ',
}

const styles = StyleSheet.create({
  page: {
    paddingTop:    110,
    paddingBottom: 50,
    paddingLeft:   36,
    paddingRight:  36,
    fontSize:      9,
    color:         COLORS.text,
    fontFamily:    'Helvetica',
    lineHeight:    1.3,
  },
  header: {
    position:         'absolute',
    top:              30,
    left:             36,
    right:            36,
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingBottom:    8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft:  { flexDirection: 'column' },
  empresaName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: COLORS.text },
  reporteName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: COLORS.azulAccent, marginTop: 2 },
  semanaInfo:  { fontSize: 9,  color: COLORS.muted, marginTop: 2 },
  headerLogo:  { width: 110, height: 55, objectFit: 'contain' },
  footer: {
    position:          'absolute',
    bottom:            30,
    left:              36,
    right:             36,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingTop:        6,
    borderTopWidth:    1,
    borderTopColor:    COLORS.border,
    fontSize:          8,
    color:             COLORS.muted,
  },

  // Sucursal info
  sucursalBlock: {
    marginBottom: 12,
    padding:      10,
    borderWidth:  1,
    borderColor:  COLORS.border,
    borderRadius: 4,
    backgroundColor: '#FAFAFA',
  },
  sucursalName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: COLORS.text },
  sucursalMeta: { fontSize: 9,  color: COLORS.muted, marginTop: 2 },

  // Totales grid
  totalesGrid:  { flexDirection: 'row', gap: 10, marginTop: 10 },
  totalesCard:  {
    flex:            1,
    padding:         8,
    borderRadius:    4,
    borderWidth:     1,
    borderColor:     COLORS.border,
    backgroundColor: COLORS.borderSoft,
  },
  totalesTitle: { fontSize: 8, color: COLORS.muted, textTransform: 'uppercase', marginBottom: 2 },
  totalesVal:   { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  totalesSub:   { fontSize: 8, color: COLORS.muted, marginTop: 1 },
  totalesPct:   { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 4 },

  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6, color: COLORS.text },

  // Tabla coordinadores
  table:        { borderWidth: 1, borderColor: COLORS.border, borderRadius: 3 },
  tr:           { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  trHead:       { backgroundColor: COLORS.borderSoft, fontFamily: 'Helvetica-Bold' },
  th:           { padding: 5, fontSize: 8 },
  td:           { padding: 5, fontSize: 8 },
  colNombre:    { flex: 3 },
  colMoney:     { flex: 2, textAlign: 'right' },
  colPct:       { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  colBadge:     { flex: 1.2, textAlign: 'center' },

  // Badges
  badge:        { fontSize: 8, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, alignSelf: 'center' },

  // Detalle de pagos pendientes
  detalleBlock: { marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 3, padding: 6 },
  detalleHead:  { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  pendienteRow: {
    flexDirection:    'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderSoft,
    paddingVertical:   2,
  },
  pendienteCell: { fontSize: 8 },
  leyenda:       { marginTop: 10, fontSize: 8, color: COLORS.muted, flexDirection: 'row', alignItems: 'center' },
  swatch:        { width: 7, height: 7, borderRadius: 2, marginRight: 3 },
})

function money(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(pct: number, hayMeta: boolean) {
  return hayMeta ? `${pct}%` : '—'
}

function pctColor(pct: number): string {
  if (pct >= 85) return COLORS.verde
  if (pct >= 60) return COLORS.amarillo
  return COLORS.rojo
}

interface Props {
  sucursal:      SucursalEjecutivo
  empresa:       string
  semanaInicio:  string  // ISO
  semanaFin:     string  // ISO
}

export function ReporteEjecutivoPDF({ sucursal, empresa, semanaInicio, semanaFin }: Props) {
  const fechaInicio = new Date(semanaInicio).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  const fechaFin    = new Date(semanaFin).toLocaleDateString('es-MX',    { day: '2-digit', month: 'short', year: 'numeric' })
  const generadoEn  = new Date().toLocaleString('es-MX')
  const semanaRange = `Semana del ${fechaInicio} al ${fechaFin}`

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header fijo */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            <Text style={styles.empresaName}>{empresa.toUpperCase()}</Text>
            <Text style={styles.reporteName}>Reporte ejecutivo semanal — {sucursal.nombre}</Text>
            <Text style={styles.semanaInfo}>{semanaRange}</Text>
          </View>
          <Image src={LOGO_URL} style={styles.headerLogo} />
        </View>

        {/* Footer fijo */}
        <View style={styles.footer} fixed>
          <Text>Generado: {generadoEn}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
          <Text>{empresa}</Text>
        </View>

        {/* Datos de la sucursal */}
        <View style={styles.sucursalBlock}>
          <Text style={styles.sucursalName}>{sucursal.nombre}</Text>
          <View style={{ flexDirection: 'row', gap: 20, marginTop: 4 }}>
            {sucursal.concentradoraNombre && (
              <Text style={styles.sucursalMeta}>Concentradora: {sucursal.concentradoraNombre}</Text>
            )}
            {sucursal.gerenteZonalNombre && (
              <Text style={styles.sucursalMeta}>GZ: {sucursal.gerenteZonalNombre}</Text>
            )}
            <Text style={styles.sucursalMeta}>Coordinadores activos: {sucursal.coordinadores.length}</Text>
          </View>

          <View style={styles.totalesGrid}>
            <View style={styles.totalesCard}>
              <Text style={styles.totalesTitle}>Colocación</Text>
              <Text style={styles.totalesVal}>{money(sucursal.colocacionTotal)}</Text>
              <Text style={styles.totalesSub}>Meta: {money(sucursal.metaColocacionTotal)}</Text>
              <Text style={[styles.totalesPct, { color: pctColor(sucursal.colocacionPct) }]}>
                {fmtPct(sucursal.colocacionPct, sucursal.metaColocacionTotal > 0)}
              </Text>
            </View>
            <View style={styles.totalesCard}>
              <Text style={styles.totalesTitle}>Cobranza</Text>
              <Text style={styles.totalesVal}>{money(sucursal.recuperadoTotal)}</Text>
              <Text style={styles.totalesSub}>Pactado: {money(sucursal.pactadoTotal)}</Text>
              <Text style={[styles.totalesPct, { color: pctColor(sucursal.cobranzaPct) }]}>
                {fmtPct(sucursal.cobranzaPct, sucursal.pactadoTotal > 0)}
              </Text>
            </View>
            <View style={styles.totalesCard}>
              <Text style={styles.totalesTitle}>Pendiente de recuperar</Text>
              <Text style={[styles.totalesVal, { color: COLORS.rojo }]}>{money(sucursal.pagosPendientesTotal)}</Text>
              <Text style={styles.totalesSub}>
                {sucursal.coordinadores.reduce((n, c) => n + c.pagosPendientes.length, 0)} pagos sueltos
              </Text>
            </View>
          </View>
        </View>

        {sucursal.coordinadores.length === 0 && (
          <Text style={{ fontSize: 10, color: COLORS.muted, textAlign: 'center', marginTop: 20 }}>
            Sin coordinadores con actividad esta semana.
          </Text>
        )}

        {sucursal.coordinadores.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Coordinadores (mejor → peor)</Text>
            <View style={styles.table}>
              <View style={[styles.tr, styles.trHead]}>
                <Text style={[styles.th, styles.colNombre]}>Coordinador</Text>
                <Text style={[styles.th, styles.colMoney]}>Meta Coloc.</Text>
                <Text style={[styles.th, styles.colMoney]}>Coloc. Real</Text>
                <Text style={[styles.th, styles.colPct]}>%</Text>
                <Text style={[styles.th, styles.colMoney]}>Pactado</Text>
                <Text style={[styles.th, styles.colMoney]}>Recuperado</Text>
                <Text style={[styles.th, styles.colPct]}>%</Text>
                <Text style={[styles.th, styles.colBadge]}>Score</Text>
              </View>
              {sucursal.coordinadores.map((c) => {
                const meta = COLOR_META[c.color]
                return (
                  <View key={c.cobradorId} style={styles.tr} wrap={false}>
                    <View style={[styles.td, styles.colNombre]}>
                      <Text style={{ fontFamily: 'Helvetica-Bold' }}>{c.nombre}</Text>
                      <Text style={{ fontSize: 7, color: COLORS.muted }}>{ROL_LABEL[c.rol] ?? c.rol}</Text>
                    </View>
                    <Text style={[styles.td, styles.colMoney]}>{money(c.metaColocacion)}</Text>
                    <Text style={[styles.td, styles.colMoney]}>{money(c.colocacionReal)}</Text>
                    <Text style={[styles.td, styles.colPct, { color: pctColor(c.colocacionPct) }]}>
                      {fmtPct(c.colocacionPct, c.metaColocacion > 0)}
                    </Text>
                    <Text style={[styles.td, styles.colMoney]}>{money(c.pactado)}</Text>
                    <Text style={[styles.td, styles.colMoney]}>{money(c.recuperado)}</Text>
                    <Text style={[styles.td, styles.colPct, { color: pctColor(c.cobranzaPct) }]}>
                      {fmtPct(c.cobranzaPct, c.pactado > 0)}
                    </Text>
                    <View style={[styles.td, styles.colBadge]}>
                      <Text style={[styles.badge, { backgroundColor: meta.bg, color: meta.fg }]}>
                        {meta.label} {c.score}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>

            {/* Leyenda de colores */}
            <View style={styles.leyenda}>
              <View style={[styles.swatch, { backgroundColor: COLORS.verdeBg }]} />
              <Text style={{ marginRight: 10 }}>Bueno (≥85)</Text>
              <View style={[styles.swatch, { backgroundColor: COLORS.amarilloBg }]} />
              <Text style={{ marginRight: 10 }}>Medio (60-84)</Text>
              <View style={[styles.swatch, { backgroundColor: COLORS.rojoBg }]} />
              <Text>Bajo (&lt;60)</Text>
            </View>

            {/* Detalle de pagos pendientes por coordinador */}
            {sucursal.coordinadores.filter((c) => c.pagosPendientes.length > 0).length > 0 && (
              <>
                <Text style={styles.sectionTitle} break>Pagos pendientes de recuperar esta semana</Text>
                {sucursal.coordinadores
                  .filter((c) => c.pagosPendientes.length > 0)
                  .map((c) => (
                    <View key={c.cobradorId} style={styles.detalleBlock} wrap={false}>
                      <Text style={styles.detalleHead}>
                        {c.nombre}  —  {c.pagosPendientes.length} pagos  —  {money(c.pagosPendientesTotal)}
                      </Text>
                      <View style={[styles.pendienteRow, { fontFamily: 'Helvetica-Bold' }]}>
                        <Text style={[styles.pendienteCell, { flex: 3 }]}>Cliente</Text>
                        <Text style={[styles.pendienteCell, { flex: 1 }]}>Pago</Text>
                        <Text style={[styles.pendienteCell, { flex: 1.5 }]}>Vence</Text>
                        <Text style={[styles.pendienteCell, { flex: 1.5, textAlign: 'right' }]}>Esperado</Text>
                        <Text style={[styles.pendienteCell, { flex: 1.5, textAlign: 'right' }]}>Pagado</Text>
                        <Text style={[styles.pendienteCell, { flex: 1.5, textAlign: 'right', color: COLORS.rojo }]}>Pendiente</Text>
                      </View>
                      {c.pagosPendientes.map((p) => (
                        <View key={p.scheduleId} style={styles.pendienteRow}>
                          <Text style={[styles.pendienteCell, { flex: 3 }]}>{p.clienteNombre}</Text>
                          <Text style={[styles.pendienteCell, { flex: 1 }]}>#{p.numeroPago}</Text>
                          <Text style={[styles.pendienteCell, { flex: 1.5 }]}>
                            {new Date(p.fechaVencimiento).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit' })}
                          </Text>
                          <Text style={[styles.pendienteCell, { flex: 1.5, textAlign: 'right' }]}>{money(p.montoEsperado)}</Text>
                          <Text style={[styles.pendienteCell, { flex: 1.5, textAlign: 'right' }]}>{money(p.montoPagado)}</Text>
                          <Text style={[styles.pendienteCell, { flex: 1.5, textAlign: 'right', color: COLORS.rojo, fontFamily: 'Helvetica-Bold' }]}>
                            {money(p.pendiente)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
              </>
            )}
          </>
        )}
      </Page>
    </Document>
  )
}
