'use server'

import { cookies } from 'next/headers'
import { decode } from 'next-auth/jwt'
import type { UserRole } from '@prisma/client'

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''
const COOKIE_NAME = 'authjs.session-token'

export interface SessionUser {
  id: string
  email: string
  name: string
  rol: UserRole
  companyId: string | null
  branchId: string | null
}

export interface AppSession {
  user: SessionUser
}

export async function getSession(): Promise<AppSession | null> {
  try {
    const cookieStore = cookies()
    const tokenValue = cookieStore.get(COOKIE_NAME)?.value
    if (!tokenValue) return null

    const decoded = await decode({ token: tokenValue, secret: SECRET, salt: COOKIE_NAME })
    if (!decoded?.sub) return null

    return {
      user: {
        id: decoded.sub as string,
        email: decoded.email as string,
        name: decoded.name as string,
        rol: decoded.rol as UserRole,
        companyId: (decoded.companyId as string | null) ?? null,
        branchId: (decoded.branchId as string | null) ?? null,
      },
    }
  } catch {
    return null
  }
}
