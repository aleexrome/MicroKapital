import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function RootPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.rol === 'SUPER_ADMIN') {
    redirect('/sys-mnt-9x7k/panel')
  }

  if (session.user.rol === 'CLIENTE') {
    redirect('/mi-cuenta')
  }

  redirect('/dashboard')
}
