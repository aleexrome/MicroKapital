/**
 * One-off fix: LAS ELOTITAS — San Mateo Atenco (Ciclo 04)
 *
 * Context: the 5 SOLIDARIO loans of cycle 04 (disbursed 2026-04-14) were
 * created with loanGroupId = NULL instead of being attached to the real
 * group "LAS ELOTITAS" (id a29a2bd0-..44c8, created 2026-04-12).
 *
 * A second row for "LAS ELOTITAS" exists (id 95ab9dab-..f50c, created
 * 2026-04-13) holding 5 REJECTED loan applications from the same clients
 * for higher amounts. That row is INTENTIONALLY left untouched to
 * preserve audit history; the duplication is an artifact of the new-loan
 * flow and will be addressed separately (unique constraint + group
 * selector in the form).
 *
 * This script only attaches the 5 ACTIVE loans of cycle 04 to a29a2bd0.
 * It does not modify capital, tasa, pagoSemanal, PaymentSchedule,
 * LIQUIDATED loans from the previous cycle, REJECTED applications, nor
 * ROCIO's INDIVIDUAL loan.
 *
 * Run:  npx tsx scripts/fix-elotitas-grouping.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const KEEP_GROUP_ID = 'a29a2bd0-f322-456e-bc32-d413eeff44c8'

const LOAN_IDS = [
  'b7323e71-f288-41f3-a60e-9b8011a749e9', // NICOLASA HERAZ CASTAÑEDA      $10,000
  '04795b7d-d1d2-4aab-9d2a-daed972f7475', // MARIA FERNANDA DE JESUS ROBLES $10,000
  'df5ce4f9-0371-4b92-85db-2757178e1107', // JUAN JOEL DE JESUS ROBLES     $12,000
  '7261a03c-ffb4-4584-985e-7951511f11df', // YANET IRENE CASTAÑEDA         $10,000
  '12023f75-b94c-45d8-af9b-2b103cecee7b', // ROCIO ROBLES PEREZ SOLIDARIO  $10,000
]

async function main() {
  console.log('🔧 LAS ELOTITAS — attaching cycle 04 SOLIDARIO loans to the real group\n')

  const group = await prisma.loanGroup.findUnique({ where: { id: KEEP_GROUP_ID } })
  if (!group) throw new Error(`Group not found: ${KEEP_GROUP_ID}`)
  console.log(`✔ Group: ${group.id}  ${group.nombre}  createdAt=${group.createdAt.toISOString()}\n`)

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
  console.log('Loans to attach:')
  for (const l of loans) {
    console.log(
      `  • ${l.client.nombreCompleto.padEnd(35)} capital=${l.capital}  pago=${l.pagoSemanal}  current loanGroupId=${l.loanGroupId ?? 'NULL'}`
    )
  }
  console.log()

  const updated = await prisma.loan.updateMany({
    where: { id: { in: LOAN_IDS }, loanGroupId: null },
    data: { loanGroupId: KEEP_GROUP_ID },
  })
  console.log(`✔ Attached ${updated.count} loans to ${KEEP_GROUP_ID}`)

  console.log('\n✅ Done. Duplicate group 95ab9dab-..f50c left untouched on purpose.')
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
