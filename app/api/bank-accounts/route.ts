import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/bank-accounts?branchId=…   (o ?scheduleId=… o ?loanId=…)
 *
 * Devuelve las cuentas bancarias activas de la empresa filtradas por
 * sucursal. Una cuenta puede estar asignada a varias sucursales vía
 * BankAccountBranch — el dropdown solo muestra las válidas para la
 * sucursal del préstamo que se está pagando.
 *
 * Resolución del branchId objetivo, en orden:
 *   1. ?branchId=X                     — explícito.
 *   2. ?scheduleId=X → schedule.loan.branchId.
 *   3. ?loanId=X     → loan.branchId.
 *   4. ?groupId=X    → loanGroup.branchId (cobro solidario).
 *   5. Fallback: branchId de la sesión.
 *
 * Si no se pudo determinar sucursal:
 *   - Roles admin (DG/DC/MC/SUPER_ADMIN) ven todas las cuentas activas.
 *   - Los demás ven vacío (fail-closed).
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { companyId, branchId: sessionBranchId, rol } = session.user

  const explicitBranchId = req.nextUrl.searchParams.get('branchId')
  const scheduleId       = req.nextUrl.searchParams.get('scheduleId')
  const loanId           = req.nextUrl.searchParams.get('loanId')
  const groupId          = req.nextUrl.searchParams.get('groupId')

  let targetBranchId: string | null = explicitBranchId
  if (!targetBranchId && scheduleId) {
    const s = await prisma.paymentSchedule.findFirst({
      where: { id: scheduleId, loan: { companyId: companyId! } },
      select: { loan: { select: { branchId: true } } },
    })
    targetBranchId = s?.loan.branchId ?? null
  }
  if (!targetBranchId && loanId) {
    const l = await prisma.loan.findFirst({
      where: { id: loanId, companyId: companyId! },
      select: { branchId: true },
    })
    targetBranchId = l?.branchId ?? null
  }
  if (!targetBranchId && groupId) {
    const g = await prisma.loanGroup.findFirst({
      where: { id: groupId, branch: { companyId: companyId! } },
      select: { branchId: true },
    })
    targetBranchId = g?.branchId ?? null
  }
  if (!targetBranchId) targetBranchId = sessionBranchId ?? null

  const esRolAdmin = rol === 'DIRECTOR_GENERAL'
    || rol === 'DIRECTOR_COMERCIAL'
    || rol === 'MESA_CONTROL'
    || rol === 'SUPER_ADMIN'

  const accounts = await prisma.companyBankAccount.findMany({
    where: {
      companyId: companyId!,
      activa: true,
      ...(targetBranchId
        ? { branches: { some: { branchId: targetBranchId } } }
        : esRolAdmin
          ? {}
          : { id: '' }), // usuario sin sucursal y no-admin → nada
    },
    orderBy: [{ banco: 'asc' }, { titular: 'asc' }],
  })

  return NextResponse.json({ data: accounts })
}
