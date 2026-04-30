import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, TrendingUp, CreditCard, Banknote, Printer, Clock } from 'lucide-react'
import { AgendaDatePicker } from '@/components/cobros/AgendaDatePicker'
import { todayMx, parseMxYMD, toMxYMD } from '@/lib/timezone'

function parseFecha(dateStr?: string): Date {
  const today = todayMx()
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return today
  const date = parseMxYMD(dateStr)
  return date > today ? today : date
}

export default async function CajaCobradorDetallePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { fecha?: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { companyId, rol, branchId: viewerBranchId } = session.user

  // Validar alcance: solo gerentes y directores pueden ver corte ajeno.
  const isDirector = rol === 'DIRECTOR_GENERAL' || rol === 'DIRECTOR_COMERCIAL' || rol === 'SUPER_ADMIN'
  const isGerente  = rol === 'GERENTE' || rol === 'GERENTE_ZONAL'
  if (!isDirector && !isGerente) redirect('/caja')

  // Cargar cobrador objetivo
  const cobradorTarget = await prisma.user.findFirst({
    where: { id: params.id, companyId: companyId! },
    include: {
      branch: { select: { id: true, nombre: true } },
      company: { select: { nombre: true } },
    },
  })
  if (!cobradorTarget) notFound()

  // Verificar scope: si gerente, el cobrador debe estar en su sucursal
  if (isGerente && cobradorTarget.branchId !== viewerBranchId) {
    redirect('/caja')
  }

  const selectedDate = parseFecha(searchParams.fecha)
  const fechaStr = toMxYMD(selectedDate)
  const today = todayMx()
  const todayStr = toMxYMD(today)

  const nextDay = new Date(selectedDate)
  nextDay.setDate(nextDay.getDate() + 1)

  const pagosDia = await prisma.payment.findMany({
    where: {
      cobradorId: cobradorTarget.id,
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
  const totalGeneral = totalEfectivo + totalTarjeta + totalTransferenciaVerificada

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start gap-3 flex-wrap">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/caja?fecha=${fechaStr}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{cobradorTarget.nombre}</h1>
          <p className="text-muted-foreground">
            Corte del día · {cobradorTarget.branch?.nombre ?? 'Sin sucursal'} ·{' '}
            {formatDate(selectedDate, "EEEE d 'de' MMMM, yyyy")}
          </p>
        </div>
        <AgendaDatePicker fecha={fechaStr} baseHref={`/caja/cobrador/${cobradorTarget.id}`} maxDate={todayStr} />
      </div>

      {/* Botón imprimir corte de este cobrador */}
      <div className="flex justify-end">
        <Button asChild>
          <Link href={`/caja/imprimir?fecha=${fechaStr}&cobradorId=${cobradorTarget.id}`}>
            <Printer className="h-4 w-4" /> Imprimir corte
          </Link>
        </Button>
      </div>

      {/* Totales por método */}
      <div className="grid grid-cols-2 gap-4">
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
            <span className="text-xs text-muted-foreground">Transferencia (verificada)</span>
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

      {/* Lista de cobros del día */}
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
                        {Number(pago.cambioEntregado) > 0 && ` · cambio ${formatMoney(Number(pago.cambioEntregado))}`}
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
