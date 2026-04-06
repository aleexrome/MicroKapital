import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getToken } from 'next-auth/jwt'

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET, salt: 'authjs.session-token' })
    const session = await auth()
    return NextResponse.json({
      token: token ? { rol: token.rol, companyId: token.companyId, sub: token.sub } : null,
      session: session ? { rol: session.user?.rol, companyId: session.user?.companyId } : null,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
