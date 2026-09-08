import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { armarNombreCompleto, armarDomicilioLibre } from '@/lib/persona-address'

const updateAvalSchema = z.object({
  avalNombre:             z.string().optional().nullable(),
  avalNombres:            z.string().optional().nullable(),
  avalApellidoPaterno:    z.string().optional().nullable(),
  avalApellidoMaterno:    z.string().optional().nullable(),
  avalTelefono:           z.string().optional().nullable(),
  avalTelefonoAlt:        z.string().optional().nullable(),
  avalDireccion:          z.string().optional().nullable(),
  avalDomicilioCalle:     z.string().optional().nullable(),
  avalDomicilioNumExt:    z.string().optional().nullable(),
  avalDomicilioNumInt:    z.string().optional().nullable(),
  avalDomicilioColonia:   z.string().optional().nullable(),
  avalDomicilioMunicipio: z.string().optional().nullable(),
  avalDomicilioEstado:    z.string().optional().nullable(),
  avalDomicilioCP:        z.string().optional().nullable(),
  avalRelacion:           z.string().optional().nullable(),
})

/**
 * PATCH /api/loans/[id]/aval
 *
 * Actualiza unicamente los campos del aval (nombre, telefono principal,
 * telefono alterno, direccion, relacion). Cualquier rol autenticado puede
 * llamarlo porque este dato alimenta el sistema de recordatorios
 * automaticos por voz: la cobradora en campo a veces captura o corrige
 * el contacto del aval sobre la marcha, sobre todo en creditos viejos /
 * renovados que se quedaron sin aval registrado. Si el telefono principal
 * no contesta, la IA intenta con el alterno, y la direccion es el fallback
 * para visita en campo. Los demas campos del prestamo (capital, plazo,
 * etc.) NO se tocan aqui.
 *
 * Solo aplica a INDIVIDUAL y FIDUCIARIO -- son los productos con aval.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { companyId, id: userId } = session.user

  const loan = await prisma.loan.findFirst({
    where: { id: params.id, companyId: companyId! },
    select: {
      id: true,
      tipo: true,
      avalNombre: true,
      avalNombres: true,
      avalApellidoPaterno: true,
      avalApellidoMaterno: true,
      avalTelefono: true,
      avalTelefonoAlt: true,
      avalDireccion: true,
      avalDomicilioCalle: true,
      avalDomicilioNumExt: true,
      avalDomicilioNumInt: true,
      avalDomicilioColonia: true,
      avalDomicilioMunicipio: true,
      avalDomicilioEstado: true,
      avalDomicilioCP: true,
      avalRelacion: true,
    },
  })
  if (!loan) {
    return NextResponse.json({ error: 'Prestamo no encontrado' }, { status: 404 })
  }
  if (loan.tipo !== 'INDIVIDUAL' && loan.tipo !== 'FIDUCIARIO') {
    return NextResponse.json(
      { error: 'Solo los creditos INDIVIDUAL y FIDUCIARIO tienen aval' },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = updateAvalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  // Normalizacion: nombres y relacion en MAYUSCULAS + trim; telefonos y
  // direccion solo trim (la direccion puede llevar minusculas/numeros).
  const update: Record<string, unknown> = {}
  // Descomposicion del nombre del aval — mismo patron que Client.
  const hayNombreSubcampo = data.avalNombres !== undefined
    || data.avalApellidoPaterno !== undefined
    || data.avalApellidoMaterno !== undefined
  if (hayNombreSubcampo) {
    const nombres         = ((data.avalNombres         ?? loan.avalNombres         ?? '') || '').trim().toUpperCase() || null
    const apellidoPaterno = ((data.avalApellidoPaterno ?? loan.avalApellidoPaterno ?? '') || '').trim().toUpperCase() || null
    const apellidoMaterno = ((data.avalApellidoMaterno ?? loan.avalApellidoMaterno ?? '') || '').trim().toUpperCase() || null
    update.avalNombres = nombres
    update.avalApellidoPaterno = apellidoPaterno
    update.avalApellidoMaterno = apellidoMaterno
    const armado = armarNombreCompleto({ nombres, apellidoPaterno, apellidoMaterno })
    if (armado) update.avalNombre = armado
  } else if (data.avalNombre !== undefined) {
    const v = (data.avalNombre ?? '').trim().toUpperCase()
    update.avalNombre = v === '' ? null : v
  }
  if (data.avalTelefono !== undefined) {
    const v = (data.avalTelefono ?? '').trim()
    update.avalTelefono = v === '' ? null : v
  }
  if (data.avalTelefonoAlt !== undefined) {
    const v = (data.avalTelefonoAlt ?? '').trim()
    update.avalTelefonoAlt = v === '' ? null : v
  }
  // Descomposicion del domicilio del aval.
  const hayDomSubcampo = data.avalDomicilioCalle !== undefined
    || data.avalDomicilioNumExt !== undefined
    || data.avalDomicilioNumInt !== undefined
    || data.avalDomicilioColonia !== undefined
    || data.avalDomicilioMunicipio !== undefined
    || data.avalDomicilioEstado !== undefined
    || data.avalDomicilioCP !== undefined
  if (hayDomSubcampo) {
    const dCalle     = ((data.avalDomicilioCalle     ?? loan.avalDomicilioCalle     ?? '') || '').trim().toUpperCase() || null
    const dNumExt    = ((data.avalDomicilioNumExt    ?? loan.avalDomicilioNumExt    ?? '') || '').trim().toUpperCase() || null
    const dNumInt    = ((data.avalDomicilioNumInt    ?? loan.avalDomicilioNumInt    ?? '') || '').trim().toUpperCase() || null
    const dColonia   = ((data.avalDomicilioColonia   ?? loan.avalDomicilioColonia   ?? '') || '').trim().toUpperCase() || null
    const dMunicipio = ((data.avalDomicilioMunicipio ?? loan.avalDomicilioMunicipio ?? '') || '').trim().toUpperCase() || null
    const dEstado    = ((data.avalDomicilioEstado    ?? loan.avalDomicilioEstado    ?? '') || '').trim().toUpperCase() || null
    const dCP        = ((data.avalDomicilioCP        ?? loan.avalDomicilioCP        ?? '') || '').trim() || null
    update.avalDomicilioCalle     = dCalle
    update.avalDomicilioNumExt    = dNumExt
    update.avalDomicilioNumInt    = dNumInt
    update.avalDomicilioColonia   = dColonia
    update.avalDomicilioMunicipio = dMunicipio
    update.avalDomicilioEstado    = dEstado
    update.avalDomicilioCP        = dCP
    const armado = armarDomicilioLibre({
      calle: dCalle, numExt: dNumExt, numInt: dNumInt,
      colonia: dColonia, municipio: dMunicipio, estado: dEstado, cp: dCP,
    })
    if (armado) update.avalDireccion = armado
  } else if (data.avalDireccion !== undefined) {
    const v = (data.avalDireccion ?? '').trim()
    update.avalDireccion = v === '' ? null : v
  }
  if (data.avalRelacion !== undefined) {
    const v = (data.avalRelacion ?? '').trim().toUpperCase()
    update.avalRelacion = v === '' ? null : v
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No hay cambios que aplicar' }, { status: 400 })
  }

  await prisma.loan.update({
    where: { id: params.id },
    data: update,
  })

  createAuditLog({
    userId,
    accion: 'UPDATE_AVAL',
    tabla: 'Loan',
    registroId: params.id,
    valoresAnteriores: {
      avalNombre:      loan.avalNombre,
      avalTelefono:    loan.avalTelefono,
      avalTelefonoAlt: loan.avalTelefonoAlt,
      avalDireccion:   loan.avalDireccion,
      avalRelacion:    loan.avalRelacion,
    },
    valoresNuevos: update,
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
