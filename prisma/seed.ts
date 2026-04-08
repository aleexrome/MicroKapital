import { PrismaClient, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { addDays } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // ─── Super Admin (sistema — no pertenece a ninguna empresa) ───────────────
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@sistema.dev'

  let superAdminCompany = await prisma.company.findFirst({
    where: { nombre: '__SYSTEM__' },
  })
  if (!superAdminCompany) {
    superAdminCompany = await prisma.company.create({
      data: { nombre: '__SYSTEM__', activa: false },
    })
  }

  const existingSuperAdmin = await prisma.user.findFirst({ where: { email: superAdminEmail } })
  if (!existingSuperAdmin) {
    await prisma.user.create({
      data: {
        companyId: superAdminCompany.id,
        rol: 'SUPER_ADMIN',
        nombre: 'Alejandro (Admin Sistema)',
        email: superAdminEmail,
        passwordHash: await bcrypt.hash('Admin2026!', 12),
        activo: true,
      },
    })
    console.log(`✅ Super Admin: ${superAdminEmail} / Admin2026!`)
  }

  // ─── Empresa MicroKapital Financiera ──────────────────────────────────────
  let company = await prisma.company.findFirst({ where: { nombre: 'MicroKapital Financiera' } })
  if (!company) {
    company = await prisma.company.create({
      data: {
        nombre: 'MicroKapital Financiera',
        telefono: '555-0100',
        email: 'contacto@microkapital.com',
        direccion: 'Av. Principal 123, Estado de México',
        activa: true,
      },
    })
    console.log('✅ Empresa creada: MicroKapital Financiera')
  }

  // Licencia
  const existingLicense = await prisma.license.findUnique({ where: { companyId: company.id } })
  if (!existingLicense) {
    await prisma.license.create({
      data: {
        companyId: company.id,
        claveLicencia: 'LIC-MK-2026-001',
        estado: 'ACTIVE',
        precioMensual: 2500,
        diaCobro: 1,
        proximoPago: addDays(new Date(), 30),
        notasInternas: 'Licencia producción MicroKapital',
      },
    })
    console.log('✅ Licencia creada')
  }

  // ─── 4 Sucursales ──────────────────────────────────────────────────────────
  const sucursalesData = [
    { nombre: 'San Mateo Atenco', direccion: 'San Mateo Atenco, Estado de México',    telefono: '722-100-0001' },
    { nombre: 'Tenancingo',       direccion: 'Tenancingo de Degollado, Estado de México', telefono: '714-100-0002' },
    { nombre: 'Toluca',           direccion: 'Toluca de Lerdo, Estado de México',     telefono: '722-100-0003' },
    { nombre: 'Veracruz',         direccion: 'Veracruz, Veracruz',                    telefono: '229-100-0004' },
  ]

  const branchMap: Record<string, string> = {} // nombre → id

  for (const s of sucursalesData) {
    let b = await prisma.branch.findFirst({ where: { companyId: company.id, nombre: s.nombre } })
    if (!b) {
      b = await prisma.branch.create({
        data: { companyId: company.id, ...s, activa: true },
      })
      console.log(`✅ Sucursal: ${s.nombre}`)
    }
    branchMap[s.nombre] = b.id
  }

  // ─── Configuraciones de tasas ──────────────────────────────────────────────
  const tasasConfig = [
    { clave: 'tasa_solidario',   valor: '0.40', descripcion: 'Tasa grupo solidario' },
    { clave: 'tasa_individual',  valor: '0.30', descripcion: 'Tasa crédito individual' },
    { clave: 'tasa_fiduciario',  valor: '0.30', descripcion: 'Tasa crédito fiduciario' },
  ]
  for (const t of tasasConfig) {
    const existing = await prisma.companySetting.findFirst({
      where: { companyId: company.id, branchId: null, clave: t.clave },
    })
    if (!existing) {
      await prisma.companySetting.create({
        data: { companyId: company.id, ...t },
      })
    }
  }

  // ─── Helper: upsert usuario ────────────────────────────────────────────────
  async function upsertUser(data: {
    email: string
    nombre: string
    password: string
    rol: 'DIRECTOR_GENERAL' | 'DIRECTOR_COMERCIAL' | 'GERENTE_ZONAL' | 'COORDINADOR' | 'GERENTE' | 'COBRADOR'
    branchId?: string | null
    gerenteId?: string | null
    zonaBranchIds?: string[] | null
  }): Promise<string> {
    const existing = await prisma.user.findFirst({
      where: { companyId: company!.id, email: data.email },
    })
    if (existing) {
      // Actualizar campos que pueden haber cambiado (rol, gerenteId, zonaBranchIds)
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          rol: data.rol,
          nombre: data.nombre,
          branchId: data.branchId ?? null,
          gerenteId: data.gerenteId ?? null,
          zonaBranchIds: data.zonaBranchIds ?? Prisma.JsonNull,
          activo: true,
        },
      })
      return existing.id
    }
    const user = await prisma.user.create({
      data: {
        companyId: company!.id,
        rol: data.rol,
        nombre: data.nombre,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 12),
        branchId: data.branchId ?? null,
        gerenteId: data.gerenteId ?? null,
        zonaBranchIds: data.zonaBranchIds ?? Prisma.JsonNull,
        activo: true,
      },
    })
    console.log(`✅ ${data.rol}: ${data.email} / ${data.password}`)
    return user.id
  }

  // ─── DIRECTORES (sin sucursal fija, ven todo) ─────────────────────────────
  await upsertUser({
    email:    'stephanie.garcia@microkapital.com',
    nombre:   'Stephanie García Rosales',
    password: 'StephanieGR2026*',
    rol:      'DIRECTOR_GENERAL',
    branchId: null,
  })

  await upsertUser({
    email:    'miguel.ayala@microkapital.com',
    nombre:   'Miguel Ángel Ayala Moreno',
    password: 'MiguelAM2026*',
    rol:      'DIRECTOR_COMERCIAL',
    branchId: null,
  })

  // ─── GERENTES ZONALES ─────────────────────────────────────────────────────
  const cristinaId = await upsertUser({
    email:         'cristina.esquivel@microkapital.com',
    nombre:        'Cristina Berenice Esquivel García',
    password:      'CristinaEG2026*',
    rol:           'GERENTE_ZONAL',
    branchId:      branchMap['Tenancingo'],       // sucursal principal
    zonaBranchIds: [branchMap['Tenancingo']],
  })

  const hectorId = await upsertUser({
    email:         'hector.rodriguez@microkapital.com',
    nombre:        'Héctor Eulises Rodríguez Guzmán',
    password:      'HectorRG2026*',
    rol:           'GERENTE_ZONAL',
    branchId:      branchMap['Toluca'],           // sucursal principal
    zonaBranchIds: [branchMap['Toluca'], branchMap['San Mateo Atenco']],
  })

  const edgarId = await upsertUser({
    email:         'edgar.solis@microkapital.com',
    nombre:        'Edgar Solís Pérez',
    password:      'EdgarSP2026*',
    rol:           'GERENTE_ZONAL',
    branchId:      branchMap['Veracruz'],
    zonaBranchIds: [branchMap['Veracruz']],
  })

  // ─── COORDINADORES — TENANCINGO (Gerente: Cristina) ───────────────────────
  await upsertUser({
    email:     'jaime.estrada@microkapital.com',
    nombre:    'Jaime Alonso Estrada Reza',
    password:  'JaimeER2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['Tenancingo'],
    gerenteId: cristinaId,
  })
  await upsertUser({
    email:     'luis.rosales@microkapital.com',
    nombre:    'Luis Alberto Rosales Estrada',
    password:  'LuisRE2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['Tenancingo'],
    gerenteId: cristinaId,
  })
  await upsertUser({
    email:     'guadalupe.reza@microkapital.com',
    nombre:    'María Guadalupe Reza Rosales',
    password:  'GuadalupeRR2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['Tenancingo'],
    gerenteId: cristinaId,
  })

  // ─── COORDINADORES — TOLUCA (Gerente: Héctor) ────────────────────────────
  await upsertUser({
    email:     'guadalupe.castro@microkapital.com',
    nombre:    'Guadalupe Castro Cedillo',
    password:  'GuadalupeCC2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['Toluca'],
    gerenteId: hectorId,
  })
  await upsertUser({
    email:     'hugo.arias@microkapital.com',
    nombre:    'Hugo Abimael Arias Solís',
    password:  'HugoAS2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['Toluca'],
    gerenteId: hectorId,
  })
  await upsertUser({
    email:     'valentina.rodriguez@microkapital.com',
    nombre:    'Valentina Rodríguez Garduño',
    password:  'ValentinaRG2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['Toluca'],
    gerenteId: hectorId,
  })

  // ─── COORDINADORES — SAN MATEO ATENCO (Gerente: Héctor) ──────────────────
  await upsertUser({
    email:     'miguel.morales@microkapital.com',
    nombre:    'Miguel Ángel Morales Campos',
    password:  'MiguelMC2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['San Mateo Atenco'],
    gerenteId: hectorId,
  })

  // ─── COORDINADORES — VERACRUZ (Gerente: Edgar) ───────────────────────────
  await upsertUser({
    email:     'rosa.burgos@microkapital.com',
    nombre:    'Rosa Isaura Burgos Villanueva',
    password:  'RosaBV2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['Veracruz'],
    gerenteId: edgarId,
  })
  await upsertUser({
    email:     'paula.medina@microkapital.com',
    nombre:    'Paula Angélica Medina Rodríguez',
    password:  'PaulaMR2026*',
    rol:       'COORDINADOR',
    branchId:  branchMap['Veracruz'],
    gerenteId: edgarId,
  })

  // ─── Usuarios legacy (demo/test — mantener para compatibilidad) ───────────
  const legacyBranchId = branchMap['San Mateo Atenco']

  const legacyGerente = await prisma.user.findFirst({
    where: { companyId: company.id, email: 'gerente@microkapital.com' },
  })
  if (!legacyGerente) {
    await prisma.user.create({
      data: {
        companyId: company.id,
        branchId: legacyBranchId,
        rol: 'GERENTE',
        nombre: 'Demo Gerente',
        email: 'gerente@microkapital.com',
        passwordHash: await bcrypt.hash('Gerente2026!', 12),
        activo: true,
      },
    })
    console.log('✅ Legacy GERENTE: gerente@microkapital.com / Gerente2026!')
  }

  const legacyCobrador = await prisma.user.findFirst({
    where: { companyId: company.id, email: 'cobrador@microkapital.com' },
  })
  if (!legacyCobrador) {
    await prisma.user.create({
      data: {
        companyId: company.id,
        branchId: legacyBranchId,
        rol: 'COBRADOR',
        nombre: 'Demo Cobrador',
        email: 'cobrador@microkapital.com',
        passwordHash: await bcrypt.hash('Cobrador2026!', 12),
        activo: true,
      },
    })
    console.log('✅ Legacy COBRADOR: cobrador@microkapital.com / Cobrador2026!')
  }

  // ─── Clientes y préstamos de demo ─────────────────────────────────────────
  const cobrador = await prisma.user.findFirst({
    where: { companyId: company.id, email: 'cobrador@microkapital.com' },
  })

  if (cobrador) {
    const clientesDatos = [
      { nombre: 'Ana Luisa Reyes Sánchez',   telefono: '555-1001', score: 720 },
      { nombre: 'Rosa Elena Martínez Cruz',   telefono: '555-1002', score: 640 },
      { nombre: 'Carmen Jiménez Vega',        telefono: '555-1003', score: 500 },
    ]

    for (const cd of clientesDatos) {
      const existing = await prisma.client.findFirst({
        where: { companyId: company.id, nombreCompleto: cd.nombre },
      })
      if (!existing) {
        const client = await prisma.client.create({
          data: {
            companyId: company.id,
            branchId: legacyBranchId,
            cobradorId: cobrador.id,
            nombreCompleto: cd.nombre,
            telefono: cd.telefono,
            score: cd.score,
            activo: true,
          },
        })

        // Usuario portal cliente
        const clientUser = await prisma.user.create({
          data: {
            companyId: company.id,
            branchId: legacyBranchId,
            rol: 'CLIENTE',
            nombre: cd.nombre,
            email: `cliente${cd.telefono.replace(/[^0-9]/g, '')}@demo.com`,
            passwordHash: await bcrypt.hash('Cliente2026!', 12),
            activo: true,
          },
        })
        await prisma.client.update({
          where: { id: client.id },
          data: { userId: clientUser.id },
        })

        // Préstamo demo PENDING_APPROVAL
        await prisma.loan.create({
          data: {
            companyId: company.id,
            branchId: legacyBranchId,
            cobradorId: cobrador.id,
            clientId: client.id,
            tipo: 'INDIVIDUAL',
            estado: 'PENDING_APPROVAL',
            capital: 5000,
            comision: 850,
            montoReal: 4150,
            tasaInteres: 0.30,
            interes: 1500,
            totalPago: 6500,
            pagoSemanal: 541.67,
            plazo: 12,
            notas: 'Préstamo de prueba',
          },
        })

        console.log(`✅ Cliente demo: ${cd.nombre}`)
      }
    }
  }

  // ─── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed completado!\n')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  SUPER ADMIN')
  console.log(`  admin@sistema.dev                   Admin2026!`)
  console.log('───────────────────────────────────────────────────────────')
  console.log('  DIRECTORES')
  console.log(`  stephanie.garcia@microkapital.com   StephanieGR2026*  (Director General)`)
  console.log(`  miguel.ayala@microkapital.com       MiguelAM2026*     (Director Comercial)`)
  console.log('───────────────────────────────────────────────────────────')
  console.log('  GERENTES ZONALES')
  console.log(`  cristina.esquivel@microkapital.com  CristinaEG2026*   (Tenancingo)`)
  console.log(`  hector.rodriguez@microkapital.com   HectorRG2026*     (Toluca + San Mateo Atenco)`)
  console.log(`  edgar.solis@microkapital.com        EdgarSP2026*      (Veracruz)`)
  console.log('───────────────────────────────────────────────────────────')
  console.log('  COORDINADORES DE CRÉDITO')
  console.log(`  jaime.estrada@microkapital.com      JaimeER2026*      (Tenancingo)`)
  console.log(`  luis.rosales@microkapital.com       LuisRE2026*       (Tenancingo)`)
  console.log(`  guadalupe.reza@microkapital.com     GuadalupeRR2026*  (Tenancingo)`)
  console.log(`  guadalupe.castro@microkapital.com   GuadalupeCC2026*  (Toluca)`)
  console.log(`  hugo.arias@microkapital.com         HugoAS2026*       (Toluca)`)
  console.log(`  valentina.rodriguez@microkapital.com ValentinaRG2026* (Toluca)`)
  console.log(`  miguel.morales@microkapital.com     MiguelMC2026*     (San Mateo Atenco)`)
  console.log(`  rosa.burgos@microkapital.com        RosaBV2026*       (Veracruz)`)
  console.log(`  paula.medina@microkapital.com       PaulaMR2026*      (Veracruz)`)
  console.log('═══════════════════════════════════════════════════════════\n')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
