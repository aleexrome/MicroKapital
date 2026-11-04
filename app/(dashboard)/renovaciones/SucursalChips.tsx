'use client'

/**
 * Chips de acceso rápido por sucursal. Al hacer click:
 *   1. Abre el <details id="suc-<branchId>"> correspondiente.
 *   2. Hace scroll suave hasta él.
 * Sin esto, los chips <a href="#..."> movían la vista pero el <details>
 * se quedaba contraído, obligando al user a abrirlo manualmente.
 */
export function SucursalChips({ sucursales }: { sucursales: Array<{ branchId: string; branchNombre: string }> }) {
  if (sucursales.length <= 1) return null

  function irASucursal(e: React.MouseEvent<HTMLAnchorElement>, branchId: string) {
    e.preventDefault()
    const el = document.getElementById(`suc-${branchId}`)
    if (!el) return
    // Si es un <details>, lo abrimos.
    if (el instanceof HTMLDetailsElement) el.open = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border/40">
      <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Ir a:</span>
      {sucursales.map((s) => (
        <a
          key={s.branchId}
          href={`#suc-${s.branchId}`}
          onClick={(e) => irASucursal(e, s.branchId)}
          className="text-xs rounded-full border border-border/60 bg-background/60 hover:bg-muted/40 px-2.5 py-1 transition-colors"
        >
          {s.branchNombre}
        </a>
      ))}
    </div>
  )
}
