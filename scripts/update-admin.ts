import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('Alex74840616', 12)

  const existing = await prisma.user.findFirst({ where: { email: 'admin@sistema.dev', rol: 'SUPER_ADMIN' } })
  if (!existing) throw new Error('Super admin no encontrado con email admin@sistema.dev')

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      email:        'alejandro.romero@microkapital.com',
      passwordHash: hash,
    },
    select: { email: true, rol: true },
  })

  console.log('✅ Credenciales actualizadas:', updated)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
