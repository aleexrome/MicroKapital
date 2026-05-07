import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { renderToBuffer } from '@react-pdf/renderer'
import { TestPdfDocument } from '@/lib/contracts/pdf/TestPdfDocument'

/**
 * Endpoint de prueba — solo SUPER_ADMIN.
 *
 * Genera un PDF dummy con la BaseTemplate para validar visualmente
 * el header con logo, márgenes, footer dinámico y tipografía. No
 * persiste nada y no toca la base de datos.
 *
 * Probar abriendo: /api/contracts/test-pdf
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (session.user.rol !== 'SUPER_ADMIN' && session.user.rol !== 'DIRECTOR_GENERAL') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const buffer = await renderToBuffer(<TestPdfDocument />)

  // Buffer (Node) → Uint8Array para que NextResponse lo acepte como BodyInit en TS estricto.
  const body = new Uint8Array(buffer)

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="test-microkapital.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
