import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoney, formatDate } from '@/lib/utils'

export default async function CajaHistorialPage() {
  const session = await getSession()
  if (!session?.user) return null

  const { companyId } = session.user

  const cobrador = await prisma.user.findFirst({
    where: { companyId: companyId!, email: session.user.email! },
  })

  const registros = await prisma.cashRegister.findMany({
    where: cobrador ? { cobradorId: cobrador.id } : {},
    orderBy: { fecha: 'desc' },
    take: 30,
  })

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Historial de caja</h1>

      <Card>
        <CardContent className="p-0">
          {registros.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Sin registros de caja</div>
          ) : (
            <div className="divide-y">
              {registros.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium">{formatDate(r.fecha)}</p>
                    <p className="text-sm text-muted-foreground">
                      Efectivo: {formatMoney(Number(r.cobradoEfectivo))} ·
                      Tarjeta: {formatMoney(Number(r.cobradoTarjeta))} ·
                      Cambio: {formatMoney(Number(r.cambioEntregado))}
                    </p>
                    {r.diferencia !== null && (
                      <p className={`text-xs ${Number(r.diferencia) !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                        Diferencia: {formatMoney(Number(r.diferencia))}
                      </p>
                    )}
                  </div>
                  <Badge variant={r.estado === 'CLOSED' ? 'secondary' : 'success'}>
                    {r.estado === 'CLOSED' ? 'Cerrada' : 'Abierta'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
