import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    // 1. JWT crudo (con __Secure- si HTTPS, sin prefijo si HTTP)
    let token = await getToken({
      req,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
      salt: '__Secure-authjs.session-token',
    })
    if (!token) {
      token = await getToken({
        req,
        secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
        salt: 'authjs.session-token',
      })
    }

    // 2. Sesión vía auth() (NextAuth) y vía getSession() (custom)
    const nextAuthSession = await auth()
    const customSession = await getSession()

    // 3. Registro real en BD para comparar contra el JWT
    const dbUser = token?.sub
      ? await prisma.user.findUnique({
          where: { id: token.sub as string },
          select: {
            id: true,
            email: true,
            rol: true,
            branchId: true,
            zonaBranchIds: true,
            permisoAplicarPagos: true,
          },
        })
      : null

    return NextResponse.json({
      jwt: token
        ? {
            sub: token.sub,
            email: token.email,
            rol: token.rol,
            branchId: token.branchId,
            zonaBranchIds: token.zonaBranchIds,
            permisoAplicarPagos: token.permisoAplicarPagos,
          }
        : null,
      nextAuthSession: nextAuthSession?.user
        ? {
            rol: nextAuthSession.user.rol,
            branchId: nextAuthSession.user.branchId,
            zonaBranchIds: nextAuthSession.user.zonaBranchIds,
          }
        : null,
      customSession: customSession?.user
        ? {
            rol: customSession.user.rol,
            branchId: customSession.user.branchId,
            zonaBranchIds: customSession.user.zonaBranchIds,
            permisoAplicarPagos: customSession.user.permisoAplicarPagos,
          }
        : null,
      dbUser,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
