/**
 * One-off fix: LAS ELOTITAS — San Mateo Atenco
 *
 * Problem: 5 SOLIDARIO loans were created with loanGroupId = NULL and the
 * group "LAS ELOTITAS" was accidentally duplicated in the LoanGroup table.
 *
 * This script:
 *   1. Links the 5 SOLIDARIO loans (2026-04-14) to the kept group.
 *   2. Deletes the duplicate empty group (only if it has 0 linked loans).
 *
 * It does NOT touch: capital, tasa, pagoSemanal, PaymentSchedule, or the
 * INDIVIDUAL loan of ROCIO ROBLES PEREZ (2025-11-27).
 *
 * Run once:  npx tsx scripts/fix-elotitas-grouping.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const KEEP_GROUP_ID = 'a29a2bd0-f322-456e-bc32-d413eeff44c8'
const DELETE_GROUP_ID = '95ab9dab-b974-447c-b2c7-ddf40591f50c'

const LOAN_IDS = [
  'b7323e71-f288-41f3-a60e-9b8011a749e9', // NICOLASA HERAZ CASTAÑEDA    $10,000
  '04795b7d-d1d2-4aab-9d2a-daed972f7475', // MARIA FERNANDA DE JESUS ROBLES $10,000
  'df5ce4f9-0371-4b92-85db-2757178e1107', // JUAN JOEL DE JESUS ROBLES   $12,000
  '7261a03c-ffb4-4584-985e-7951511f11df', // YANET IRENE CASTAÑEDA       $10,000
  '12023f75-b94c-45d8-af9b-2b103cecee7b', // ROCIO ROBLES PEREZ SOLIDARIO $10,000
]

async function main() {
  console.log('🔧 Fix LAS ELOTITAS — San Mateo Atenco\n')

  const [keep, dup] = await Promise.all([
    prisma.loanGroup.findUnique({ where: { id: KEEP_GROUP_ID } }),
    prisma.loanGroup.findUnique({ where: { id: DELETE_GROUP_ID } }),
  ])
  if (!keep) throw new Error(`Group to keep not found: ${KEEP_GROUP_ID}`)
  if (!dup) throw new Error(`Duplicate group not found: ${DELETE_GROUP_ID}`)
  console.log(`✔ Keep:   ${keep.id}  (${keep.nombre}, createdAt=${keep.createdAt.toISOString()})`)
  console.log(`✔ Delete: ${dup.id}  (${dup.nombre}, createdAt=${dup.createdAt.toISOString()})\n`)

  const loans = await prisma.loan.findMany({
    where: { id: { in: LOAN_IDS } },
    select: {
      id: true, tipo: true, estado: true, loanGroupId: true,
      capital: true, pagoSemanal: true,
      client: { select: { nombreCompleto: true } },
    },
  })

  if (loans.length !== LOAN_IDS.length) {
    const missing = LOAN_IDS.filter((id) => !loans.find((l) => l.id === id))
    throw new Error(`Missing loans: ${missing.join(', ')}`)
  }
  for (const l of loans) {
    if (l.tipo !== 'SOLIDARIO') throw new Error(`Loan ${l.id} is not SOLIDARIO (${l.tipo})`)
    if (l.estado !== 'ACTIVE') throw new Error(`Loan ${l.id} is not ACTIVE (${l.estado})`)
    if (l.loanGroupId && l.loanGroupId !== KEEP_GROUP_ID) {
      throw new Error(`Loan ${l.id} already belongs to another group: ${l.loanGroupId}`)
    }
  }
  console.log('Loans to link:')
  for (const l of loans) {
    console.log(
      `  • ${l.client.nombreCompleto.padEnd(35)} capital=${l.capital}  pago=${l.pagoSemanal}  current loanGroupId=${l.loanGroupId ?? 'NULL'}`
    )
  }
  console.log()

  await prisma.$transaction(async (tx) => {
    const updated = await tx.loan.updateMany({
      where: { id: { in: LOAN_IDS }, loanGroupId: null },
      data: { loanGroupId: KEEP_GROUP_ID },
    })
    console.log(`✔ Linked ${updated.count} loans to ${KEEP_GROUP_ID}`)

    const remaining = await tx.loan.count({ where: { loanGroupId: DELETE_GROUP_ID } })
    if (remaining > 0) {
      throw new Error(`Cannot delete ${DELETE_GROUP_ID}: ${remaining} loans still reference it`)
    }
    await tx.loanGroup.delete({ where: { id: DELETE_GROUP_ID } })
    console.log(`✔ Deleted duplicate group ${DELETE_GROUP_ID}`)
  })

  console.log('\n✅ Done.')
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
