import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// PERF_LOG=true en Vercel env vars activa logging de queries con
// duración en cualquier entorno (dev o prod). Útil para encontrar
// cuellos de botella sin redeploy. Para apagar, borra la var o
// cámbiala a cualquier otro valor.
const perfLog = process.env.PERF_LOG === 'true'
// Umbral: solo loguea queries más lentas que esto (ms). Default 150ms.
// Para capturar todo: PERF_LOG_SLOW_MS=0
const slowMs = Number(process.env.PERF_LOG_SLOW_MS ?? 150)

function buildClient(): PrismaClient {
  if (perfLog) {
    const client = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(client as any).$on('query', (e: Prisma.QueryEvent) => {
      if (e.duration >= slowMs) {
        // Formato compacto: [PRISMA] 345ms SELECT "Payment".id FROM …
        const q = e.query.length > 200 ? e.query.slice(0, 200) + '…' : e.query
        console.log(`[PRISMA] ${e.duration}ms ${q}`)
      }
    })
    return client
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? buildClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
