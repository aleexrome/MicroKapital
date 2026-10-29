import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  receptoresValidosPara,
  snapshotCashRegisterDelDia,
  totalRecibidoDeOtrosEnDia,
} from '@/lib/cortes'
import { CorteCongeladoForm } from '@/components/cortes/CorteCongeladoForm'
import { Wallet, Inbox } from 'lucide-react'

/**
 * Pantalla congelada del Corte del día — se muestra al user que tiene
 * un corte pendiente (del día o de días pasados). Vive FUERA del grupo
 * (dashboard) para no heredar sidebar / topbar: el user no puede
 * navegar hasta cerrar su corte.
 *
 * El layout del (dashboard) también redirige aquí cuando detecta
 * pendientes, para cubrir el caso de que el user intente abrir
 * /dashboard directamente.
 *
 * Estados posibles:
 *   - ABIERTO    → form con totales + selector de receptor + upload foto
 *   - ENTREGADO  → "esperando aceptación de X" + botón para ver foto
 *   - RECHAZADO  → mostrar razón + botón "re-entregar" (vuelve a ABIERTO en memoria)
 *   - ACEPTADO   → no debería llegar aquí (no bloquea); redirect a /dashboard
 */
export default async function CortePendientePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  const corte = await prisma.corte.findFirst({
    where: {
      id:        params.id,
      userId:    session.user.id,
      companyId: session.user.companyId!,
    },
    include: {
      receptor: { select: { id: true, nombre: true, rol: true } },
      branch:   { select: { id: true, nombre: true } },
    },
  })

  if (!corte) redirect('/dashboard')
  // ACEPTADO ya está cerrado.
  // ENTREGADO: el coord ya hizo su parte — no debe quedarse bloqueado
  // esperando aceptación. Si navega a este URL por accidente, lo
  // mandamos al dashboard igual.
  if (corte.estado === 'ACEPTADO' || corte.estado === 'ENTREGADO') redirect('/dashboard')

  const receptoresDisponibles = await receptoresValidosPara(prisma, {
    id:        session.user.id,
    branchId:  session.user.branchId,
    companyId: session.user.companyId,
  })

  // Totales DINÁMICOS — el snapshot que crea el cron a las 18:00 es solo
  // el punto de partida. Hay que recalcular en vivo porque:
  //   1) El concentrador (p.ej. Cristina) va aceptando cortes de su equipo
  //      DESPUÉS de las 18:00 — totalRecibidoDeOtros empieza en 0 y crece.
  //   2) El coord puede cobrar más efectivo después de las 18:00 — el
  //      CashRegister refleja el día completo.
  // Si el corte YA está ENTREGADO/RECHAZADO, respetamos los números
  // congelados en el momento de la entrega (son los que el receptor vio).
  let efectivo      = Number(corte.totalEfectivoCobrado)
  let tarjeta       = Number(corte.totalTarjetaCobrado)
  let transferencia = Number(corte.totalTransferenciaCobrado)
  let recibido      = Number(corte.totalRecibidoDeOtros)
  let aEntregar     = Number(corte.totalAEntregar)
  if (corte.estado === 'ABIERTO') {
    const snap    = await snapshotCashRegisterDelDia(prisma, session.user.id, corte.fecha)
    const rec     = await totalRecibidoDeOtrosEnDia(prisma, session.user.id, corte.fecha)
    efectivo      = snap.efectivo
    tarjeta       = snap.tarjeta
    transferencia = snap.transferencia
    recibido      = rec
    aEntregar     = snap.efectivo + rec
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-950 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border-2 border-fuchsia-500/50 bg-primary-900/80 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="p-6 space-y-5">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold text-fuchsia-200 uppercase tracking-wider">
              Corte del día
            </div>
            <h1 className="text-2xl font-bold text-white mt-3">
              {corte.estado === 'RECHAZADO'
                ? 'Tu corte fue rechazado'
                : 'Entrega tu corte para continuar'}
            </h1>
            <p className="text-sm text-gray-300 mt-1">
              {corte.estado === 'RECHAZADO'
                ? 'Lee la razón, ajusta y vuelve a entregar con nueva foto.'
                : 'Revisa los totales, elige a quién le vas a entregar, imprime el ticket, obtén la firma y sube la foto.'}
            </p>
          </div>

          <CorteCongeladoForm
            corteId={corte.id}
            estado={corte.estado}
            fecha={corte.fecha.toISOString()}
            branchNombre={corte.branch.nombre}
            totalEfectivoCobrado={efectivo}
            totalTarjetaCobrado={tarjeta}
            totalTransferenciaCobrado={transferencia}
            totalRecibidoDeOtros={recibido}
            totalAEntregar={aEntregar}
            receptorActual={corte.receptor}
            receptoresDisponibles={receptoresDisponibles}
            fotoTicketUrl={corte.fotoTicketUrl}
            rechazoRazon={corte.rechazoRazon}
          />

          <p className="text-[11px] text-amber-300/80 border-t border-primary-700/50 pt-3 text-center">
            No podrás usar el sistema hasta que el receptor acepte tu corte.
            Si hubo discrepancia y rechazaron, re-entrega con el monto correcto.
          </p>

          {/* Nav mínimo — las ÚNICAS 2 rutas accesibles mientras el corte
              esté pendiente. /caja para imprimir el ticket resumen antes
              de entregar; /cortes/recibidos para aceptar los que otros
              te entregaron (si eres concentrador). */}
          <div className="border-t border-primary-700/50 pt-3 flex gap-2 justify-center">
            <Link
              href="/caja"
              className="flex items-center gap-2 rounded-md border border-primary-600 bg-primary-800/60 px-3 py-2 text-xs text-primary-100 hover:bg-primary-700/60 transition-colors"
            >
              <Wallet className="h-3.5 w-3.5" />
              Ver mi caja (imprimir ticket)
            </Link>
            <Link
              href="/cortes/recibidos"
              className="flex items-center gap-2 rounded-md border border-primary-600 bg-primary-800/60 px-3 py-2 text-xs text-primary-100 hover:bg-primary-700/60 transition-colors"
            >
              <Inbox className="h-3.5 w-3.5" />
              Cortes que recibí
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
