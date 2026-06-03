import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { RecursosHumanosClient } from './RecursosHumanosClient'
import type { EmpleadoData } from '@/components/rh/EmpleadoFormDialog'
import {
  cobranzaSemanalPorUsuario,
  perfilPorCobranza,
  normalizarNombre,
} from '@/lib/cobranza-semanal'
import { getSaturday, getFriday } from '@/lib/week-utils'

/**
 * Recursos Humanos — registro administrativo de empleados, independiente
 * del modelo User. Solo Dirección General y Dirección Comercial entran.
 *
 * La columna "Perfil" se calcula aquí mismo: para cada ficha de RH se
 * busca su User equivalente (match por nombre normalizado, sin acentos),
 * se mira su cobranza semanal de la semana actual (idéntica a /rutas) y
 * se aplica el tier Junior/Excelencia/Senior.
 */
export default async function RecursosHumanosPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL') {
    redirect('/dashboard')
  }

  // Semana actual (sábado a viernes) — misma definición que /rutas.
  const sabado  = getSaturday(new Date())
  const viernes = getFriday(sabado)

  const [empleadosRaw, branches, usuarios, cobranzaMap] = await Promise.all([
    prisma.employeeRecord.findMany({
      where: { companyId: companyId! },
      orderBy: [{ estatus: 'asc' }, { nombre: 'asc' }],
    }),
    prisma.branch.findMany({
      where: { companyId: companyId!, activa: true },
      select: { nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.user.findMany({
      where: { companyId: companyId!, activo: true },
      select: { id: true, nombre: true },
    }),
    cobranzaSemanalPorUsuario(prisma, companyId!, sabado, viernes),
  ])

  // Sucursales sugeridas: las sucursales activas de la empresa + las que
  // ya estén capturadas en empleados (puede haber texto libre como
  // "MARTINEZ DE LA TORRE" que no coincide exacto con el Branch).
  const sucursalesSet = new Set<string>()
  branches.forEach((b) => sucursalesSet.add(b.nombre))
  empleadosRaw.forEach((e) => { if (e.sucursal) sucursalesSet.add(e.sucursal) })
  const sucursalesSugeridas = Array.from(sucursalesSet).sort((a, b) => a.localeCompare(b))

  // Index de usuarios por nombre normalizado para el match con RH.
  const userPorNombre = new Map<string, string>()
  for (const u of usuarios) {
    userPorNombre.set(normalizarNombre(u.nombre), u.id)
  }

  // Serializamos para el cliente: Decimal -> string, Date -> ISO string.
  const empleados: EmpleadoData[] = empleadosRaw.map((e) => {
    const userId   = userPorNombre.get(normalizarNombre(e.nombre)) ?? null
    const cobranza = userId !== null ? (cobranzaMap.get(userId) ?? 0) : null
    const perfil   = perfilPorCobranza(cobranza)

    return {
      id:                 e.id,
      nombre:             e.nombre,
      sucursal:           e.sucursal,
      estatus:            e.estatus,
      nacionalidad:       e.nacionalidad,
      edad:               e.edad,
      identificacion:     e.identificacion,
      estadoCivil:        e.estadoCivil,
      domicilio:          e.domicilio,
      sueldo:             e.sueldo === null ? null : e.sueldo.toString(),
      base:               e.base,
      puesto:             e.puesto,
      profesion:          e.profesion,
      telefono:           e.telefono,
      contactoEmergencia: e.contactoEmergencia,
      parentesco:         e.parentesco,
      telefono2:          e.telefono2,
      // Date column → serializamos como YYYY-MM-DD para que el PATCH no
      // reciba un ISO completo (el endpoint valida con regex).
      fechaEntrada:       e.fechaEntrada ? e.fechaEntrada.toISOString().slice(0, 10) : null,
      fechaBaja:          e.fechaBaja    ? e.fechaBaja.toISOString().slice(0, 10)    : null,
      // Derivados — no se editan, son solo display.
      perfil,
      cobranzaSemanal:    cobranza,
    }
  })

  return (
    <div className="p-6">
      <RecursosHumanosClient
        empleados={empleados}
        sucursalesSugeridas={sucursalesSugeridas}
      />
    </div>
  )
}
