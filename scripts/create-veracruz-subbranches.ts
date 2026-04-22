/**
 * Crea dos subsucursales nuevas en Veracruz (Minatitlán y Martínez de la Torre),
 * cuatro coordinadores (uno por subsucursal x2) y las asigna al Gerente Zonal
 * de Veracruz (Edgar Solís Pérez).
 *
 * Uso:
 *   DATABASE_URL=<...> DIRECT_URL=<...> npx tsx scripts/create-veracruz-subbranches.ts
 *
 * Es idempotente: si alguna sucursal o usuario ya existen, los deja tal cual y
 * sólo actualiza lo necesario.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

interface CoordinatorSeed {
  nombre: string
  email: string
  password: string
  branchKey: 'minatitlan' | 'martinez'
}

const NEW_BRANCHES = {
  minatitlan: { nombre: 'Minatitlán' },
  martinez:   { nombre: 'Martínez de la Torre' },
} as const

const COORDINATORS: CoordinatorSeed[] = [
  {
    nombre:    'Jessika Guadalupe Pérez Vives',
    email:     'jessika.perez@microkapital.com',
    password:  'JessikaPV2026*',
    branchKey: 'minatitlan',
  },
  {
    nombre:    'Eduardo Zúñiga de la Cruz',
    email:     'eduardo.zuniga@microkapital.com',
    password:  'EduardoZC2026*',
    branchKey: 'minatitlan',
  },
  {
    nombre:    'Catalina Salazar Juárez',
    email:     'catalina.salazar@microkapital.com',
    password:  'CatalinaSJ2026*',
    branchKey: 'martinez',
  },
  {
    nombre:    'Emma Hernández Campos',
    email:     'emma.hernandez@microkapital.com',
    password:  'EmmaHC2026*',
    branchKey: 'martinez',
  },
]

const GERENTE_EMAIL = 'edgar.solis@microkapital.com'

async function main() {
  // 1. Localizar empresa MicroKapital
  const company = await prisma.company.findFirst({
    where: { nombre: { contains: 'MicroKapital', mode: 'insensitive' } },
  })
  if (!company) throw new Error('No se encontró la empresa "MicroKapital".')
  console.log(`• Empresa: ${company.nombre} (${company.id})`)

  // 2. Localizar al Gerente Zonal de Veracruz
  const gerente = await prisma.user.findUnique({
    where: { companyId_email: { companyId: company.id, email: GERENTE_EMAIL } },
  })
  if (!gerente) throw new Error(`No se encontró al gerente con email ${GERENTE_EMAIL}.`)
  if (gerente.rol !== 'GERENTE_ZONAL' && gerente.rol !== 'GERENTE') {
    throw new Error(`El usuario ${GERENTE_EMAIL} no es GERENTE/GERENTE_ZONAL (rol actual: ${gerente.rol}).`)
  }
  console.log(`• Gerente: ${gerente.nombre} (${gerente.id}) — rol ${gerente.rol}`)

  // 3. Crear sucursales si no existen (no hay unique en nombre, usamos findFirst)
  const branchIds: Record<'minatitlan' | 'martinez', string> = { minatitlan: '', martinez: '' }
  for (const key of Object.keys(NEW_BRANCHES) as Array<keyof typeof NEW_BRANCHES>) {
    const def = NEW_BRANCHES[key]
    const existing = await prisma.branch.findFirst({
      where: { companyId: company.id, nombre: def.nombre },
    })
    if (existing) {
      branchIds[key] = existing.id
      console.log(`• Sucursal ya existía: ${def.nombre} (${existing.id})`)
    } else {
      const created = await prisma.branch.create({
        data: { companyId: company.id, nombre: def.nombre, activa: true },
      })
      branchIds[key] = created.id
      console.log(`✓ Sucursal creada: ${def.nombre} (${created.id})`)
    }
  }

  // 4. Crear / actualizar coordinadores (idempotente vía @@unique([companyId, email]))
  for (const c of COORDINATORS) {
    const hash = await bcrypt.hash(c.password, 12)
    const branchId = branchIds[c.branchKey]

    const user = await prisma.user.upsert({
      where:  { companyId_email: { companyId: company.id, email: c.email } },
      update: {
        // No sobreescribimos la contraseña existente (para no romper sesiones activas)
        nombre:    c.nombre,
        rol:       'COORDINADOR',
        branchId,
        gerenteId: gerente.id,
        activo:    true,
      },
      create: {
        companyId:    company.id,
        branchId,
        rol:          'COORDINADOR',
        nombre:       c.nombre,
        email:        c.email,
        passwordHash: hash,
        activo:       true,
        gerenteId:    gerente.id,
      },
      select: { id: true, email: true, createdAt: true, updatedAt: true },
    })

    const esNuevo = Math.abs(user.createdAt.getTime() - user.updatedAt.getTime()) < 1000
    console.log(`${esNuevo ? '✓ Coordinador creado' : '• Coordinador actualizado'}: ${c.nombre} <${user.email}>`)
  }

  // 5. Agregar las 2 sucursales nuevas al zonaBranchIds del Gerente
  const currentZone = Array.isArray(gerente.zonaBranchIds) ? (gerente.zonaBranchIds as string[]) : []
  const nuevos = [branchIds.minatitlan, branchIds.martinez].filter((id) => !currentZone.includes(id))
  if (nuevos.length > 0) {
    const updated = [...currentZone, ...nuevos]
    await prisma.user.update({
      where: { id: gerente.id },
      data:  { zonaBranchIds: updated },
    })
    console.log(`✓ zonaBranchIds del gerente extendido con ${nuevos.length} sucursal(es). Total zona: ${updated.length}`)
  } else {
    console.log(`• zonaBranchIds del gerente ya contenía ambas sucursales. Sin cambios.`)
  }

  console.log('\n─────────────────────────────────────────────')
  console.log('Listo. Credenciales iniciales de los 4 coordinadores:')
  for (const c of COORDINATORS) {
    console.log(`  ${c.email.padEnd(40)}  ${c.password}`)
  }
}

main()
  .catch((err) => { console.error('❌', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
