import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { RecursosHumanosClient } from './RecursosHumanosClient'
import type { EmpleadoData } from '@/components/rh/EmpleadoFormDialog'

/**
 * Recursos Humanos — registro administrativo de empleados, independiente
 * del modelo User. Solo Dirección General y Dirección Comercial entran.
 */
export default async function RecursosHumanosPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId } = session.user
  if (rol !== 'DIRECTOR_GENERAL' && rol !== 'DIRECTOR_COMERCIAL') {
    redirect('/dashboard')
  }

  const [empleadosRaw, branches] = await Promise.all([
    prisma.employeeRecord.findMany({
      where: { companyId: companyId! },
      orderBy: [{ estatus: 'asc' }, { nombre: 'asc' }],
    }),
    prisma.branch.findMany({
      where: { companyId: companyId!, activa: true },
      select: { nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  // Sucursales sugeridas: las sucursales activas de la empresa + las que
  // ya estén capturadas en empleados (puede haber texto libre como
  // "MARTINEZ DE LA TORRE" que no coincide exacto con el Branch).
  const sucursalesSet = new Set<string>()
  branches.forEach((b) => sucursalesSet.add(b.nombre))
  empleadosRaw.forEach((e) => { if (e.sucursal) sucursalesSet.add(e.sucursal) })
  const sucursalesSugeridas = Array.from(sucursalesSet).sort((a, b) => a.localeCompare(b))

  // Serializamos para el cliente: Decimal -> string, Date -> ISO string.
  const empleados: EmpleadoData[] = empleadosRaw.map((e) => ({
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
  }))

  return (
    <div className="p-6">
      <RecursosHumanosClient
        empleados={empleados}
        sucursalesSugeridas={sucursalesSugeridas}
      />
    </div>
  )
}
