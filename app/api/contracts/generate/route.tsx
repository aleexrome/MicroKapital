import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { v2 as cloudinary } from 'cloudinary'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'

import { ContratoSolidario }   from '@/lib/contracts/pdf/ContratoSolidario'
import { ContratoIndividual }  from '@/lib/contracts/pdf/ContratoIndividual'
import { ContratoAgil }        from '@/lib/contracts/pdf/ContratoAgil'
import { ControlPagosSolidario } from '@/lib/contracts/pdf/ControlPagosSolidario'
import { ControlPagosIndividual } from '@/lib/contracts/pdf/ControlPagosIndividual'
import { ControlPagosAgil }      from '@/lib/contracts/pdf/ControlPagosAgil'
import { SolicitudCredito, type SolicitudCreditoIntegrante } from '@/lib/contracts/pdf/SolicitudCredito'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const generateSchema = z.object({
  loanId: z.string().uuid(),
})

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'COORDINADOR', 'GERENTE_ZONAL', 'DIRECTOR_GENERAL'] as const

/**
 * POST /api/contracts/generate
 * Body: { loanId: string }
 *
 * Genera el paquete de contrato (Solicitud + Contrato/Pagaré + Control de Pagos)
 * para un Loan en estado APPROVED. El PDF se sube a Cloudinary y se persiste un
 * registro en `Contract` (más `ContractGroupMember[]` para SOLIDARIO).
 *
 * NO se engancha aún a la UI ni al activate. Sirve para validar visualmente
 * que el output es fiel a las plantillas físicas.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(ROLES_PERMITIDOS as readonly string[]).includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos para generar contratos' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { loanId } = parsed.data
  const { companyId, id: userId } = session.user

  // ── 1. Cargar el préstamo con relaciones ───────────────────────────────────
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, companyId: companyId! },
    include: {
      client: true,
      cobrador: { select: { id: true, nombre: true } },
      branch: { select: { id: true, nombre: true } },
      loanGroup: true,
      schedule: { orderBy: { numeroPago: 'asc' } },
    },
  })

  if (!loan) {
    return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
  }
  if (loan.estado !== 'APPROVED') {
    return NextResponse.json(
      { error: 'El préstamo debe estar en estado APPROVED para generar contrato' },
      { status: 400 }
    )
  }

  // FIDUCIARIO no soportado en v1
  if (loan.tipo === 'FIDUCIARIO') {
    return NextResponse.json(
      { error: 'El producto FIDUCIARIO no tiene plantilla en v1. Pendiente para fase posterior.' },
      { status: 400 }
    )
  }

  // ── 2. Verificar configs ──────────────────────────────────────────────────
  const [companyConfig, branchConfig] = await Promise.all([
    prisma.companyContractConfig.findUnique({ where: { companyId: companyId! } }),
    prisma.branchContractConfig.findUnique({ where: { branchId: loan.branchId } }),
  ])

  if (!companyConfig) {
    return NextResponse.json(
      { error: 'Falta configurar la empresa en /admin/contratos-config' },
      { status: 400 }
    )
  }
  if (!branchConfig) {
    return NextResponse.json(
      { error: `Falta configurar la sucursal "${loan.branch.nombre}" en /admin/contratos-config` },
      { status: 400 }
    )
  }

  // ── 3. Determinar si es solidario y resolver el "loan ancla" del contrato ─
  let anchorLoanId = loan.id
  type LoanLite = { id: string; clientId: string; capital: { toString: () => string }; pagoSemanal: { toString: () => string } | null; createdAt: Date; client: { id: string; nombreCompleto: string } }
  let groupLoans: LoanLite[] = []

  if (loan.tipo === 'SOLIDARIO') {
    if (!loan.loanGroupId) {
      return NextResponse.json(
        { error: 'Préstamo solidario sin grupo asignado' },
        { status: 400 }
      )
    }
    groupLoans = await prisma.loan.findMany({
      where: {
        loanGroupId: loan.loanGroupId,
        estado: { in: ['APPROVED', 'ACTIVE'] },
      },
      include: { client: { select: { id: true, nombreCompleto: true } } },
      orderBy: { createdAt: 'asc' },
    }) as unknown as LoanLite[]

    if (groupLoans.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron préstamos del grupo' },
        { status: 400 }
      )
    }
    // TODO: cuando exista un flag explícito de coordinadora, usarlo. Por ahora
    // la coordinadora es el primer loan del grupo por createdAt.
    anchorLoanId = groupLoans[0].id
  }

  // ── 4. Ver si ya existe un Contract para el ancla ────────────────────────
  const existing = await prisma.contract.findUnique({
    where: { loanId: anchorLoanId },
  })
  if (existing) {
    return NextResponse.json(
      {
        error: 'Ya existe un contrato generado para este préstamo/grupo',
        contractId: existing.id,
        numeroContrato: existing.numeroContrato,
        pdfUrl: existing.pdfGeneradoUrl,
      },
      { status: 409 }
    )
  }

  // ── 5. Generar folio (transacción atómica + auto-reset de año) ───────────
  const currentYear = new Date().getFullYear()
  const nuevoFolio = await prisma.$transaction(async (tx) => {
    const fresh = await tx.branchContractConfig.findUnique({
      where: { branchId: loan.branchId },
    })
    if (!fresh) throw new Error('BranchContractConfig desapareció')

    let nextYear   = fresh.folioYear
    let nextNumber = fresh.folioLastNumber + 1
    if (fresh.folioYear < currentYear) {
      nextYear   = currentYear
      nextNumber = 1
    }
    await tx.branchContractConfig.update({
      where: { branchId: loan.branchId },
      data: { folioYear: nextYear, folioLastNumber: nextNumber },
    })
    return { year: nextYear, number: nextNumber, codigoSucursal: fresh.codigoSucursal }
  })

  const numeroContrato = `MK-${nuevoFolio.codigoSucursal}-${nuevoFolio.year}-${String(nuevoFolio.number).padStart(5, '0')}`

  // ── 6. Construir datos del PDF ────────────────────────────────────────────
  const fechaFirma  = new Date()
  const fechaInicio = loan.fechaPrimerPago ?? loan.schedule[0]?.fechaVencimiento ?? loan.fechaDesembolso ?? fechaFirma
  const fechaTermino = loan.schedule[loan.schedule.length - 1]?.fechaVencimiento ?? fechaInicio
  const fechasPagos  = loan.schedule.map((s) => s.fechaVencimiento)

  // Datos para Solicitud
  let solicitudIntegrantes: SolicitudCreditoIntegrante[] = []
  let solicitudTotal = 0
  let solicitudPactado = 0
  let solicitudPactadoFreq: 'SEMANAL' | 'DIARIO' = 'SEMANAL'
  let nombreGrupo: string | undefined

  if (loan.tipo === 'SOLIDARIO') {
    nombreGrupo = loan.loanGroup?.nombre ?? 'GRUPO'
    solicitudIntegrantes = groupLoans.map((gl, idx) => ({
      rol: idx === 0 ? 'Coordinadora' : 'Integrante',
      numero: idx + 1,
      nombre: gl.client.nombreCompleto,
      montoSolicitado: Number(gl.capital),
    }))
    solicitudTotal   = groupLoans.reduce((s, gl) => s + Number(gl.capital), 0)
    solicitudPactado = groupLoans.reduce((s, gl) => s + Number(gl.pagoSemanal ?? 0), 0)
    solicitudPactadoFreq = 'SEMANAL'
  } else {
    const avalNombre = loan.avalNombre ?? 'POR DEFINIR'
    solicitudIntegrantes = [
      { rol: 'Cliente', numero: 1, nombre: loan.client.nombreCompleto, montoSolicitado: Number(loan.capital) },
      { rol: 'Aval',    numero: 2, nombre: avalNombre, montoSolicitado: 0 },
    ]
    solicitudTotal   = Number(loan.capital)
    if (loan.tipo === 'AGIL') {
      solicitudPactado = Number(loan.pagoDiario ?? 0)
      solicitudPactadoFreq = 'DIARIO'
    } else {
      solicitudPactado = Number(loan.pagoSemanal ?? 0)
      solicitudPactadoFreq = 'SEMANAL'
    }
  }

  // ── 7. Render del PDF compuesto ──────────────────────────────────────────
  const cat = Number(companyConfig.cat)
  const interesMoratorio = Number(companyConfig.interesMoratorio)
  const representanteLegal = companyConfig.representanteLegal
  const ciudadFirma = branchConfig.ciudad
  const diaCobro = branchConfig.diaCobro
  const horaLimiteCobro = branchConfig.horaLimiteCobro

  let pdfDocument: React.ReactElement

  if (loan.tipo === 'SOLIDARIO') {
    const integrantesTabla = groupLoans.map((gl) => ({
      nombre: gl.client.nombreCompleto,
      monto:  Number(gl.capital),
    }))
    const integrantesControl = groupLoans.map((gl, idx) => ({
      nombre: gl.client.nombreCompleto,
      esCoordinadora: idx === 0,
      monto: Number(gl.capital),
      pago:  Number(gl.pagoSemanal ?? 0),
    }))

    pdfDocument = (
      <Document>
        <SolicitudCredito
          tipoCredito="SOLIDARIO"
          nombreGrupo={nombreGrupo}
          nombreSucursal={loan.branch.nombre}
          coordinador={loan.cobrador.nombre}
          fecha={fechaFirma}
          integrantes={solicitudIntegrantes}
          total={solicitudTotal}
          pactado={solicitudPactado}
          pactadoFrecuencia={solicitudPactadoFreq}
        />
        <ContratoSolidario
          numeroContrato={numeroContrato}
          nombreGrupo={nombreGrupo!}
          integrantes={integrantesTabla}
          montoTotal={solicitudTotal}
          plazoSemanas={8}
          fechaFirma={fechaFirma}
          representanteLegal={representanteLegal}
          ciudadFirma={ciudadFirma}
          cat={cat}
          interesMoratorio={interesMoratorio}
        />
        <ControlPagosSolidario
          nombreGrupo={nombreGrupo!}
          nombreSucursal={loan.branch.nombre}
          fechaInicio={fechaInicio}
          fechaTermino={fechaTermino}
          diaCobro={diaCobro}
          horaLimiteCobro={horaLimiteCobro}
          integrantes={integrantesControl}
          fechasPagos={fechasPagos}
        />
      </Document>
    )
  } else if (loan.tipo === 'INDIVIDUAL') {
    const avalNombre = loan.avalNombre ?? 'POR DEFINIR'
    pdfDocument = (
      <Document>
        <SolicitudCredito
          tipoCredito="INDIVIDUAL"
          nombreSucursal={loan.branch.nombre}
          coordinador={loan.cobrador.nombre}
          fecha={fechaFirma}
          integrantes={solicitudIntegrantes}
          total={solicitudTotal}
          pactado={solicitudPactado}
          pactadoFrecuencia="SEMANAL"
        />
        <ContratoIndividual
          numeroContrato={numeroContrato}
          cliente={{ nombre: loan.client.nombreCompleto, monto: Number(loan.capital) }}
          aval={{ nombre: avalNombre }}
          montoTotal={Number(loan.capital)}
          fechaFirma={fechaFirma}
          representanteLegal={representanteLegal}
          ciudadFirma={ciudadFirma}
          cat={cat}
          interesMoratorio={interesMoratorio}
        />
        <ControlPagosIndividual
          nombreSucursal={loan.branch.nombre}
          fechaInicio={fechaInicio}
          fechaTermino={fechaTermino}
          diaCobro={diaCobro}
          horaLimiteCobro={horaLimiteCobro}
          cliente={{ nombre: loan.client.nombreCompleto, monto: Number(loan.capital), pago: Number(loan.pagoSemanal ?? 0) }}
          aval={{ nombre: avalNombre }}
          fechasPagos={fechasPagos}
        />
      </Document>
    )
  } else {
    // AGIL
    const avalNombre = loan.avalNombre ?? 'POR DEFINIR'
    pdfDocument = (
      <Document>
        <SolicitudCredito
          tipoCredito="AGIL"
          nombreSucursal={loan.branch.nombre}
          coordinador={loan.cobrador.nombre}
          fecha={fechaFirma}
          integrantes={solicitudIntegrantes}
          total={solicitudTotal}
          pactado={solicitudPactado}
          pactadoFrecuencia="DIARIO"
        />
        <ContratoAgil
          numeroContrato={numeroContrato}
          cliente={{ nombre: loan.client.nombreCompleto, monto: Number(loan.capital) }}
          aval={{ nombre: avalNombre }}
          montoTotal={Number(loan.capital)}
          fechaFirma={fechaFirma}
          representanteLegal={representanteLegal}
          ciudadFirma={ciudadFirma}
          cat={cat}
          interesMoratorio={interesMoratorio}
        />
        <ControlPagosAgil
          nombreSucursal={loan.branch.nombre}
          fechaInicio={fechaInicio}
          fechaTermino={fechaTermino}
          horaLimiteCobro={horaLimiteCobro}
          cliente={{ nombre: loan.client.nombreCompleto, monto: Number(loan.capital), pago: Number(loan.pagoDiario ?? 0) }}
          aval={{ nombre: avalNombre }}
          fechasPagos={fechasPagos}
        />
      </Document>
    )
  }

  const pdfBuffer = await renderToBuffer(pdfDocument)

  // ── 8. Subir a Cloudinary con public_id = numeroContrato ─────────────────
  const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'microkapital/contratos',
        public_id: numeroContrato,
        resource_type: 'raw',  // PDF se sube como raw
        type: 'upload',
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'))
        resolve(result as { secure_url: string })
      }
    )
    stream.end(pdfBuffer)
  })

  // ── 9. Persistir Contract + ContractGroupMember[] ────────────────────────
  const contract = await prisma.$transaction(async (tx) => {
    const created = await tx.contract.create({
      data: {
        loanId: anchorLoanId,
        numeroContrato,
        representanteLegal,
        lugarFirma: ciudadFirma,
        diaCobro,
        horaLimiteCobro,
        fechaFirma,
        pdfGeneradoUrl: uploadResult.secure_url,
        generadoAt: fechaFirma,
        generadoPorId: userId,
        companyId: companyId!,
        branchId: loan.branchId,
      },
    })

    if (loan.tipo === 'SOLIDARIO') {
      await tx.contractGroupMember.createMany({
        data: groupLoans.map((gl, idx) => ({
          contractId: created.id,
          loanId: gl.id,
          esCoordinadora: idx === 0,
          ordenLista: idx + 1,
          nombreIntegrante: gl.client.nombreCompleto,
          montoIntegrante: Number(gl.capital),
        })),
      })
    }

    return created
  })

  createAuditLog({
    userId,
    accion: 'GENERATE_CONTRACT',
    tabla: 'Contract',
    registroId: contract.id,
    valoresNuevos: {
      numeroContrato,
      loanId: anchorLoanId,
      tipo: loan.tipo,
    },
  })

  return NextResponse.json(
    {
      contractId: contract.id,
      numeroContrato,
      pdfUrl: uploadResult.secure_url,
    },
    { status: 201 }
  )
}
