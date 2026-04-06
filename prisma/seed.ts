import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { addDays, addWeeks } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // ─── Super Admin (sistema — no pertenece a ninguna empresa) ───────────────
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@sistema.dev'

  // Empresa ficticia para el super admin (necesaria por restricción de FK)
  let superAdminCompany = await prisma.company.findFirst({
    where: { nombre: '__SYSTEM__' },
  })

  if (!superAdminCompany) {
    superAdminCompany = await prisma.company.create({
      data: {
        nombre: '__SYSTEM__',
        activa: false,
      },
    })
  }

  const existingSuperAdmin = await prisma.user.findFirst({
    where: { email: superAdminEmail },
  })

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
    console.log(`✅ Super Admin creado: ${superAdminEmail} / Admin2026!`)
  }

  // ─── Empresa cliente demo ─────────────────────────────────────────────────
  let company = await prisma.company.findFirst({
    where: { nombre: 'MicroKapital Financiera' },
  })

  if (!company) {
    company = await prisma.company.create({
      data: {
        nombre: 'MicroKapital Financiera',
        telefono: '555-0100',
        email: 'contacto@demofinanciera.com',
        direccion: 'Av. Principal 123, Ciudad de México',
        activa: true,
      },
    })
    console.log('✅ Empresa creada: MicroKapital Financiera')
  }

  // Licencia
  const existingLicense = await prisma.license.findUnique({
    where: { companyId: company.id },
  })

  if (!existingLicense) {
    await prisma.license.create({
      data: {
        companyId: company.id,
        claveLicencia: 'LIC-DEMO-2026-001',
        estado: 'ACTIVE',
        precioMensual: 2500,
        diaCobro: 1,
        proximoPago: addDays(new Date(), 30),
        notasInternas: 'Licencia de prueba/demo',
      },
    })
    console.log('✅ Licencia creada: LIC-DEMO-2026-001')
  }

  // Sucursal
  let branch = await prisma.branch.findFirst({
    where: { companyId: company.id, nombre: 'Sucursal Centro' },
  })

  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        nombre: 'Sucursal Centro',
        direccion: 'Calle 5 de Mayo 10, Centro',
        telefono: '555-0101',
        activa: true,
      },
    })
    console.log('✅ Sucursal creada: Sucursal Centro')
  }

  // ─── Configuraciones de tasas ──────────────────────────────────────────────
  // Prisma unique constraint with optional null field — use findFirst + upsert workaround
  const existingTasaSol = await prisma.companySetting.findFirst({
    where: { companyId: company.id, branchId: null, clave: 'tasa_solidario' },
  })
  if (!existingTasaSol) {
    await prisma.companySetting.create({
      data: { companyId: company.id, clave: 'tasa_solidario', valor: '0.40', descripcion: 'Tasa de interés para grupo solidario' },
    })
  }

  const existingTasaInd = await prisma.companySetting.findFirst({
    where: { companyId: company.id, branchId: null, clave: 'tasa_individual' },
  })
  if (!existingTasaInd) {
    await prisma.companySetting.create({
      data: { companyId: company.id, clave: 'tasa_individual', valor: '0.30', descripcion: 'Tasa de interés para crédito individual' },
    })
  }

  // ─── Usuarios ─────────────────────────────────────────────────────────────
  const usersToCreate = [
    {
      rol: 'GERENTE' as const,
      nombre: 'María García López',
      email: 'gerente@microkapital.com',
      password: 'Gerente2026!',
      branchId: branch.id,
    },
    {
      rol: 'COBRADOR' as const,
      nombre: 'Miguel Morales Torres',
      email: 'cobrador@microkapital.com',
      password: 'Cobrador2026!',
      branchId: branch.id,
    },
  ]

  const createdUsers: Record<string, typeof usersToCreate[0] & { id: string }> = {}

  for (const userData of usersToCreate) {
    const existing = await prisma.user.findFirst({
      where: { companyId: company.id, email: userData.email },
    })
    if (!existing) {
      const user = await prisma.user.create({
        data: {
          companyId: company.id,
          branchId: userData.branchId,
          rol: userData.rol,
          nombre: userData.nombre,
          email: userData.email,
          passwordHash: await bcrypt.hash(userData.password, 12),
          activo: true,
        },
      })
      createdUsers[userData.rol] = { ...userData, id: user.id }
      console.log(`✅ Usuario ${userData.rol}: ${userData.email} / ${userData.password}`)
    }
  }

  // ─── Clientes de prueba ────────────────────────────────────────────────────
  const cobrador = await prisma.user.findFirst({
    where: { companyId: company.id, rol: 'COBRADOR' },
  })

  if (!cobrador) {
    console.log('⚠️ No hay cobrador, omitiendo clientes de prueba')
    return
  }

  const clientesDatos = [
    { nombre: 'Ana Luisa Reyes Sánchez', telefono: '555-1001', score: 720 },
    { nombre: 'Rosa Elena Martínez Cruz', telefono: '555-1002', score: 640 },
    { nombre: 'Carmen Jiménez Vega', telefono: '555-1003', score: 500 },
  ]

  for (const cd of clientesDatos) {
    const existing = await prisma.client.findFirst({
      where: { companyId: company.id, nombreCompleto: cd.nombre },
    })
    if (!existing) {
      const client = await prisma.client.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          cobradorId: cobrador.id,
          nombreCompleto: cd.nombre,
          telefono: cd.telefono,
          score: cd.score,
          activo: true,
        },
      })

      // Crear usuario CLIENTE para el portal
      const clientUser = await prisma.user.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
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

      // Crear préstamo de prueba en PENDING_APPROVAL
      await prisma.loan.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          cobradorId: cobrador.id,
          clientId: client.id,
          tipo: 'INDIVIDUAL',
          estado: 'PENDING_APPROVAL',
          capital: 5000,
          comision: 850,       // 17% de 5000
          montoReal: 4150,     // 5000 - 850
          tasaInteres: 0.30,
          interes: 1500,       // 5000 * 0.30
          totalPago: 6500,     // 5000 + 1500
          pagoSemanal: 541.67, // 6500 / 12
          plazo: 12,
          notas: 'Préstamo de prueba - pendiente de aprobación',
        },
      })

      console.log(`✅ Cliente: ${cd.nombre}`)
    }
  }

  console.log('\n🎉 Seed completado exitosamente!\n')
  console.log('Credenciales de acceso:')
  console.log('  Super Admin:  admin@sistema.dev / Admin2026!')
  console.log('  Gerente:      gerente@microkapital.com  / Gerente2026!')
  console.log('  Cobrador:     cobrador@microkapital.com / Cobrador2026!')
  console.log('  Portal URL:   /sys-mnt-9x7k/panel (solo super admin)')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
