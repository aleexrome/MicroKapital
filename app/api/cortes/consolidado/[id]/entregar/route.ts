import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { crearNotificacion, getDirectoresIds } from '@/lib/notifications'
import { v2 as cloudinary } from 'cloudinary'
import { esReceptorFinal } from '@/lib/cortes'

export const maxDuration = 60

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * POST /api/cortes/consolidado/[id]/entregar
 *
 * La concentradora entrega su CONSOLIDADO a DG/DC. Debe mandar como
 * multipart/form-data:
 *   - receptorId:          id del DG/DC/SA destinatario
 *   - metodoEntregaFinal:  EFECTIVO_FIRMADO | TRANSFERENCIA
 *   - evidencia (archivo): si EFECTIVO_FIRMADO → foto del ticket firmado
 *                          por el DG/DC al recibir el efectivo;
 *                          si TRANSFERENCIA → foto del comprobante de la
 *                          transferencia bancaria.
 *
 * Después de entregar, el consolidado queda en ENTREGADO y DG/DC lo
 * confirma vía /api/cortes/consolidado/[id]/confirmar.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: userId, companyId } = session.user

  const corte = await prisma.corte.findFirst({
    where: { id: params.id, companyId: companyId! },
  })
  if (!corte) return NextResponse.json({ error: 'Consolidado no encontrado' }, { status: 404 })
  if (corte.userId !== userId) {
    return NextResponse.json({ error: 'No es tu consolidado' }, { status: 403 })
  }
  if (corte.tipo !== 'CONSOLIDADO') {
    return NextResponse.json({ error: 'No es un consolidado' }, { status: 400 })
  }
  if (corte.estado !== 'ABIERTO' && corte.estado !== 'RECHAZADO') {
    return NextResponse.json({
      error: `No se puede entregar un consolidado en estado ${corte.estado}`,
    }, { status: 400 })
  }

  const formData = await req.formData()
  const receptorId = formData.get('receptorId') as string | null
  const metodo     = formData.get('metodoEntregaFinal') as 'EFECTIVO_FIRMADO' | 'TRANSFERENCIA' | null
  const file       = formData.get('evidencia') as File | null

  if (!receptorId) return NextResponse.json({ error: 'receptorId requerido' }, { status: 400 })
  if (!metodo || !['EFECTIVO_FIRMADO', 'TRANSFERENCIA'].includes(metodo)) {
    return NextResponse.json({ error: 'metodoEntregaFinal inválido' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'Evidencia (foto) requerida' }, { status: 400 })

  // Validar receptor: debe ser DG/DC/SA activo de la misma empresa.
  const receptor = await prisma.user.findFirst({
    where: {
      id:        receptorId,
      companyId: companyId!,
      activo:    true,
    },
    select: { id: true, nombre: true, rol: true },
  })
  if (!receptor || !esReceptorFinal(receptor.rol)) {
    return NextResponse.json({ error: 'Receptor inválido — debe ser DG/DC/SA' }, { status: 400 })
  }

  // Subir evidencia a Cloudinary
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  let evidenciaUrl: string
  try {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `microkapital/cortes-consolidado/${metodo === 'TRANSFERENCIA' ? 'transferencias' : 'tickets-firmados'}`,
          public_id: `${corte.id}-${Date.now()}`,
          resource_type: 'image',
          type: 'upload',
          quality: 'auto',
          fetch_format: 'auto',
          transformation: [{ width: 1600, crop: 'limit' }],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'))
          resolve(result as { secure_url: string })
        }
      )
      stream.end(buffer)
    })
    evidenciaUrl = result.secure_url
  } catch (err) {
    console.error('[cortes/consolidado/entregar] cloudinary error:', err)
    const msg = err instanceof Error ? err.message : 'Error al subir evidencia'
    return NextResponse.json({ error: `No se pudo subir la evidencia: ${msg}` }, { status: 500 })
  }

  const ahora = new Date()
  await prisma.corte.update({
    where: { id: corte.id },
    data: {
      estado:               'ENTREGADO',
      receptorId:           receptor.id,
      metodoEntregaFinal:   metodo,
      ...(metodo === 'TRANSFERENCIA'
        ? { transferenciaFotoUrl: evidenciaUrl, transferenciaFotoAt: ahora }
        : { fotoTicketUrl:        evidenciaUrl, fotoTicketAt:        ahora }),
      entregadoAt:          ahora,
    },
  })

  createAuditLog({
    userId,
    accion: 'ENTREGAR_CONSOLIDADO',
    tabla:  'Corte',
    registroId: corte.id,
    valoresNuevos: {
      receptorId:         receptor.id,
      receptorNombre:     receptor.nombre,
      metodoEntregaFinal: metodo,
      totalAEntregar:     Number(corte.totalAEntregar),
    },
  })

  // Notificar al receptor
  try {
    await crearNotificacion(prisma, {
      companyId: companyId!,
      destinatariosIds: [receptor.id],
      tipo: 'CORTE_RECIBIDO',
      nivel: 'IMPORTANTE',
      titulo: `Consolidado del día — ${session.user.name}`,
      mensaje: `${session.user.name} te entregó el consolidado por $${Number(corte.totalAEntregar).toFixed(2)} vía ${metodo === 'TRANSFERENCIA' ? 'transferencia' : 'efectivo firmado'}. Confirma la recepción.`,
    })
  } catch (e) {
    console.error('[cortes/consolidado/entregar] notif failed:', e)
  }

  return NextResponse.json({ ok: true, estado: 'ENTREGADO' })
}
