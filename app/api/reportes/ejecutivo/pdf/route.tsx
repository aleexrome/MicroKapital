import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getReporteEjecutivoSemanal } from '@/lib/reportes/ejecutivo'
import { ReporteEjecutivoPDF } from '@/lib/reportes/pdf/ReporteEjecutivoPDF'

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

  const [data, empresa] = await Promise.all([
    getReporteEjecutivoSemanal(session.user.companyId!),
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
