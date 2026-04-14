import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('Alex74840616', 12)

  const updated = await prisma.user.update({
    where: { email: 'admin@sistema.dev' },
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
