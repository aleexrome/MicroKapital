import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { normalizeNameForSearch } from '@/lib/text-normalize'

/**
 * GET /api/loan-groups/check-name?nombre=<texto>
 *
 * Chequeo en vivo (used by /prestamos/nuevo) para avisar al coord que
 * el nombre del grupo ya existe ANTES de que llene la solicitud entera.
 * La UI llama a este endpoint con debounce mientras se captura el
 * nombre; si el nombre choca a nivel EMPRESA, la UI muestra el badge
 * rojo con la sucursal + coordinador dueño y deshabilita el submit.
 *
 * Reglas:
 *   - Match a nivel EMPRESA (branch cualquiera, coord cualquiera).
 *   - Normalizacion: strip '*' inicial, trim + UPPER + sin acentos.
 *   - Excepcion "reutilizable": si el nombre ya existe pero el grupo
 *     dueño es del MISMO coord logueado Y todos sus prestamos estan
 *     LIQUIDATED, se permite reusarlo. Los coords que renuevan un
 *     grupo solidario suelen conservar el nombre porque la gente se
 *     identifica por el (BRISAS, LAS FLORES, etc.).
 *
 * Respuesta:
 *   200 { available: true }                                     // libre y nuevo
 *   200 { available: true, reusable: true, match: {...} }       // reuso de un grupo propio liquidado
 *   200 { available: false, match: { nombre, branchName, cobradorName } }
 *   400 { error: 'Nombre requerido' }
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { companyId, id: userId } = session.user

  const raw = req.nextUrl.searchParams.get('nombre') ?? ''
  // Mismo stripping que el POST: '*' inicial marca grupo especial, no
  // forma parte del nombre efectivo. Trim antes de medir la longitud.
  const nombre = raw.trimStart().replace(/^\*+/, '').trim()
  if (nombre.length < 2) {
    return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  }

  const nombreNormalizado = normalizeNameForSearch(nombre)

  // Prisma no soporta unaccent nativo, asi que traemos los grupos vivos
  // de la empresa y filtramos en app. El volumen es bajo (grupos activos
  // por empresa se cuentan en decenas).
  const gruposEmpresa = await prisma.loanGroup.findMany({
    where: {
      eliminadoEn: null,
      branch: { companyId: companyId! },
    },
    select: {
      id: true,
      nombre: true,
      cobradorId: true,
      branch:   { select: { nombre: true } },
      cobrador: { select: { nombre: true } },
      loans:    { select: { estado: true } },
    },
  })

  const matches = gruposEmpresa.filter(
    (g) => normalizeNameForSearch(g.nombre) === nombreNormalizado,
  )
  if (matches.length === 0) {
    return NextResponse.json({ available: true })
  }

  // Reutilizacion permitida solo si TODOS los matches son propios y
  // TODOS sus prestamos estan liquidados. Si aunque sea uno rompe la
  // regla, bloqueamos. Grupos con 0 prestamos NO cuentan como
  // "liquidados" — probablemente son grupos capturados que nunca
  // salieron a produccion, y reusar el nombre podria colisionar cuando
  // el otro por fin arranque.
  const todosPropios = matches.every((g) => g.cobradorId === userId)
  const todosLiquidados = matches.every(
    (g) => g.loans.length > 0 && g.loans.every((l) => l.estado === 'LIQUIDATED'),
  )
  const reutilizable = todosPropios && todosLiquidados

  // Cuando hay match, para el badge de la UI (sucursal + coordinador
  // dueño) usamos el primer match — es representativo, y los duplicados
  // legacy son raros.
  const first = matches[0]
  if (reutilizable) {
    return NextResponse.json({
      available: true,
      reusable: true,
      match: {
        nombre: first.nombre,
        branchName: first.branch.nombre,
        cobradorName: first.cobrador.nombre,
      },
    })
  }
  return NextResponse.json({
    available: false,
    match: {
      nombre: first.nombre,
      branchName: first.branch.nombre,
      cobradorName: first.cobrador.nombre,
    },
  })
}
