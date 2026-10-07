import { cn } from '@/lib/utils'
import { getIniciales } from '@/lib/user-helpers'

interface UserAvatarProps {
  nombre: string | null | undefined
  fotoUrl?: string | null
  /** Tamaño en px. Default 44. */
  size?: number
  /** Clases extra para el contenedor circular. */
  className?: string
  /** Clases extra para el texto de iniciales. */
  textClassName?: string
}

/**
 * Avatar circular reusable del usuario.
 *
 * Si tiene fotoUrl → muestra la imagen con object-cover (sin deformar).
 * Si no → muestra las iniciales del nombre sobre un fondo degradado
 * primary. Las iniciales se calculan con getIniciales
 * (primer nombre + primer apellido paterno).
 *
 * El contenedor es siempre PERFECTAMENTE circular (rounded-full +
 * aspect-square + width=height). Se evita que se deforme en flex
 * usando shrink-0.
 */
export function UserAvatar({
  nombre,
  fotoUrl,
  size = 44,
  className,
  textClassName,
}: UserAvatarProps) {
  const iniciales = getIniciales(nombre)
  // Tamaño de fuente proporcional al tamaño del avatar (~40% del diámetro).
  const fontSize = Math.round(size * 0.38)

  if (fotoUrl) {
    return (
      <div
        className={cn(
          'relative rounded-full shrink-0 overflow-hidden ring-1 ring-white/15 bg-primary-500/20',
          className,
        )}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fotoUrl}
          alt={nombre ?? 'Foto de perfil'}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-full shrink-0 flex items-center justify-center font-bold select-none text-white',
        'bg-gradient-to-br from-primary-500/70 to-primary-700/80 ring-1 ring-primary-400/30',
        className,
        textClassName,
      )}
      style={{ width: size, height: size, fontSize }}
    >
      {iniciales}
    </div>
  )
}
