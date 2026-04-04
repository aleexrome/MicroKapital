import type { LicenseCheckResult } from '@/types'

// Cache en memoria para reducir llamadas a la BD (TTL: 60 segundos)
const licenseCache = new Map<string, { result: LicenseCheckResult; expiresAt: number }>()
const CACHE_TTL_MS = 60 * 1000

/**
 * Verifica el estado de la licencia de una empresa.
 * Compatible con Edge Runtime — usa fetch en lugar de Prisma directamente.
 *
 * En el middleware, se usa NEXTAUTH_URL como base para la llamada interna.
 */
export async function checkLicense(companyId: string): Promise<LicenseCheckResult> {
  // Revisar cache primero
  const cached = licenseCache.get(companyId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/internal/license-check?companyId=${companyId}`, {
      cache: 'no-store',
      headers: {
        'x-internal-secret': process.env.NEXTAUTH_SECRET ?? '',
      },
    })

    if (!res.ok) {
      // Si falla la verificación, permitir acceso por defecto (fail open)
      return { allowed: true, status: 'ACTIVE', isGrace: false }
    }

    const data = (await res.json()) as LicenseCheckResult

    // Guardar en cache
    licenseCache.set(companyId, {
      result: data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })

    return data
  } catch {
    // Fail open: si hay error de red, permitir acceso
    return { allowed: true, status: 'ACTIVE', isGrace: false }
  }
}

/**
 * Invalida el cache de licencia para una empresa específica
 * (llamar después de cambiar el estado de una licencia)
 */
export function invalidateLicenseCache(companyId: string): void {
  licenseCache.delete(companyId)
}
