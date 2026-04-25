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

  const { companyId } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })
  if (!cobrador) redirect('/login')

  const selectedDate = parseFecha(searchParams.fecha)
  const fechaStr = toYMD(selectedDate)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isToday = selectedDate.getTime() === today.getTime()
  const todayStr = toYMD(today)

  const nextDay = new Date(selectedDate)
  nextDay.setDate(nextDay.getDate() + 1)

  // Caja del día seleccionado. Si es hoy y no existe, la creamos.
  // Para días pasados no creamos nada — si no hay caja, mostramos vacío.
  let caja = await prisma.cashRegister.findFirst({
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

  // Pagos del día seleccionado, con desglose por método de pago
  const pagosDia = await prisma.payment.findMany({
    where: {
      cobradorId: cobrador.id,
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
      loan: { select: { tipo: true } },
    },
    orderBy: { fechaHora: 'desc' },
  })

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
          <p className="text-muted-foreground">{formatDate(selectedDate, "EEEE d 'de' MMMM, yyyy")}</p>
        </div>
        <AgendaDatePicker fecha={fechaStr} baseHref="/caja" maxDate={todayStr} />
      </div>

      {/* Botón imprimir corte */}
      <div className="flex justify-end">
        <Button asChild>
          <Link href={`/caja/imprimir?fecha=${fechaStr}`}>
            <Printer className="h-4 w-4" /> Imprimir corte
          </Link>
        </Button>
      </div>

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

      {/* Lista de pagos del día */}
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
    </div>
  )
}
