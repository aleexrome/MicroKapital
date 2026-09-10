/**
 * Crea al coordinador Abraham Rosales Estrada en la sucursal Tenancingo.
 *
 * Uso:
 *   DATABASE_URL=<...> DIRECT_URL=<...> npx tsx scripts/create-abraham-tenancingo.ts
 *
 * Idempotente: si el usuario ya existe (mismo email en la empresa), se
 * actualizan sus datos (nombre, rol, sucursal, gerenteId, activo=true)
 * pero NO se toca su contraseña para no invalidar sesiones activas.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const NEW_USER = {
  nombre:   'Abraham Rosales Estrada',
  email:    'abraham.rosales@microkapital.com',
  password: 'RosalesMKTen26!*',
} as const

const BRANCH_NAME = 'Tenancingo'

async function main() {
  // 1. Empresa
  const company = await prisma.company.findFirst({
    where: { nombre: { contains: 'MicroKapital', mode: 'insensitive' } },
  })
  if (!company) throw new Error('No se encontró la empresa "MicroKapital".')
  console.log(`• Empresa: ${company.nombre} (${company.id})`)

  // 2. Sucursal Tenancingo
  const branch = await prisma.branch.findFirst({
    where: {
      companyId: company.id,
      nombre:    { equals: BRANCH_NAME, mode: 'insensitive' },
      activa:    true,
    },
  })
  if (!branch) throw new Error(`No se encontró la sucursal activa "${BRANCH_NAME}".`)
  console.log(`• Sucursal: ${branch.nombre} (${branch.id})`)

  // 3. Gerente Zonal cuya zona incluya Tenancingo (o Gerente de la sucursal).
  //    Se busca sobre zonaBranchIds JSON o sobre el branchId del gerente.
  //    Si hay más de uno o ninguno, el gerenteId queda null y se avisa —
  //    el coord se puede asignar despues manualmente.
  const gerentes = await prisma.user.findMany({
    where: {
      companyId: company.id,
      activo:    true,
      rol:       { in: ['GERENTE_ZONAL', 'GERENTE'] },
    },
    select: { id: true, nombre: true, rol: true, branchId: true, zonaBranchIds: true },
  })
  const matchesZona = gerentes.filter((g) => {
    const zona = Array.isArray(g.zonaBranchIds) ? (g.zonaBranchIds as string[]) : []
    return zona.includes(branch.id) || g.branchId === branch.id
  })
  let gerenteId: string | null = null
  if (matchesZona.length === 1) {
    gerenteId = matchesZona[0].id
    console.log(`• Gerente identificado: ${matchesZona[0].nombre} (${matchesZona[0].rol})`)
  } else if (matchesZona.length === 0) {
    console.log('⚠ No hay gerente que cubra Tenancingo. gerenteId queda NULL.')
  } else {
    console.log(`⚠ Hay ${matchesZona.length} gerentes candidatos. gerenteId queda NULL; asignarlo despues manualmente.`)
    for (const g of matchesZona) console.log(`    - ${g.nombre} (${g.rol})`)
  }

  // 4. Upsert del usuario (idempotente vía @@unique([companyId, email]))
  const hash = await bcrypt.hash(NEW_USER.password, 12)
  const user = await prisma.user.upsert({
    where:  { companyId_email: { companyId: company.id, email: NEW_USER.email } },
    update: {
      // No sobreescribimos la contraseña existente para no invalidar sesiones.
      nombre:    NEW_USER.nombre,
      rol:       'COORDINADOR',
      branchId:  branch.id,
      gerenteId,
      activo:    true,
    },
    create: {
      companyId:    company.id,
      branchId:     branch.id,
      rol:          'COORDINADOR',
      nombre:       NEW_USER.nombre,
      email:        NEW_USER.email,
      passwordHash: hash,
      activo:       true,
      gerenteId,
    },
    select: { id: true, email: true, createdAt: true, updatedAt: true },
  })
  const esNuevo = Math.abs(user.createdAt.getTime() - user.updatedAt.getTime()) < 1000
  console.log(`${esNuevo ? '✓ Coordinador creado' : '• Coordinador actualizado'}: ${NEW_USER.nombre} <${user.email}>`)

  console.log('\n─────────────────────────────────────────────')
  console.log('Credencial inicial:')
  console.log(`  ${NEW_USER.email.padEnd(40)}  ${NEW_USER.password}`)
}

main()
  .catch((err) => { console.error('❌', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
