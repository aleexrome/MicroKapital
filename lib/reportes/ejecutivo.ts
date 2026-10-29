import type { LoanType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSaturday, getFriday } from '@/lib/week-utils'
import { loanNotDeletedWhere } from '@/lib/access'

/**
 * Snapshot ejecutivo semanal — radar por sucursal que Dirección usa
 * para ver colocación y cobranza en la semana en curso.
 *
 * MISMA FUENTE DE VERDAD que /rutas (DG lo pidió explícitamente):
 *   - Semana sábado 00:00 UTC → viernes 23:59 UTC (del día calendario CDMX).
 *   - Pactado = schedules cuyo `fechaVencimiento` cae en esa semana,
 *     excluyendo FINANCIADO, de loans ACTIVE/LIQUIDATED/DEFAULTED no
 *     eliminados.
 *   - Recuperado = suma de `Payment.monto` ligados a esos schedules,
 *     CAPADA por `montoEsperado`. Un pago anticipado o tardío cuenta
 *     en la semana del schedule, no del pago (así se mide cumplimiento
 *     del ciclo semanal, no ingresos del día).
 *   - Colocación = loans con `fechaDesembolso` en la semana (ACTIVE/
 *     LIQUIDATED, no eliminados).
 *   - Pagos pendientes al momento = schedules de la semana cuyo
 *     vencimiento ya pasó y aún no se liquidaron.
 */

export interface PagoPendienteSemana {
  scheduleId:    string
  numeroPago:    number
  fechaVencimiento: string  // ISO
  montoEsperado: number
  montoPagado:   number
  pendiente:     number
  clienteNombre: string
  loanId:        string
  loanTipo:      LoanType
}

export interface CoordinadorEjecutivo {
  cobradorId:          string
  nombre:              string
  rol:                 string
  metaColocacion:      number
  colocacionReal:      number
  colocacionPct:       number
  pactado:             number
  recuperado:          number
  cobranzaPct:         number
  pagosPendientes:     PagoPendienteSemana[]
  pagosPendientesTotal: number
  score:               number
  color:               'verde' | 'amarillo' | 'rojo'
}

export interface SucursalEjecutivo {
  branchId:            string
  nombre:              string
  concentradoraNombre: string | null
  gerenteZonalNombre:  string | null
  metaColocacionTotal: number
  colocacionTotal:     number
  colocacionPct:       number
  pactadoTotal:        number
  recuperadoTotal:     number
  cobranzaPct:         number
  pagosPendientesTotal: number
  coordinadores:       CoordinadorEjecutivo[]
}

export interface ReporteEjecutivo {
  semanaInicio: Date
  semanaFin:    Date
  sucursales:   SucursalEjecutivo[]
}

function clasificar(score: number): 'verde' | 'amarillo' | 'rojo' {
  if (score >= 85) return 'verde'
  if (score >= 60) return 'amarillo'
  return 'rojo'
}

export async function getReporteEjecutivoSemanal(companyId: string): Promise<ReporteEjecutivo> {
  // Semana Rutas: sábado 00:00 UTC → viernes 23:59 UTC CDMX
  const saturday = getSaturday(new Date())
  const friday   = getFriday(saturday)
  const ahora    = new Date()

  const branches = await prisma.branch.findMany({
    where:  { companyId, activa: true },
    select: {
      id: true,
      nombre: true,
      concentrador: { select: { id: true, nombre: true, activo: true } },
    },
    orderBy: { nombre: 'asc' },
  })

  const gerentes = await prisma.user.findMany({
    where: { companyId, rol: 'GERENTE_ZONAL', activo: true },
    select: { id: true, nombre: true, branchId: true, zonaBranchIds: true },
  })

  function gzDeBranch(branchId: string): string | null {
    for (const g of gerentes) {
      const zonaIds = Array.isArray(g.zonaBranchIds) ? (g.zonaBranchIds as string[]) : []
      if (g.branchId === branchId || zonaIds.includes(branchId)) return g.nombre
    }
    return null
  }

  // Metas semanales (si Dirección las definió en Goal)
  const goals = await prisma.goal.findMany({
    where: {
      companyId,
      semanaInicio: { lte: friday },
      semanaFin:    { gte: saturday },
    },
    select: {
      cobradorId:          true,
      branchId:            true,
      metaCapitalColocado: true,
    },
  })
  const metaColocPorCobrador = new Map<string, number>()
  const metaColocPorSucursal = new Map<string, number>()
  for (const g of goals) {
    const meta = Number(g.metaCapitalColocado ?? 0)
    if (meta <= 0) continue
    if (g.cobradorId) {
      metaColocPorCobrador.set(g.cobradorId, (metaColocPorCobrador.get(g.cobradorId) ?? 0) + meta)
    } else if (g.branchId) {
      metaColocPorSucursal.set(g.branchId, (metaColocPorSucursal.get(g.branchId) ?? 0) + meta)
    }
  }

  // Pactado + Recuperado — MISMA query/lógica que /rutas
  const schedulesSemana = await prisma.paymentSchedule.findMany({
    where: {
      fechaVencimiento: { gte: saturday, lte: friday },
      // FINANCIADO se filtra en código (ver loop), para hacer explícito
      // qué se descarta — igual que /rutas.
      loan: {
        companyId,
        estado: { in: ['ACTIVE', 'LIQUIDATED', 'DEFAULTED'] },
        AND: [loanNotDeletedWhere],
      },
    },
    select: {
      id:               true,
      numeroPago:       true,
      fechaVencimiento: true,
      montoEsperado:    true,
      montoPagado:      true,
      estado:           true,
      payments: {
        where:  { canceledAt: null },
        select: { monto: true, fechaHora: true },
      },
      loan: {
        select: {
          id:         true,
          cobradorId: true,
          branchId:   true,
          tipo:       true,
          client:     { select: { nombreCompleto: true } },
        },
      },
    },
    orderBy: { fechaVencimiento: 'asc' },
  })

  const pactadoPorCobrador    = new Map<string, number>()
  const recuperadoPorCobrador = new Map<string, number>()
  const pendientesPorCobrador = new Map<string, PagoPendienteSemana[]>()

  for (const s of schedulesSemana) {
    if (s.estado === 'FINANCIADO') continue

    const monto = Number(s.montoEsperado)
    pactadoPorCobrador.set(s.loan.cobradorId, (pactadoPorCobrador.get(s.loan.cobradorId) ?? 0) + monto)

    // Cobranza efectiva ESTRICTA (igual que la semana actual/anterior en /rutas):
    // suma Payments del schedule, capada por montoEsperado. Pagos
    // anticipados o tardíos cuentan en la semana del schedule.
    const paidTotal = s.payments.reduce((acc, p) => acc + Number(p.monto), 0)
    const cobrado   = Math.min(paidTotal, monto)
    recuperadoPorCobrador.set(s.loan.cobradorId, (recuperadoPorCobrador.get(s.loan.cobradorId) ?? 0) + cobrado)

    // Pendiente al momento: schedule vencido no completo (para el detalle)
    const yaVencio = s.fechaVencimiento.getTime() <= ahora.getTime()
    const pendiente = monto - cobrado
    if (yaVencio && pendiente > 0 && s.estado !== 'PAID' && s.estado !== 'ADVANCE') {
      const arr = pendientesPorCobrador.get(s.loan.cobradorId) ?? []
      arr.push({
        scheduleId:       s.id,
        numeroPago:       s.numeroPago,
        fechaVencimiento: s.fechaVencimiento.toISOString(),
        montoEsperado:    monto,
        montoPagado:      cobrado,
        pendiente,
        clienteNombre:    s.loan.client.nombreCompleto,
        loanId:           s.loan.id,
        loanTipo:         s.loan.tipo,
      })
      pendientesPorCobrador.set(s.loan.cobradorId, arr)
    }
  }

  // Colocación — MISMO filtro que /rutas
  const loansDesembolsados = await prisma.loan.findMany({
    where: {
      companyId,
      estado: { in: ['ACTIVE', 'LIQUIDATED'] },
      fechaDesembolso: { gte: saturday, lte: friday },
      AND: [loanNotDeletedWhere],
    },
    select: { capital: true, cobradorId: true, branchId: true },
  })
  const colocPorCobrador = new Map<string, number>()
  for (const l of loansDesembolsados) {
    colocPorCobrador.set(l.cobradorId, (colocPorCobrador.get(l.cobradorId) ?? 0) + Number(l.capital))
  }

  const users = await prisma.user.findMany({
    where: {
      companyId,
      activo: true,
      rol: { in: ['COBRADOR', 'COORDINADOR', 'GERENTE', 'GERENTE_ZONAL'] },
    },
    select: { id: true, nombre: true, rol: true, branchId: true },
    orderBy: { nombre: 'asc' },
  })

  const sucursales: SucursalEjecutivo[] = branches.map((b) => {
    const coordRaw = users.filter((u) => u.branchId === b.id)
    const coordinadores: CoordinadorEjecutivo[] = coordRaw.map((u) => {
      const metaColoc  = metaColocPorCobrador.get(u.id) ?? 0
      const colocReal  = colocPorCobrador.get(u.id)    ?? 0
      const pactado    = pactadoPorCobrador.get(u.id)  ?? 0
      const recuperado = recuperadoPorCobrador.get(u.id) ?? 0
      const pagosPend  = pendientesPorCobrador.get(u.id) ?? []
      const pagosPendTot = pagosPend.reduce((s, p) => s + p.pendiente, 0)

      const colocacionPct = metaColoc > 0 ? Math.round((colocReal / metaColoc) * 100) : 0
      const cobranzaPct   = pactado   > 0 ? Math.round((recuperado / pactado) * 100) : 0

      let score: number
      if (pactado > 0 && metaColoc > 0) {
        score = Math.min(100, cobranzaPct) * 0.7 + Math.min(100, colocacionPct) * 0.3
      } else if (pactado > 0) {
        score = Math.min(100, cobranzaPct)
      } else if (metaColoc > 0) {
        score = Math.min(100, colocacionPct)
      } else {
        score = 0
      }

      return {
        cobradorId:          u.id,
        nombre:              u.nombre,
        rol:                 u.rol,
        metaColocacion:      metaColoc,
        colocacionReal:      colocReal,
        colocacionPct,
        pactado,
        recuperado,
        cobranzaPct,
        pagosPendientes:     pagosPend.sort((a, b) => b.pendiente - a.pendiente),
        pagosPendientesTotal: pagosPendTot,
        score:               Math.round(score),
        color:               clasificar(score),
      }
    })
      .filter((c) => c.pactado > 0 || c.recuperado > 0 || c.metaColocacion > 0 || c.colocacionReal > 0)
      .sort((a, b) => b.score - a.score)

    const metaColocSuc = Math.max(
      metaColocPorSucursal.get(b.id) ?? 0,
      coordinadores.reduce((s, c) => s + c.metaColocacion, 0),
    )
    const colocTotal   = coordinadores.reduce((s, c) => s + c.colocacionReal, 0)
    const pactadoTotal = coordinadores.reduce((s, c) => s + c.pactado, 0)
    const recupTotal   = coordinadores.reduce((s, c) => s + c.recuperado, 0)
    const pagosPendTotal = coordinadores.reduce((s, c) => s + c.pagosPendientesTotal, 0)

    return {
      branchId:             b.id,
      nombre:               b.nombre,
      concentradoraNombre:  b.concentrador?.activo ? b.concentrador.nombre : null,
      gerenteZonalNombre:   gzDeBranch(b.id),
      metaColocacionTotal:  metaColocSuc,
      colocacionTotal:      colocTotal,
      colocacionPct:        metaColocSuc > 0 ? Math.round((colocTotal / metaColocSuc) * 100) : 0,
      pactadoTotal,
      recuperadoTotal:      recupTotal,
      cobranzaPct:          pactadoTotal > 0 ? Math.round((recupTotal / pactadoTotal) * 100) : 0,
      pagosPendientesTotal: pagosPendTotal,
      coordinadores,
    }
  })

  return {
    semanaInicio: saturday,
    semanaFin:    friday,
    sucursales,
  }
}
