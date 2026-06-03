'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmpleadoFormDialog, type EmpleadoData } from '@/components/rh/EmpleadoFormDialog'
import { EliminarEmpleadoButton } from '@/components/rh/EliminarEmpleadoButton'
import { Search } from 'lucide-react'

interface Props {
  empleados: EmpleadoData[]
  sucursalesSugeridas: string[]
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const ymd = value.slice(0, 10)
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d.replace(/^0/, '')} ${meses[Number(m) - 1]} ${y}`
}

function formatMoney(value: number | string | null): string {
  if (value === null || value === '') return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

export function RecursosHumanosClient({ empleados, sucursalesSugeridas }: Props) {
  const [q, setQ] = useState('')

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return empleados
    return empleados.filter((e) =>
      [e.nombre, e.sucursal, e.puesto, e.telefono, e.identificacion, e.contactoEmergencia]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    )
  }, [q, empleados])

  const activos = empleados.filter((e) => e.estatus === 'ACTIVO').length
  const bajas = empleados.length - activos

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Recursos Humanos</h1>
          <p className="text-sm text-muted-foreground">
            {empleados.length} empleados · {activos} activos · {bajas} bajas
          </p>
        </div>
        <EmpleadoFormDialog
          sucursalesSugeridas={sucursalesSugeridas}
          trigger="button-primary"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Empleados</CardTitle>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, sucursal, teléfono..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {q ? 'Sin resultados para "' + q + '"' : 'Aún no hay empleados capturados.'}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium">Nombre</th>
                    <th className="text-left py-2 px-2 font-medium">Sucursal</th>
                    <th className="text-left py-2 px-2 font-medium">Puesto</th>
                    <th className="text-left py-2 px-2 font-medium">Teléfono</th>
                    <th className="text-right py-2 px-2 font-medium">Sueldo</th>
                    <th className="text-left py-2 px-2 font-medium">Entrada</th>
                    <th className="text-left py-2 px-2 font-medium">Estatus</th>
                    <th className="text-right py-2 px-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((emp) => (
                    <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{emp.nombre}</td>
                      <td className="py-2 px-2 text-muted-foreground">{emp.sucursal ?? '—'}</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">{emp.puesto ?? '—'}</td>
                      <td className="py-2 px-2 text-muted-foreground">{emp.telefono ?? '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatMoney(emp.sueldo)}</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">{formatDate(emp.fechaEntrada)}</td>
                      <td className="py-2 px-2">
                        <Badge variant={emp.estatus === 'ACTIVO' ? 'default' : 'outline'}>
                          {emp.estatus === 'ACTIVO' ? 'Activo' : 'Baja'}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <EmpleadoFormDialog
                            empleado={emp}
                            sucursalesSugeridas={sucursalesSugeridas}
                            trigger="icon-ghost"
                          />
                          <EliminarEmpleadoButton
                            empleadoId={emp.id!}
                            empleadoNombre={emp.nombre}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
