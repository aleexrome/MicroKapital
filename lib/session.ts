'use server'

import { cookies } from 'next/headers'
import { decode } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'
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

    // Refresca de BD los campos que pueden cambiar después del login.
    // Sin esto, modificaciones en BD (zonaBranchIds, rol, branchId,
    // permisoAplicarPagos) no se reflejan hasta que el usuario cierre y
    // vuelva a abrir sesión. Caso real: Edgar Solís — DG le agregó
    // sucursales pero la app seguía mostrando solo Veracruz porque el
    // JWT tenía la versión vieja.
    //
    // Costo: una query findUnique por id en cada render de Server
    // Component que llama getSession(). Es el patrón que ya usa el
    // layout para zonaBranchIds — aquí lo aplicamos al resto.
    let fresh: {
      rol: UserRole
      branchId: string | null
      zonaBranchIds: unknown
      permisoAplicarPagos: boolean
      activo: boolean
    } | null = null
    try {
      fresh = await prisma.user.findUnique({
        where: { id: decoded.sub as string },
        select: {
          rol: true,
          branchId: true,
          zonaBranchIds: true,
          permisoAplicarPagos: true,
          activo: true,
        },
      })
    } catch {
      // Si la BD falla por algún motivo, caemos al JWT — mejor que
      // mostrar pantalla en blanco.
    }

    // Usuario desactivado → invalidamos la sesión
    if (fresh && !fresh.activo) return null

    return {
      user: {
        id: decoded.sub as string,
        email: decoded.email as string,
        name: decoded.name as string,
        rol: (fresh?.rol ?? decoded.rol) as UserRole,
        companyId: (decoded.companyId as string | null) ?? null,
        branchId: fresh ? fresh.branchId : ((decoded.branchId as string | null) ?? null),
        zonaBranchIds: fresh
          ? (Array.isArray(fresh.zonaBranchIds) ? (fresh.zonaBranchIds as string[]) : null)
          : ((decoded.zonaBranchIds as string[] | null) ?? null),
        permisoAplicarPagos: fresh
          ? fresh.permisoAplicarPagos
          : ((decoded.permisoAplicarPagos as boolean | null) ?? false),
      },
    }
  } catch {
    return null
  }
}

