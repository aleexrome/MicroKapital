import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getReporteEjecutivoSemanal } from '@/lib/reportes/ejecutivo'
import { ReporteEjecutivoPDF } from '@/lib/reportes/pdf/ReporteEjecutivoPDF'

// Subimos el límite de la lambda a 60s. Default de Vercel para serverless
// functions es 10s — con getReporteEjecutivoSemanal + renderToBuffer PDF
// la petición solía tronar con 504 "Gateway Timeout" y Safari mostraba
// "The string did not match the expected pattern" al intentar leer como
// JSON la página HTML de error de Vercel.
export const maxDuration = 60

const EMAIL_AUTORIZADO = 'alejandro.romero@microkapital.com'

/**
 * GET /api/reportes/ejecutivo/pdf?branchId=xxx
 *
 * Devuelve el PDF del reporte ejecutivo semanal de UNA sucursal.
 * Mismos datos que la vista en pantalla — fuente única de verdad en
 * getReporteEjecutivoSemanal().
 *
 * Acceso restringido al Director de Sistemas (y SUPER_ADMIN).
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (session.user.email !== EMAIL_AUTORIZADO && session.user.rol !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const branchId = searchParams.get('branchId')
  if (!branchId) {
    return NextResponse.json({ error: 'Falta branchId' }, { status: 400 })
  }

  // Pasar branchId filtra todas las queries pesadas a esa sucursal (antes
  // calculaba TODAS las sucursales de la empresa aunque se pidiera solo una)
  // — baja el tiempo de ~5-10s a ~1s.
  const [data, empresa] = await Promise.all([
    getReporteEjecutivoSemanal(session.user.companyId!, branchId),
    prisma.company.findUnique({
      where:  { id: session.user.companyId! },
      select: { nombre: true },
    }),
  ])

  const sucursal = data.sucursales.find((s) => s.branchId === branchId)
  if (!sucursal) {
    return NextResponse.json({ error: 'Sucursal no encontrada o sin datos' }, { status: 404 })
  }

  const pdfBuffer = await renderToBuffer(
    <ReporteEjecutivoPDF
      sucursal={sucursal}
      empresa={empresa?.nombre ?? 'MicroKapital'}
      semanaInicio={data.semanaInicio.toISOString()}
      semanaFin={data.semanaFin.toISOString()}
    />,
  )

  const safeName = sucursal.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
  const semanaTag = data.semanaInicio.toISOString().slice(0, 10)

  // Buffer (Node) → Uint8Array para que NextResponse lo acepte como BodyInit en TS estricto.
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="reporte-ejecutivo_${safeName}_${semanaTag}.pdf"`,
      'Cache-Control':       'no-store',
    },
  })
}
