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
 * Misma normalizacion que POST /api/loan-groups:
 *   - se retira el prefijo '*' (grupos especiales autorizados por DG),
 *   - trim + UPPER + sin acentos,
 *   - alcance de company (no de sucursal).
 *
 * Respuesta:
 *   200 { available: true }
 *   200 { available: false, match: { nombre, branchName, cobradorName } }
 *   400 { error: 'Nombre requerido' }
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { companyId } = session.user

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
      nombre: true,
      branch: { select: { nombre: true } },
      cobrador: { select: { nombre: true } },
    },
  })

  const match = gruposEmpresa.find(
    (g) => normalizeNameForSearch(g.nombre) === nombreNormalizado,
  )
  if (!match) {
    return NextResponse.json({ available: true })
  }
  return NextResponse.json({
    available: false,
    match: {
      nombre: match.nombre,
      branchName: match.branch.nombre,
      cobradorName: match.cobrador.nombre,
    },
  })
}
