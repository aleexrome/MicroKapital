import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wallet, TrendingUp, CreditCard, Banknote, Printer, Clock } from 'lucide-react'
import { AgendaDatePicker } from '@/components/cobros/AgendaDatePicker'

function toYMD(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseFecha(dateStr?: string): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return today
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  // No permitir fechas futuras — el corte solo aplica a hoy o días pasados.
  return date > today ? today : date
}

export default async function CajaPage({
  searchParams,
}: {
  searchParams: { fecha?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { companyId, rol } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
    include: { branch: { select: { nombre: true } } },
  })
  if (!cobrador) redirect('/login')

  // Directores y super admin ven el corte de TODA la empresa.
  // Trabajadores (cobrador/coordinador/gerente) ven su corte personal.
  const isDirectorView = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'

  const selectedDate = parseFecha(searchParams.fecha)
  const fechaStr = toYMD(selectedDate)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isToday = selectedDate.getTime() === today.getTime()
  const todayStr = toYMD(today)

  const nextDay = new Date(selectedDate)
  nextDay.setDate(nextDay.getDate() + 1)

  // Caja del día: solo aplica para trabajadores. Los directores no tienen caja
  // personal porque no cobran directamente.
  let caja: { estado: string; cobradoEfectivo: unknown; cobradoTarjeta: unknown; cambioEntregado: unknown } | null = null
  if (!isDirectorView) {
    caja = await prisma.cashRegister.findFirst({
      where: { cobradorId: cobrador.id, fecha: selectedDate },
    })

    if (!caja && isToday) {
      let branchId = cobrador.branchId
      if (!branchId) {
        const branch = await prisma.branch.findFirst({ where: { companyId: companyId! } })
        if (!branch) redirect('/dashboard')
        branchId = branch.id
      }

      caja = await prisma.cashRegister.create({
        data: {
          cobradorId: cobrador.id,
          branchId,
          fecha: today,
          estado: 'OPEN',
        },
      })
    }
  }

  // Pagos del día seleccionado, con desglose por método de pago.
  // Director/SuperAdmin: todos los cobros de la empresa. Trabajador: solo los suyos.
  const pagosDia = await prisma.payment.findMany({
    where: {
      ...(isDirectorView
        ? { loan: { companyId: companyId! } }
        : { cobradorId: cobrador.id }),
      fechaHora: { gte: selectedDate, lt: nextDay },
    },
    select: {
      id: true,
      monto: true,
      metodoPago: true,
      statusTransferencia: true,
      fechaHora: true,
      cambioEntregado: true,
      client: { select: { nombreCompleto: true } },
      loan: {
        select: {
          tipo: true,
          branch: { select: { id: true, nombre: true } },
        },
      },
      cobrador: { select: { id: true, nombre: true } },
    },
    orderBy: { fechaHora: 'desc' },
  })

  // Para directores: agrupar por sucursal → cobrador para mostrar desglose detallado.
  type PagoRow = (typeof pagosDia)[number]
  const branchMap: Record<string, {
    branchNombre: string
    cobradores: Record<string, {
      cobradorNombre: string
      pagos: PagoRow[]
      efectivo: number
      tarjeta: number
      transferencia: number
      enValidacion: number
      cambio: number
      total: number
    }>
  }> = {}

  if (isDirectorView) {
    for (const p of pagosDia) {
      const bId = p.loan.branch.id
      const cId = p.cobrador.id
      if (!branchMap[bId]) {
        branchMap[bId] = { branchNombre: p.loan.branch.nombre, cobradores: {} }
      }
      if (!branchMap[bId].cobradores[cId]) {
        branchMap[bId].cobradores[cId] = {
          cobradorNombre: p.cobrador.nombre,
          pagos: [],
          efectivo: 0, tarjeta: 0, transferencia: 0, enValidacion: 0, cambio: 0, total: 0,
        }
      }
      const cell = branchMap[bId].cobradores[cId]
      cell.pagos.push(p)
      const m = Number(p.monto)
      const cambio = Number(p.cambioEntregado)
      cell.cambio += cambio
      if (p.metodoPago === 'CASH') { cell.efectivo += m; cell.total += m }
      else if (p.metodoPago === 'CARD') { cell.tarjeta += m; cell.total += m }
      else if (p.metodoPago === 'TRANSFER') {
        if (p.statusTransferencia === 'PENDIENTE') cell.enValidacion += m
        else { cell.transferencia += m; cell.total += m }
      }
    }
  }

  // Totales por método (basados en los Payment registrados, no en CashRegister,
  // para mostrar también lo que CashRegister no incluye, p.ej. transferencias).
  const totalEfectivo = pagosDia
    .filter((p) => p.metodoPago === 'CASH')
    .reduce((sum, p) => sum + Number(p.monto), 0)
  const totalTarjeta = pagosDia
    .filter((p) => p.metodoPago === 'CARD')
    .reduce((sum, p) => sum + Number(p.monto), 0)
  const totalTransferenciaVerificada = pagosDia
    .filter((p) => p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'VERIFICADO')
    .reduce((sum, p) => sum + Number(p.monto), 0)
  const totalTransferenciaEnValidacion = pagosDia
    .filter((p) => p.metodoPago === 'TRANSFER' && p.statusTransferencia === 'PENDIENTE')
    .reduce((sum, p) => sum + Number(p.monto), 0)
  const totalCambio = pagosDia.reduce((sum, p) => sum + Number(p.cambioEntregado), 0)
  // El cambio entregado se repone con el mismo billete del cliente, así que NO
  // se resta del total. Se muestra solo informativo.
  const totalGeneral = totalEfectivo + totalTarjeta + totalTransferenciaVerificada

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Corte del Día</h1>
          <p className="text-muted-foreground">
            {formatDate(selectedDate, "EEEE d 'de' MMMM, yyyy")}
            {isDirectorView && ' · Empresa completa'}
          </p>
        </div>
        <AgendaDatePicker fecha={fechaStr} baseHref="/caja" maxDate={todayStr} />
      </div>

      {/* Botón imprimir corte — solo trabajadores (su corte personal). El corte
          del director es de toda la empresa y se imprime distinto (TODO PR-B). */}
      {!isDirectorView && (
        <div className="flex justify-end">
          <Button asChild>
            <Link href={`/caja/imprimir?fecha=${fechaStr}`}>
              <Printer className="h-4 w-4" /> Imprimir corte
            </Link>
          </Button>
        </div>
      )}

      {/* Estado de la caja */}
      <div className="grid grid-cols-2 gap-4">
        {caja && (
          <Card className="col-span-2">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary-700" />
                <span className="font-medium">Estado de caja</span>
              </div>
              <Badge variant={caja.estado === 'OPEN' ? 'success' : 'secondary'}>
                {caja.estado === 'OPEN' ? 'Abierta' : 'Cerrada'}
              </Badge>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Efectivo</span>
            </div>
            <p className="text-xl font-bold text-green-700 money">{formatMoney(totalEfectivo)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Tarjeta</span>
            </div>
            <p className="text-xl font-bold text-blue-700 money">{formatMoney(totalTarjeta)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">Transferencia (verificada)</span>
            </div>
            <p className="text-xl font-bold text-purple-700 money">{formatMoney(totalTransferenciaVerificada)}</p>
            {totalTransferenciaEnValidacion > 0 && (
              <p className="text-[11px] text-yellow-600 mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" /> + {formatMoney(totalTransferenciaEnValidacion)} en validación
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground">Cambio entregado</span>
            <p className="text-xl font-bold text-gray-700 money">{formatMoney(totalCambio)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Informativo · no afecta el corte</p>
          </CardContent>
        </Card>

        <Card className="bg-primary-50 col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary-700" />
              <span className="text-xs text-primary-600 font-medium">Total cobrado del día</span>
            </div>
            <p className="text-2xl font-bold text-primary-800 money">{formatMoney(totalGeneral)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Vista Director: desglose por sucursal → empleado */}
      {isDirectorView ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Desglose por sucursal y empleado</h2>
          {Object.keys(branchMap).length === 0 ? (
            <Card>
              <CardContent className="text-sm text-muted-foreground text-center py-6">
                Sin cobros registrados en la empresa este día
              </CardContent>
            </Card>
          ) : (
            Object.entries(branchMap).map(([bId, branch]) => {
              const bTotals = Object.values(branch.cobradores).reduce(
                (acc, c) => ({
                  efectivo:      acc.efectivo + c.efectivo,
                  tarjeta:       acc.tarjeta + c.tarjeta,
                  transferencia: acc.transferencia + c.transferencia,
                  enValidacion:  acc.enValidacion + c.enValidacion,
                  cambio:        acc.cambio + c.cambio,
                  total:         acc.total + c.total,
                }),
                { efectivo: 0, tarjeta: 0, transferencia: 0, enValidacion: 0, cambio: 0, total: 0 },
              )
              return (
                <Card key={bId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                      <span>🏢 {branch.branchNombre}</span>
                      <span className="text-base font-bold text-primary-700 money">{formatMoney(bTotals.total)}</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      💵 {formatMoney(bTotals.efectivo)} · 💳 {formatMoney(bTotals.tarjeta)} · 🏦 {formatMoney(bTotals.transferencia)}
                      {bTotals.enValidacion > 0 && ` · ⏱ ${formatMoney(bTotals.enValidacion)} en validación`}
                      {bTotals.cambio > 0 && ` · cambio ${formatMoney(bTotals.cambio)}`}
                    </p>
                  </CardHeader>
                  <CardContent className="divide-y px-4 pb-4">
                    {Object.entries(branch.cobradores)
                      .sort((a, b) => a[1].cobradorNombre.localeCompare(b[1].cobradorNombre))
                      .map(([cId, cob]) => (
                        <div key={cId} className="py-3 first:pt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{cob.cobradorNombre}</span>
                            <span className="font-semibold money">{formatMoney(cob.total)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {cob.pagos.length} cobros · 💵 {formatMoney(cob.efectivo)} · 💳 {formatMoney(cob.tarjeta)} · 🏦 {formatMoney(cob.transferencia)}
                            {cob.enValidacion > 0 && ` · ⏱ ${formatMoney(cob.enValidacion)} en validación`}
                            {cob.cambio > 0 && ` · cambio ${formatMoney(cob.cambio)}`}
                          </p>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      ) : (
        /* Vista trabajador: lista plana de sus cobros */
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cobros del día ({pagosDia.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {pagosDia.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin cobros registrados</p>
            ) : (
              <div className="divide-y">
                {pagosDia.map((pago) => {
                  const enValidacion = pago.metodoPago === 'TRANSFER' && pago.statusTransferencia === 'PENDIENTE'
                  return (
                    <div key={pago.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{pago.client.nombreCompleto}</p>
                        <p className="text-xs text-muted-foreground">
                          {pago.loan.tipo} ·{' '}
                          {pago.metodoPago === 'CASH' ? '💵 Efectivo' : pago.metodoPago === 'CARD' ? '💳 Tarjeta' : '🏦 Transferencia'} ·{' '}
                          {new Date(pago.fechaHora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          {enValidacion && ' · en validación'}
                        </p>
                      </div>
                      <span className={`font-semibold money ${enValidacion ? 'text-yellow-600' : 'text-gray-900'}`}>
                        {formatMoney(Number(pago.monto))}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
