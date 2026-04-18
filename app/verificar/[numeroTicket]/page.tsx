import { prisma } from '@/lib/prisma'
import { formatMoney, formatDate } from '@/lib/utils'
import { CheckCircle2, XCircle, Shield, Building2, User, Calendar, CreditCard } from 'lucide-react'
import Image from 'next/image'

export const dynamic = 'force-dynamic'

const LOGO_URL = 'https://res.cloudinary.com/djs8dtzrq/image/upload/v1776487061/ddcb6871-4cff-422e-9a00-67d62aa6243f.png'

export default async function VerificarTicketPage({
  params,
}: {
  params: { numeroTicket: string }
}) {
  const ticket = await prisma.ticket.findUnique({
    where: { numeroTicket: decodeURIComponent(params.numeroTicket) },
    include: {
      company: { select: { nombre: true } },
      branch: { select: { nombre: true } },
      payment: {
        include: {
          client: { select: { nombreCompleto: true } },
          cobrador: { select: { nombre: true } },
          loan: { select: { tipo: true } },
          schedule: { select: { numeroPago: true } },
        },
      },
    },
  })

  // Ticket no encontrado o anulado
  if (!ticket || ticket.anulado) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Ticket no válido</h1>
          <p className="text-gray-400">
            {!ticket
              ? 'Este ticket no fue emitido por MicroKapital Financiera.'
              : 'Este ticket fue anulado y ya no es válido.'}
          </p>
          {ticket?.anulado && ticket.razonAnulacion && (
            <p className="text-sm text-gray-500 mt-3 italic">
              Razón: {ticket.razonAnulacion}
            </p>
          )}
        </div>
      </div>
    )
  }

  const pago = ticket.payment

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 max-w-md w-full">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <Image
            src={LOGO_URL}
            alt="MicroKapital Financiera"
            width={80}
            height={80}
            className="rounded-lg bg-white p-2"
          />
        </div>

        {/* Valid badge */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-green-500/10 border border-green-500/30 rounded-full p-3 mb-3">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Ticket válido</h1>
          <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Verificado por {ticket.company.nombre}
          </p>
        </div>

        {/* Ticket details */}
        <div className="space-y-3 border-t border-gray-800 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Número</span>
            <span className="font-mono font-semibold text-white">{ticket.numeroTicket}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Sucursal
            </span>
            <span className="text-white">{ticket.branch.nombre}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Cliente
            </span>
            <span className="text-white text-right">{pago.client.nombreCompleto}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Cobrador</span>
            <span className="text-white text-right">{pago.cobrador.nombre}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Fecha
            </span>
            <span className="text-white">
              {formatDate(pago.fechaHora, "dd/MM/yyyy HH:mm")}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Tipo de crédito</span>
            <span className="text-white">{pago.loan.tipo}</span>
          </div>

          {pago.schedule && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Pago #</span>
              <span className="text-white">{pago.schedule.numeroPago}</span>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Método
            </span>
            <span className="text-white">
              {pago.metodoPago === 'CASH' ? 'Efectivo' : pago.metodoPago === 'CARD' ? 'Tarjeta' : 'Transferencia'}
            </span>
          </div>

          {/* Monto destacado */}
          <div className="mt-4 pt-4 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Monto pagado</p>
            <p className="text-3xl font-bold text-green-400 mt-1">
              {formatMoney(Number(pago.monto))}
            </p>
          </div>
        </div>

        {ticket.esReimpresion && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-300 text-center">
            Este es un ticket reimpreso
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-6">
          Impreso el {formatDate(ticket.impresoAt, "dd/MM/yyyy HH:mm")}
        </p>
      </div>
    </div>
  )
}
