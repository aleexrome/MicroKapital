import { prisma } from '@/lib/prisma'
import { getScoreInfo } from '@/lib/score-calculator'

export interface AvalMatch {
  loanId: string
  loanEstado: string
  loanTipo: string
  capital: number
  avalNombre: string
  avalTelefono: string | null
  /** The client who owns this loan (the one being guaranteed) */
  clienteNombre: string
  clienteId: string
  clienteScore: number
  /** Computed risk info based on the client's score */
  scoreColor: string
  scoreLabel: string
  scoreNivel: string
  /** How was the match found */
  matchType: 'telefono' | 'nombre'
}

/**
 * Normalizes a name for fuzzy comparison:
 * uppercase, collapse whitespace, strip accents
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalizes a phone number: digits only
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Finds all loans where the given person appears as aval (guarantor).
 * Skips LIQUIDATED and REJECTED loans (no risk).
 * Match strategy:
 *  1. Exact phone match (if phone provided)
 *  2. Fuzzy name match (ILIKE with normalized name)
 */
export async function findAvalMatches(
  nombreCompleto: string,
  telefono: string | null | undefined,
  companyId: string
): Promise<AvalMatch[]> {
  // Only check loans with active risk
  const riskStates = ['PENDING_APPROVAL', 'ACTIVE', 'RESTRUCTURED', 'DEFAULTED']

  const loans = await prisma.loan.findMany({
    where: {
      companyId,
      estado: { in: riskStates as never[] },
      avalNombre: { not: null },
      OR: [
        // Phone match (if provided)
        ...(telefono
          ? [{ avalTelefono: { not: null } }]
          : []),
        // Name match (always)
        { avalNombre: { not: null } },
      ],
    },
    select: {
      id: true,
      estado: true,
      tipo: true,
      capital: true,
      avalNombre: true,
      avalTelefono: true,
      client: {
        select: {
          id: true,
          nombreCompleto: true,
          score: true,
        },
      },
    },
  })

  const normalizedInput = normalizeName(nombreCompleto)
  const normalizedPhone = telefono ? normalizePhone(telefono) : null

  const matches: AvalMatch[] = []

  for (const loan of loans) {
    if (!loan.avalNombre) continue

    let matchType: 'telefono' | 'nombre' | null = null

    // Priority 1: phone match
    if (normalizedPhone && loan.avalTelefono) {
      const loanPhone = normalizePhone(loan.avalTelefono)
      if (loanPhone === normalizedPhone && loanPhone.length >= 7) {
        matchType = 'telefono'
      }
    }

    // Priority 2: name match (fuzzy)
    if (!matchType) {
      const normalizedAval = normalizeName(loan.avalNombre)
      if (normalizedAval === normalizedInput) {
        matchType = 'nombre'
      }
    }

    if (matchType) {
      const scoreInfo = getScoreInfo(loan.client.score)
      matches.push({
        loanId: loan.id,
        loanEstado: loan.estado,
        loanTipo: loan.tipo,
        capital: Number(loan.capital),
        avalNombre: loan.avalNombre,
        avalTelefono: loan.avalTelefono,
        clienteNombre: loan.client.nombreCompleto,
        clienteId: loan.client.id,
        clienteScore: loan.client.score,
        scoreColor: scoreInfo.color,
        scoreLabel: scoreInfo.label,
        scoreNivel: scoreInfo.nivel,
        matchType,
      })
    }
  }

  return matches
}

/**
 * Determines the highest risk level from a set of aval matches.
 * Returns:
 *  - 'red': client score <= 400 (Riesgo Alto / Riesgo Medio) → block approval
 *  - 'yellow': client score 401-600 (Regular) → warning
 *  - 'green': client score > 600 → informational only
 *  - null: no matches
 */
export function getAvalRiskLevel(
  matches: AvalMatch[]
): 'red' | 'yellow' | 'green' | null {
  if (matches.length === 0) return null

  const hasRed = matches.some((m) => m.clienteScore <= 400)
  if (hasRed) return 'red'

  const hasYellow = matches.some((m) => m.clienteScore <= 600)
  if (hasYellow) return 'yellow'

  return 'green'
}
