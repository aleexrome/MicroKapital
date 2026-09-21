import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import { formatMoney, formatDate } from '@/lib/utils'
import { PrintButton } from './PrintButton'

/**
 * Estado financiero imprimible de un grupo solidario — vista dedicada
 * para que Direccion pueda imprimir/entregar el desglose completo del
 * grupo. Solo DG / DC / SUPER_ADMIN.
 *
 * Se pinta como una hoja: header con la marca, datos del grupo, tabla
 * de integrantes con desglose (capital, comision, interes, total a
 * pagar, cobrado, saldo), fila de totales, y bloque final con las
 * cifras agregadas. Los botones de accion (imprimir / regresar) se
 * ocultan al imprimir con print:hidden, y el DashboardShell tambien
 * esconde su sidebar cuando el navegador entra en modo print.
 */
export default async function EstadoFinancieroGrupoPage({
  params,
}: {
  params: { groupId: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const { rol, companyId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL' && rol !== 'SUPER_ADMIN') {
    redirect(`/grupos/${params.groupId}`)
  }

  const grupo = await prisma.loanGroup.findFirst({
    where: {
      id: params.groupId,
      branch: { companyId: companyId! },
    },
    include: {
      branch:   { select: { nombre: true } },
      cobrador: { select: { nombre: true } },
      loans: {
        where: { tipo: 'SOLIDARIO' },
        orderBy: { createdAt: 'asc' },
        include: {
          client:   { select: { id: true, nombreCompleto: true } },
          schedule: { select: { montoPagado: true, estado: true } },
          // Renovaciones activas: para excluir loans del ciclo viejo.
          loanRenovado: {
            where: { estado: { in: ['PENDING_APPROVAL', 'APPROVED', 'IN_ACTIVATION', 'ACTIVE'] } },
            select: { id: true, estado: true },
          },
        },
      },
    },
  })
  if (!grupo) notFound()

  // Ciclo vigente — misma logica que en la pagina del grupo.
  const loansVigentes = grupo.loans.filter((loan) => {
    if (loan.estado !== 'ACTIVE' && loan.estado !== 'DEFAULTED') return false
    const tieneRenovacionActiva = loan.loanRenovado.some((r) => r.estado === 'ACTIVE')
    return !tieneRenovacionActiva
  })
  const loansParaMostrar = loansVigentes.length > 0 ? loansVigentes : grupo.loans

  // Filas de la tabla con el desglose por integrante.
  const filas = loansParaMostrar.map((l) => {
    const capital   = Number(l.capital)
    const comision  = Number(l.comision)
    const interes   = Number(l.interes)
    const totalPago = Number(l.totalPago)
    const cobrado   = l.schedule.reduce((s, sc) => s + Number(sc.montoPagado), 0)
    const saldo     = Math.max(0, totalPago - cobrado)
    return {
      nombre:   l.client.nombreCompleto,
      capital,
      comision,
      interes,
      totalPago,
      cobrado,
      saldo,
    }
  })

  // Totales.
  const tot = filas.reduce(
    (acc, f) => ({
      capital:   acc.capital   + f.capital,
      comision:  acc.comision  + f.comision,
      interes:   acc.interes   + f.interes,
      totalPago: acc.totalPago + f.totalPago,
      cobrado:   acc.cobrado   + f.cobrado,
      saldo:     acc.saldo     + f.saldo,
    }),
    { capital: 0, comision: 0, interes: 0, totalPago: 0, cobrado: 0, saldo: 0 },
  )
  const gananciaMK = tot.interes + tot.comision
  const pctCobrado = tot.totalPago > 0
    ? Math.round((tot.cobrado / tot.totalPago) * 100)
    : 0

  const fechaImpresion = new Date()

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto print:p-4 print:max-w-none">
      {/* Barra de acciones — no imprime */}
      <div className="mb-6 print:hidden flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Vista imprimible — genera con Ctrl/Cmd+P o el botón Imprimir.
        </p>
        <PrintButton backHref={`/grupos/${grupo.id}`} />
      </div>

      {/* Hoja imprimible */}
      <article className="bg-white text-gray-900 rounded-lg border border-gray-200 shadow-sm p-6 sm:p-8 print:border-0 print:shadow-none print:rounded-none">
        {/* Encabezado */}
        <header className="flex items-start justify-between gap-4 pb-4 border-b border-gray-300">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-700">
              MicroKapital
            </p>
            <h1 className="text-2xl font-bold mt-0.5">Estado financiero del grupo</h1>
            <p className="text-sm text-gray-600 mt-1">
              Ciclo vigente al {formatDate(fechaImpresion)}
            </p>
          </div>
          <div className="text-right text-xs text-gray-600 space-y-0.5">
            <p><span className="font-medium">Impreso:</span> {fechaImpresion.toLocaleString('es-MX')}</p>
            <p><span className="font-medium">Por:</span> {session.user.name}</p>
          </div>
        </header>

        {/* Datos del grupo */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pb-4 border-b border-gray-200">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Grupo</p>
            <p className="font-semibold">{grupo.nombre}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Sucursal</p>
            <p className="font-semibold">{grupo.branch.nombre}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Coordinador</p>
            <p className="font-semibold">{grupo.cobrador.nombre}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Integrantes</p>
            <p className="font-semibold">{loansParaMostrar.length}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Progreso cobranza</p>
            <p className="font-semibold">{pctCobrado}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Ganancia MK</p>
            <p className="font-semibold money">{formatMoney(gananciaMK)}</p>
          </div>
        </section>

        {/* Tabla de integrantes */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Desglose por integrante</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-600">
                  <th className="px-2 py-2 border-b border-gray-300 font-semibold">Cliente</th>
                  <th className="px-2 py-2 border-b border-gray-300 font-semibold text-right">Capital</th>
                  <th className="px-2 py-2 border-b border-gray-300 font-semibold text-right">Comisión</th>
                  <th className="px-2 py-2 border-b border-gray-300 font-semibold text-right">Interés</th>
                  <th className="px-2 py-2 border-b border-gray-300 font-semibold text-right">Total a pagar</th>
                  <th className="px-2 py-2 border-b border-gray-300 font-semibold text-right">Cobrado</th>
                  <th className="px-2 py-2 border-b border-gray-300 font-semibold text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="px-2 py-2">{f.nombre}</td>
                    <td className="px-2 py-2 text-right money">{formatMoney(f.capital)}</td>
                    <td className="px-2 py-2 text-right money">{formatMoney(f.comision)}</td>
                    <td className="px-2 py-2 text-right money">{formatMoney(f.interes)}</td>
                    <td className="px-2 py-2 text-right font-medium money">{formatMoney(f.totalPago)}</td>
                    <td className="px-2 py-2 text-right money text-emerald-700">{formatMoney(f.cobrado)}</td>
                    <td className="px-2 py-2 text-right money text-amber-700">{formatMoney(f.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-semibold text-sm">
                  <td className="px-2 py-2 border-t-2 border-gray-400">TOTAL GRUPO</td>
                  <td className="px-2 py-2 border-t-2 border-gray-400 text-right money">{formatMoney(tot.capital)}</td>
                  <td className="px-2 py-2 border-t-2 border-gray-400 text-right money">{formatMoney(tot.comision)}</td>
                  <td className="px-2 py-2 border-t-2 border-gray-400 text-right money">{formatMoney(tot.interes)}</td>
                  <td className="px-2 py-2 border-t-2 border-gray-400 text-right money">{formatMoney(tot.totalPago)}</td>
                  <td className="px-2 py-2 border-t-2 border-gray-400 text-right money text-emerald-800">{formatMoney(tot.cobrado)}</td>
                  <td className="px-2 py-2 border-t-2 border-gray-400 text-right money text-amber-800">{formatMoney(tot.saldo)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Bloque de cifras agregadas */}
        <section className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-widest text-blue-700 font-semibold">
              Total prestado
            </p>
            <p className="text-lg font-bold text-blue-900 money mt-1">
              {formatMoney(tot.capital)}
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-semibold">
              Total a recuperar
            </p>
            <p className="text-lg font-bold text-emerald-900 money mt-1">
              {formatMoney(tot.totalPago)}
            </p>
          </div>
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-widest text-primary-700 font-semibold">
              Ganancia estimada
            </p>
            <p className="text-lg font-bold text-primary-900 money mt-1">
              {formatMoney(gananciaMK)}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-widest text-amber-700 font-semibold">
              Saldo por cobrar
            </p>
            <p className="text-lg font-bold text-amber-900 money mt-1">
              {formatMoney(tot.saldo)}
            </p>
          </div>
        </section>

        {/* Footer legal-ish */}
        <footer className="mt-8 pt-4 border-t border-gray-200 text-[10px] text-gray-500">
          <p>
            Documento generado automáticamente por el sistema MicroKapital.
            Refleja los montos del ciclo vigente al momento de la impresión y
            puede variar conforme se registren nuevos pagos.
          </p>
        </footer>
      </article>
    </div>
  )
}
