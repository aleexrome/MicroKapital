'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function logoutAction() {
  cookies().delete('authjs.session-token')
  cookies().delete('authjs.callback-url')
  redirect('/login')
}
