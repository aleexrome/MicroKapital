export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import {
  idToSaturday, saturdayToId, getFriday, formatWeekLabelSatFri, getSaturday,
} from '@/lib/week-utils'
import { calcularNominaSemana, cutoffViernes14 } from '@/lib/nomina'
import { NominaClient } from './NominaClient'

const ROLES_VEN_TODO = new Set(['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN'])

export default async function NominaSemanaPage({
  params,
}: {
  params: { semana: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const { rol, companyId, id: userId } = session.user

  // Solo perfiles operativos pueden ver nómina (excluimos CLIENTE).
  const rolesValidos = ['DIRECTOR_GENERAL', 'DIRECTOR_COMERCIAL', 'SUPER_ADMIN', 'GERENTE_ZONAL', 'GERENTE', 'COORDINADOR', 'COBRADOR']
  if (!rolesValidos.includes(rol)) redirect('/dashboard')

  // Validar el id de semana — si no es YYYY-MM-DD válido, 404.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.semana)) notFound()
  const saturday = idToSaturday(params.semana)
  if (isNaN(saturday.getTime())) notFound()
  const friday = getFriday(saturday)
  const cutoff = cutoffViernes14(saturday)

  const nomina = await calcularNominaSemana(prisma, companyId!, saturday, friday, cutoff)

  // Director ve todos; los demás solo su propio renglón.
  const vistaCompleta = ROLES_VEN_TODO.has(rol)
  const visibles = vistaCompleta ? nomina : nomina.filter((n) => n.userId === userId)

  const semanaLabel  = formatWeekLabelSatFri(saturday)
  const semanaActual = saturdayToId(getSaturday(new Date()))
  const isCurrent    = semanaActual === params.semana

  // Navegación semana anterior / siguiente
  const prevSat = new Date(saturday); prevSat.setUTCDate(prevSat.getUTCDate() - 7)
  const nextSat = new Date(saturday); nextSat.setUTCDate(nextSat.getUTCDate() + 7)

  return (
    <NominaClient
      nomina={visibles}
      vistaCompleta={vistaCompleta}
      semanaLabel={semanaLabel}
      semanaId={params.semana}
      semanaAnteriorId={saturdayToId(prevSat)}
      semanaSiguienteId={saturdayToId(nextSat)}
      isCurrent={isCurrent}
    />
  )
}
