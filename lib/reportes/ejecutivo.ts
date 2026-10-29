import type { LoanType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { weekRange } from './dateRanges'
import { todayMx } from '@/lib/timezone'

/**
 * Snapshot ejecutivo semanal — pensado para el "radar" por sucursal
 * que ve Dirección de Sistemas al cerrar la semana. Agrupa por
 * sucursal → coordinadores con:
 *   - Meta de colocación (de Goal) + alcance real + %
 *   - Pactado a recuperar (schedules de la semana) + recuperado + %
 *   - Pagos pendientes al momento (schedules sin PAID de la semana)
 *   - Score compuesto para ordenar y colorear (verde/amarillo/rojo)
 *
 * No se expone por filtro de usuario / sucursal — devuelve TODAS las
 * sucursales activas de la empresa. El permiso se controla en la
 * página (solo Alejandro Romero).
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
  // Colocación
  metaColocacion:      number       // 0 si no hay Goal definido
  colocacionReal:      number
  colocacionPct:       number       // 0..100+ ; 0 si meta=0
  // Cobranza
  pactado:             number
  recuperado:          number
  cobranzaPct:         number       // 0..100+ ; 0 si pactado=0
  // Pagos sueltos pendientes
  pagosPendientes:     PagoPendienteSemana[]
  pagosPendientesTotal: number
  // Score compuesto (0..100). Promedio de colocacionPct y cobranzaPct
  // (capeados a 100). Si una métrica no tiene meta, se usa solo la otra.
  score:               number
  // Clasificación por color
  color:               'verde' | 'amarillo' | 'rojo'
}

export interface SucursalEjecutivo {
  branchId:            string
  nombre:              string
  concentradoraNombre: string | null
  gerenteZonalNombre:  string | null
  // Agregados de la sucursal (suma de coordinadores)
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

/**
 * Carga la info ejecutiva de la semana actual (lun-dom CDMX).
 */
export async function getReporteEjecutivoSemanal(companyId: string): Promise<ReporteEjecutivo> {
  const range = weekRange(todayMx())
  const ahora = new Date()

  // Sucursales activas con su concentradora y GZ (si hay).
  const branches = await prisma.branch.findMany({
    where:  { companyId, activa: true },
    select: {
      id: true,
      nombre: true,
      concentrador: { select: { id: true, nombre: true, activo: true } },
    },
    orderBy: { nombre: 'asc' },
  })

  // GZ de cada sucursal: User con rol GERENTE_ZONAL que tenga esta sucursal en su zonaBranchIds o branchId.
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

  // Metas semanales activas (lun-dom actual). Sólo las que apuntan a un cobrador o a una sucursal.
  // Si una Goal es por sucursal, se aplica como "meta de la sucursal" (no se reparte).
  const goals = await prisma.goal.findMany({
    where: {
      companyId,
      semanaInicio: { lte: range.fin },
      semanaFin:    { gte: range.inicio },
    },
    select: {
      cobradorId:          true,
      branchId:            true,
      metaCapitalColocado: true,
      metaCobranzaEsperada: true,
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

  // Colocación real de la semana (nuevos desembolsos lun-dom).
  const loansDesembolsados = await prisma.loan.findMany({
    where: {
      companyId,
      fechaDesembolso: { gte: range.inicio, lte: range.fin },
      estado: { in: ['ACTIVE', 'LIQUIDATED', 'RESTRUCTURED', 'DEFAULTED'] },
    },
    select: { capital: true, cobradorId: true, branchId: true },
  })
  const colocPorCobrador = new Map<string, number>()
  for (const l of loansDesembolsados) {
    colocPorCobrador.set(l.cobradorId, (colocPorCobrador.get(l.cobradorId) ?? 0) + Number(l.capital))
  }

  // Pactado a recuperar: suma de montoEsperado de schedules que vencen en la semana (loan ACTIVE/DEFAULTED).
  const schedulesSemana = await prisma.paymentSchedule.findMany({
    where: {
      fechaVencimiento: { gte: range.inicio, lte: range.fin },
      estado: { not: 'FINANCIADO' },
      loan: {
        companyId,
        estado: { in: ['ACTIVE', 'DEFAULTED'] },
      },
    },
    select: {
      id:               true,
      numeroPago:       true,
      fechaVencimiento: true,
      montoEsperado:    true,
      montoPagado:      true,
      estado:           true,
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

  // Pactado y pendientes por cobrador.
  const pactadoPorCobrador = new Map<string, number>()
  const pendientesPorCobrador = new Map<string, PagoPendienteSemana[]>()
  for (const s of schedulesSemana) {
    const monto = Number(s.montoEsperado)
    pactadoPorCobrador.set(s.loan.cobradorId, (pactadoPorCobrador.get(s.loan.cobradorId) ?? 0) + monto)

    const pendiente = monto - Number(s.montoPagado)
    // Solo pagos que aún no están liquidados Y que ya vencieron o vencen hoy
    // (los que vencen más adelante en la semana se cuentan en "pactado" pero
    // no estorban en "pendientes al momento" — todavía no es tarde).
    const yaVencio = s.fechaVencimiento.getTime() <= ahora.getTime()
    if (yaVencio && s.estado !== 'PAID' && pendiente > 0) {
      const arr = pendientesPorCobrador.get(s.loan.cobradorId) ?? []
      arr.push({
        scheduleId:       s.id,
        numeroPago:       s.numeroPago,
        fechaVencimiento: s.fechaVencimiento.toISOString(),
        montoEsperado:    monto,
        montoPagado:      Number(s.montoPagado),
        pendiente,
        clienteNombre:    s.loan.client.nombreCompleto,
        loanId:           s.loan.id,
        loanTipo:         s.loan.tipo,
      })
      pendientesPorCobrador.set(s.loan.cobradorId, arr)
    }
  }

  // Recuperado efectivo (pagos del rango, CASH/CARD/TRANSFER verificada).
  const pagos = await prisma.payment.findMany({
    where: {
      fechaHora: { gte: range.inicio, lte: range.fin },
      canceledAt: null,
      loan: { companyId },
      OR: [
        { metodoPago: { in: ['CASH', 'CARD'] } },
        { AND: [{ metodoPago: 'TRANSFER' }, { statusTransferencia: 'VERIFICADO' }] },
      ],
    },
    select: { monto: true, cobradorId: true },
  })
  const recuperadoPorCobrador = new Map<string, number>()
  for (const p of pagos) {
    recuperadoPorCobrador.set(p.cobradorId, (recuperadoPorCobrador.get(p.cobradorId) ?? 0) + Number(p.monto))
  }

  // Cobradores por sucursal. Son los Users con rol COBRADOR o COORDINADOR
  // asignados a esa sucursal (filtramos los que de hecho hicieron algo o
  // tienen meta — para que la fila no esté vacía).
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
      const metaColoc    = metaColocPorCobrador.get(u.id) ?? 0
      const colocReal    = colocPorCobrador.get(u.id)    ?? 0
      const pactado      = pactadoPorCobrador.get(u.id)  ?? 0
      const recuperado   = recuperadoPorCobrador.get(u.id) ?? 0
      const pagosPend    = pendientesPorCobrador.get(u.id) ?? []
      const pagosPendTot = pagosPend.reduce((s, p) => s + p.pendiente, 0)

      const colocacionPct = metaColoc > 0 ? Math.round((colocReal / metaColoc) * 100) : 0
      const cobranzaPct   = pactado   > 0 ? Math.round((recuperado / pactado) * 100) : 0

      // Score: promedio ponderado. La cobranza pesa más (es la operación
      // día-a-día); colocación es más oportunista.
      let score: number
      if (pactado > 0 && metaColoc > 0) {
        score = Math.min(100, cobranzaPct) * 0.7 + Math.min(100, colocacionPct) * 0.3
      } else if (pactado > 0) {
        score = Math.min(100, cobranzaPct)
      } else if (metaColoc > 0) {
        score = Math.min(100, colocacionPct)
      } else {
        score = 0  // sin pactado ni meta — queda al final en rojo (sin actividad)
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
      // Mostrar solo coordinadores con alguna actividad o meta
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
    semanaInicio: range.inicio,
    semanaFin:    range.fin,
    sucursales,
  }
}
