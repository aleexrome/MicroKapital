import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/reportes/tiempo-real/pagos?desde=ISO&hasta=ISO
 *
 * Lista los pagos (no cancelados) capturados entre `desde` y `hasta`
 * para la empresa del usuario. Se usa en /reportes/tiempo-real al
 * expandir una fila de "Evolución de la mora" para ver qué entró en
 * ese corte horario.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rolesPermitidos = ['SUPER_ADMIN', 'DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'MESA_CONTROL', 'GERENTE_ZONAL']
  if (!rolesPermitidos.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Rol sin acceso' }, { status: 403 })
  }

  const desde = req.nextUrl.searchParams.get('desde')
  const hasta = req.nextUrl.searchParams.get('hasta')
  if (!desde || !hasta) {
    return NextResponse.json({ error: 'Faltan desde / hasta (ISO)' }, { status: 400 })
  }
  const desdeDate = new Date(desde)
  const hastaDate = new Date(hasta)
  if (isNaN(desdeDate.getTime()) || isNaN(hastaDate.getTime())) {
    return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
  }

  const pagos = await prisma.payment.findMany({
    where: {
      canceledAt: null,
      fechaHora:  { gt: desdeDate, lte: hastaDate },
      loan: { companyId: session.user.companyId },
    },
    select: {
      id: true,
      monto: true,
      metodoPago: true,
      fechaHora: true,
      statusTransferencia: true,
      cobrador: { select: { nombre: true } },
      client:   { select: { nombreCompleto: true } },
      loan:     { select: { tipo: true, branch: { select: { nombre: true } } } },
    },
    orderBy: { fechaHora: 'asc' },
  })

  return NextResponse.json({
    desde:  desdeDate.toISOString(),
    hasta:  hastaDate.toISOString(),
    total:  pagos.reduce((s, p) => s + Number(p.monto), 0),
    count:  pagos.length,
    pagos:  pagos.map((p) => ({
      id:          p.id,
      fechaHora:   p.fechaHora.toISOString(),
      monto:       Number(p.monto),
      metodoPago:  p.metodoPago,
      statusTransferencia: p.statusTransferencia,
      cliente:     p.client.nombreCompleto,
      cobrador:    p.cobrador.nombre,
      sucursal:    p.loan.branch.nombre,
      tipo:        p.loan.tipo,
    })),
  })
}
