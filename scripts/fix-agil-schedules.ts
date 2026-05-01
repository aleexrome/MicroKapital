/**
 * Recalcula las fechas de vencimiento de los calendarios AGIL existentes.
 *
 * Antes los calendarios AGIL se generaban saltando sábados, domingos Y festivos,
 * lo que dejaba todas las fechas descuadradas. La regla correcta es saltar
 * únicamente sábados y domingos.
 *
 * Este script recorre todos los préstamos AGIL con calendario y actualiza
 * `fechaVencimiento` por `numeroPago`. Conserva `estado`, `montoPagado`,
 * `pagadoAt` y los `Payment` ya registrados.
 *
 * Uso:
 *   npx tsx scripts/fix-agil-schedules.ts          # dry-run
 *   npx tsx scripts/fix-agil-schedules.ts --apply  # aplica cambios
 */
import { prisma } from '../lib/prisma'
import { generarFechasLunesViernes } from '../lib/business-days'

async function main() {
  const apply = process.argv.includes('--apply')

  const loans = await prisma.loan.findMany({
    where: { tipo: 'AGIL', fechaDesembolso: { not: null } },
    select: {
      id: true,
      fechaDesembolso: true,
      schedule: {
        select: { id: true, numeroPago: true, fechaVencimiento: true },
        orderBy: { numeroPago: 'asc' },
      },
    },
  })

  let totalLoans = 0
  let totalUpdates = 0

  for (const loan of loans) {
    if (!loan.fechaDesembolso || loan.schedule.length === 0) continue

    const nuevasFechas = generarFechasLunesViernes(loan.fechaDesembolso, loan.schedule.length)
    const updates: Array<{ id: string; numeroPago: number; oldDate: Date; newDate: Date }> = []

    for (const row of loan.schedule) {
      const nueva = nuevasFechas[row.numeroPago - 1]
      if (!nueva) continue
      if (row.fechaVencimiento.getTime() !== nueva.getTime()) {
        updates.push({
          id: row.id,
          numeroPago: row.numeroPago,
          oldDate: row.fechaVencimiento,
          newDate: nueva,
        })
      }
    }

    if (updates.length === 0) continue

    totalLoans += 1
    totalUpdates += updates.length

    console.log(`Préstamo ${loan.id}: ${updates.length} fechas a corregir`)
    for (const u of updates.slice(0, 3)) {
      console.log(
        `  pago ${u.numeroPago}: ${u.oldDate.toISOString().slice(0, 10)} -> ${u.newDate.toISOString().slice(0, 10)}`
      )
    }
    if (updates.length > 3) console.log(`  ... y ${updates.length - 3} más`)

    if (apply) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.paymentSchedule.update({
            where: { id: u.id },
            data: { fechaVencimiento: u.newDate },
          })
        )
      )
    }
  }

  console.log('')
  console.log(`Préstamos AGIL afectados: ${totalLoans}`)
  console.log(`Filas a actualizar: ${totalUpdates}`)
  console.log(apply ? 'Cambios aplicados.' : 'Dry-run. Ejecuta con --apply para guardar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
