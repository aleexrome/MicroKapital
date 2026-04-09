import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { UserRole } from '@prisma/client'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { auth, signIn, signOut, handlers } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      try {
        if (user) {
          const u = user as typeof user & {
            rol: UserRole
            companyId: string | null
            branchId: string | null
            zonaBranchIds: string[] | null
          }
          token.id = u.id as string
          token.rol = u.rol
          token.companyId = u.companyId ?? null
          token.branchId = u.branchId ?? null
          token.zonaBranchIds = u.zonaBranchIds ?? null
        }
      } catch (e) {
        console.error('[AUTH JWT CALLBACK ERROR]', e)
      }
      return token
    },
    async session({ session, token }) {
      try {
        if (token && session.user) {
          session.user.id = (token.id ?? '') as string
          session.user.rol = (token.rol ?? 'COBRADOR') as UserRole
          session.user.companyId = (token.companyId as string | null) ?? null
          session.user.branchId = (token.branchId as string | null) ?? null
          session.user.zonaBranchIds = (token.zonaBranchIds as string[] | null) ?? null
        }
      } catch (e) {
        console.error('[AUTH SESSION CALLBACK ERROR]', e)
      }
      return session
    },
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const user = await prisma.user.findFirst({
          where: { email, activo: true },
          include: {
            company: {
              include: { license: true },
            },
          },
        })

        if (!user) return null

        const validPassword = await bcrypt.compare(password, user.passwordHash)
        if (!validPassword) return null

        // Verificar licencia en tiempo de login (excepto SUPER_ADMIN)
        if (user.rol !== 'SUPER_ADMIN') {
          const license = user.company?.license
          if (!license || license.estado === 'CANCELLED') {
            return null
          }
        }

        // Actualizar último acceso (fire and forget)
        prisma.user.update({
          where: { id: user.id },
          data: { ultimoAcceso: new Date() },
        }).catch(() => {})

        return {
          id: user.id,
          email: user.email,
          name: user.nombre,
          rol: user.rol,
          companyId: user.companyId,
          branchId: user.branchId ?? null,
          zonaBranchIds: (user.zonaBranchIds as string[] | null) ?? null,
        }
      },
    }),
  ],
})
