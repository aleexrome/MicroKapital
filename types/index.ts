import { DefaultSession } from 'next-auth'
import { UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      rol: UserRole
      companyId: string | null
      branchId: string | null
      zonaBranchIds: string[] | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    rol: UserRole
    companyId: string | null
    branchId: string | null
    zonaBranchIds: string[] | null
  }
}

// ─── Financial Types ────────────────────────────────────────────────────────

export interface LoanCalculation {
  capital: number
  tasaInteres: number
  comision: number
  montoReal: number
  interes: number
  totalPago: number
  pagoSemanal?: number
  pagoDiario?: number
  pagoQuincenal?: number
  plazo: number
}

export interface CashDenomination {
  denominacion: number
  label: string
  tipo: 'billete' | 'moneda'
}

export interface CashBreakdownEntry {
  denominacion: number
  cantidad: number
  subtotal: number
}

export interface PaymentCaptureData {
  scheduleId: string
  metodoPago: 'CASH' | 'CARD'
  monto: number
  cambioEntregado: number
  notas?: string
  cashBreakdown?: CashBreakdownEntry[]
}

export interface TicketData {
  numeroTicket: string
  fecha: Date
  empresa: string
  sucursal: string
  cobrador: string
  cliente: string
  loanId: string
  tipoPrestamo: string
  numeroPago: number
  totalPagos: number
  montoPagado: number
  metodoPago: string
  recibido?: number
  cambio?: number
  desglose?: CashBreakdownEntry[]
  qrCode?: string
}

export interface ScoreInfo {
  score: number
  nivel: 'ALTO_RIESGO' | 'RIESGO_MEDIO' | 'REGULAR' | 'BUEN_CLIENTE' | 'PREMIUM'
  label: string
  color: string
}

// ─── License Types ───────────────────────────────────────────────────────────

export interface LicenseCheckResult {
  allowed: boolean
  status: 'ACTIVE' | 'SUSPENDED' | 'GRACE' | 'CANCELLED'
  isGrace: boolean
}

// ─── API Response Types ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
