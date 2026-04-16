'use server'

import { cookies } from 'next/headers'
import { decode } from 'next-auth/jwt'
import type { UserRole } from '@prisma/client'

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''
// En producción (HTTPS) NextAuth usa el prefijo __Secure-
const COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token']

export interface SessionUser {
  id: string
  email: string
  name: string
  rol: UserRole
  companyId: string | null
  branchId: string | null
  zonaBranchIds?: string[] | null
  permisoAplicarPagos?: boolean
}

export interface AppSession {
  user: SessionUser
}

export async function getSession(): Promise<AppSession | null> {
  try {
    const cookieStore = cookies()
    let tokenValue: string | undefined
    let usedCookieName = COOKIE_NAMES[0]
    for (const name of COOKIE_NAMES) {
      const val = cookieStore.get(name)?.value
      if (val) { tokenValue = val; usedCookieName = name; break }
    }
    if (!tokenValue) return null

    const decoded = await decode({ token: tokenValue, secret: SECRET, salt: usedCookieName })
    if (!decoded?.sub) return null

    return {
      user: {
        id: decoded.sub as string,
        email: decoded.email as string,
        name: decoded.name as string,
        rol: decoded.rol as UserRole,
        companyId: (decoded.companyId as string | null) ?? null,
        branchId: (decoded.branchId as string | null) ?? null,
        zonaBranchIds: (decoded.zonaBranchIds as string[] | null) ?? null,
        permisoAplicarPagos: (decoded.permisoAplicarPagos as boolean | null) ?? false,
      },
    }
  } catch {
    return null
  }
}
