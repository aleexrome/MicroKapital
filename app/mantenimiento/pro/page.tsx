import Link from 'next/link'
import { Check, ArrowLeft, Zap } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Suscribirse a Pro',
  description: 'Actualiza tu plan a Pro y desbloquea más almacenamiento.',
}

/**
 * Página decorativa de "Suscribirse al plan Pro". Se llega desde la
 * pantalla de mantenimiento al hacer click en "Actualizar a Pro". El
 * CTA "Suscribirse ahora" no hace nada (es solo parte de la simulación
 * mientras Dirección hace cambios en backend).
 */
export default function SuscripcionProPage() {
  return (
    <div className="min-h-screen w-full bg-black text-white px-4 py-10">
      <div className="max-w-lg mx-auto">
        <Link
          href="/mantenimiento"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </Link>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/80 to-black p-8 shadow-2xl shadow-orange-500/5">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-orange-500/15 p-1.5 ring-1 ring-orange-500/30">
                <Zap className="h-4 w-4 text-orange-400" strokeWidth={2} />
              </div>
              <span className="text-sm font-semibold tracking-wide">Plan Pro</span>
            </div>
            <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400 ring-1 ring-orange-500/30">
              Recomendado
            </span>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-5xl font-bold tracking-tight">$96</span>
            <span className="text-lg text-gray-400">USD</span>
            <span className="text-sm text-gray-500 ml-1">/ mes</span>
          </div>
          <p className="text-xs text-gray-500 mb-8">Facturación mensual recurrente. Cancela cuando quieras.</p>

          {/* Features */}
          <ul className="space-y-3 mb-8">
            <Feature>
              <strong className="text-white font-semibold">Almacenamiento de base de datos</strong>{' '}
              PostgreSQL 16 hasta <strong className="text-white">2 TB</strong> con compresión TOAST extendida y particionado declarativo por timestamp
            </Feature>
            <Feature>
              Replicación lógica streaming con WAL retention de 30 días y Point-in-Time Recovery (PITR) a granularidad de transacción
            </Feature>
            <Feature>
              Hot Standby multi-región con failover automático sub-segundo vía DNS Anycast routing
            </Feature>
            <Feature>
              Connection pooling con pgBouncer en modo transaction (hasta 10 000 conexiones concurrentes)
            </Feature>
            <Feature>
              Backups incrementales cada 4 horas con cifrado AES-256-GCM y replicación cross-region en cold storage S3-IA
            </Feature>
            <Feature>
              Read replicas con balanceo round-robin y autovacuum parametrizado por tabla
            </Feature>
            <Feature>
              Índices BRIN sobre columnas temporales y soporte nativo para pgvector con embeddings de 1536 dimensiones
            </Feature>
            <Feature>
              Cifrado en tránsito TLS 1.3 con certificate pinning y soporte para mTLS en endpoints internos
            </Feature>
            <Feature>
              Edge CDN multi-tenant con cache distribuido en 285 PoPs y soporte para HTTP/3 + QUIC
            </Feature>
            <Feature>
              Soporte prioritario 24/7 con SLA de <strong className="text-white">99.99%</strong> de uptime y créditos retroactivos
            </Feature>
          </ul>

          {/* CTA */}
          <button
            type="button"
            className="w-full rounded-lg bg-orange-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 hover:bg-orange-600 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-black"
          >
            Suscribirse ahora
          </button>

          <p className="text-[11px] text-gray-600 mt-4 text-center leading-relaxed">
            Al continuar aceptas los Términos del Servicio y la Política de Privacidad.
            Pagos procesados con Stripe en USD. Impuestos pueden aplicar según jurisdicción.
          </p>
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          ¿Necesitas más capacidad? Contáctanos para el plan <span className="text-gray-500">Enterprise</span>.
        </p>
      </div>
    </div>
  )
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-gray-300 leading-relaxed">
      <Check className="h-4 w-4 flex-shrink-0 text-orange-400 mt-0.5" strokeWidth={2.5} />
      <span>{children}</span>
    </li>
  )
}
