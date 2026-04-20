/**
 * Reasigna clientes a grupos solidarios según el mapa abajo.
 * - No cambia sucursal ni coordinador; solo `Loan.loanGroupId`.
 * - Si el grupo destino no existe en la misma sucursal, lo crea.
 * - Si un grupo viejo queda sin préstamos activos, se desactiva (activo=false).
 * - Cuando `groupName === clientName` el cliente queda en un "grupo solo".
 *
 * Uso:
 *   npx tsx scripts/reassign-groups-2026-04.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Coincidencia por nombre COMPLETO del cliente (mayúsculas, exacto).
// Si el cliente tiene tildes/ñ en BD, ajustar aquí.
const REASSIGNMENTS: { cliente: string; grupo: string }[] = [
  { cliente: 'CIRCE DENNISE MORENO DOMINGUEZ', grupo: 'CIRCE DENNISE MORENO DOMINGUEZ' }, // solo
  { cliente: 'MIGUEL RESENDIS LARA',           grupo: 'UNICORNIO' },
  { cliente: 'ELEAZAR LARA CAMACHO',           grupo: 'UNICORNIO' },
  { cliente: 'ISMENIA ROGEL MILLAN',           grupo: 'ORQUIDEA' },
  { cliente: 'ADILENE ROGEL MILLAN',           grupo: 'ORQUIDEA' },
  { cliente: 'SONIA GONZALEZ HERRERA',         grupo: 'LOS CAMOCHAS' },
  { cliente: 'MIGUEL ANGEL PEDRAZA VELAZQUEZ', grupo: 'LOS CAMOCHAS' },
]

async function main() {
  console.log(`\n→ Reasignando ${REASSIGNMENTS.length} préstamos...\n`)

  const oldGroupIds = new Set<string>()

  for (const r of REASSIGNMENTS) {
    const client = await prisma.client.findFirst({
      where: { nombreCompleto: r.cliente },
      select: { id: true, nombreCompleto: true },
    })
    if (!client) {
      console.log(`  ✗ Cliente no encontrado: ${r.cliente}`)
      continue
    }

    const loan = await prisma.loan.findFirst({
      where: {
        clientId: client.id,
        tipo:     'SOLIDARIO',
        estado:   'ACTIVE',
      },
      select: { id: true, branchId: true, cobradorId: true, loanGroupId: true },
    })
    if (!loan) {
      console.log(`  ✗ Sin préstamo SOLIDARIO ACTIVE: ${r.cliente}`)
      continue
    }

    // Buscar grupo destino en la misma sucursal
    let target = await prisma.loanGroup.findFirst({
      where: { nombre: r.grupo, branchId: loan.branchId },
      select: { id: true, nombre: true, activo: true },
    })
    if (!target) {
      target = await prisma.loanGroup.create({
        data: {
          nombre:     r.grupo,
          branchId:   loan.branchId,
          cobradorId: loan.cobradorId,
          activo:     true,
        },
        select: { id: true, nombre: true, activo: true },
      })
      console.log(`  + Grupo creado: "${target.nombre}"`)
    } else if (!target.activo) {
      // Reactivar si estaba inactivo
      await prisma.loanGroup.update({
        where: { id: target.id },
        data:  { activo: true },
      })
      console.log(`  ↻ Grupo reactivado: "${target.nombre}"`)
    }

    if (loan.loanGroupId === target.id) {
      console.log(`  = ${r.cliente} ya pertenece a "${r.grupo}"`)
      continue
    }

    if (loan.loanGroupId) oldGroupIds.add(loan.loanGroupId)

    await prisma.loan.update({
      where: { id: loan.id },
      data:  { loanGroupId: target.id },
    })
    console.log(`  ✓ ${r.cliente}  →  "${r.grupo}"`)
  }

  // Desactivar grupos viejos que quedaron vacíos
  for (const gid of Array.from(oldGroupIds)) {
    const activos = await prisma.loan.count({
      where: { loanGroupId: gid, estado: 'ACTIVE' },
    })
    if (activos === 0) {
      const g = await prisma.loanGroup.update({
        where: { id: gid },
        data:  { activo: false },
        select: { nombre: true },
      })
      console.log(`  · Grupo viejo sin miembros activos → desactivado: "${g.nombre}"`)
    }
  }

  console.log(`\n✅ Listo.\n`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
