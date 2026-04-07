import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatMoney, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wallet, TrendingUp, CreditCard, Banknote } from 'lucide-react'

export default async function CajaPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { companyId } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })
  if (!cobrador) redirect('/login')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Obtener o crear la caja del día
  let caja = await prisma.cashRegister.findFirst({
    where: { cobradorId: cobrador.id, fecha: today },
  })

  if (!caja) {
    // Si el usuario no tiene sucursal asignada (ej. GERENTE), usar la primera sucursal de la empresa
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

  // Pagos del día
  const pagosHoy = await prisma.payment.findMany({
    where: {
      cobradorId: cobrador.id,
      fechaHora: { gte: today },
    },
    include: {
      client: { select: { nombreCompleto: true } },
      loan: { select: { tipo: true } },
    },
    orderBy: { fechaHora: 'desc' },
  })

  const totalCobradoEfectivo = Number(caja.cobradoEfectivo)
  const totalCobradoTarjeta = Number(caja.cobradoTarjeta)
  const totalCambio = Number(caja.cambioEntregado)
  const efectivoNeto = totalCobradoEfectivo - totalCambio

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Corte del Día</h1>
        <p className="text-muted-foreground">{formatDate(today, "EEEE d 'de' MMMM, yyyy")}</p>
      </div>

      {/* Estado de la caja */}
      <div className="grid grid-cols-2 gap-4">
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

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Efectivo cobrado</span>
            </div>
            <p className="text-xl font-bold text-green-700 money">{formatMoney(totalCobradoEfectivo)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Tarjeta cobrado</span>
            </div>
            <p className="text-xl font-bold text-blue-700 money">{formatMoney(totalCobradoTarjeta)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground">Cambio entregado</span>
            <p className="text-xl font-bold text-orange-600 money">- {formatMoney(totalCambio)}</p>
          </CardContent>
        </Card>

        <Card className="bg-primary-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary-700" />
              <span className="text-xs text-primary-600 font-medium">Efectivo neto</span>
            </div>
            <p className="text-xl font-bold text-primary-800 money">{formatMoney(efectivoNeto)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de pagos del día */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobros del día ({pagosHoy.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pagosHoy.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin cobros registrados hoy</p>
          ) : (
            <div className="divide-y">
              {pagosHoy.map((pago) => (
                <div key={pago.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{pago.client.nombreCompleto}</p>
                    <p className="text-xs text-muted-foreground">
                      {pago.loan.tipo} ·{' '}
                      {pago.metodoPago === 'CASH' ? '💵 Efectivo' : '💳 Tarjeta'} ·{' '}
                      {new Date(pago.fechaHora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="font-semibold money text-gray-900">{formatMoney(Number(pago.monto))}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
