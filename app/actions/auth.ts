'use server'

import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'

export async function loginAction(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  try {
    await signIn('credentials', {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      redirectTo: '/dashboard',
    })
  } catch (error) {
    // NextAuth throws a NEXT_REDIRECT for successful redirects — re-lanzar
    if ((error as Error).message?.includes('NEXT_REDIRECT')) {
      throw error
    }
    if (error instanceof AuthError) {
      return { error: 'Credenciales incorrectas. Verifica tu email y contraseña.' }
    }
    return { error: 'Credenciales incorrectas. Verifica tu email y contraseña.' }
  }
  return { error: null }
}
