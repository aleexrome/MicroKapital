'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { FileText, Upload, Trash2, Loader2, ExternalLink, FilePlus } from 'lucide-react'
import type { LoanType } from '@prisma/client'

interface LoanDocumentItem {
  id: string
  tipo: string
  archivoUrl: string
  descripcion: string | null
  createdAt: string
  uploadedBy: { nombre: string }
}

const TIPO_LABELS: Record<string, string> = {
  SOLICITUD:            'Solicitud de crédito',
  INE_FRENTE:           'INE — frente',
  INE_REVERSO:          'INE — reverso',
  COMPROBANTE_DOMICILIO:'Comprobante de domicilio',
  CONTRATO:             'Contrato firmado',
  PAGARE:               'Pagaré',
  FOTO:                 'Fotografía',
  AVAL_INE:             'INE del aval',
  OTRO:                 'Otro',
}

// Documentos requeridos por tipo de producto
const REQUERIDOS_POR_TIPO: Record<LoanType, string[]> = {
  SOLIDARIO:  ['SOLICITUD', 'INE_FRENTE', 'INE_REVERSO', 'FOTO'],
  INDIVIDUAL: ['SOLICITUD', 'INE_FRENTE', 'INE_REVERSO', 'COMPROBANTE_DOMICILIO', 'FOTO', 'PAGARE', 'AVAL_INE'],
  AGIL:       ['SOLICITUD', 'INE_FRENTE', 'INE_REVERSO'],
  FIDUCIARIO: ['SOLICITUD', 'INE_FRENTE', 'INE_REVERSO', 'COMPROBANTE_DOMICILIO', 'FOTO', 'CONTRATO', 'PAGARE', 'AVAL_INE'],
}

interface LoanDocumentUploadProps {
  loanId: string
  tipo: LoanType
  readOnly?: boolean
}

export function LoanDocumentUpload({ loanId, tipo, readOnly = false }: LoanDocumentUploadProps) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<LoanDocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedTipo, setSelectedTipo] = useState<string>('SOLICITUD')
  const [descripcion, setDescripcion] = useState('')
  const [showForm, setShowForm] = useState(false)

  const requeridos = REQUERIDOS_POR_TIPO[tipo] ?? []
  const subidos = docs.map((d) => d.tipo)
  const pendientes = requeridos.filter((r) => !subidos.includes(r))

  useEffect(() => {
    fetch(`/api/loans/${loanId}/documents`)
      .then((r) => r.json())
      .then((data) => setDocs(data.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [loanId])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('tipo', selectedTipo)
    if (descripcion) formData.append('descripcion', descripcion)

    try {
      const res = await fetch(`/api/loans/${loanId}/documents`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al subir')

      setDocs((prev) => [data.document, ...prev])
      setShowForm(false)
      setDescripcion('')
      if (fileRef.current) fileRef.current.value = ''
      toast({ title: '✅ Documento subido', description: TIPO_LABELS[selectedTipo] ?? selectedTipo })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm('¿Eliminar este documento?')) return
    try {
      const res = await fetch(`/api/loans/${loanId}/documents`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      })
      if (!res.ok) throw new Error()
      setDocs((prev) => prev.filter((d) => d.id !== docId))
      toast({ title: 'Documento eliminado' })
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentos del crédito
            {!loading && (
              <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${
                pendientes.length === 0
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}>
                {docs.length}/{requeridos.length} requeridos
              </span>
            )}
          </div>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
              <FilePlus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload form */}
        {showForm && !readOnly && (
          <form onSubmit={handleUpload} className="bg-gray-800/50 rounded-lg p-4 space-y-3 border border-gray-700">
            <p className="text-sm font-medium">Subir documento</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Tipo de documento</label>
                <select
                  value={selectedTipo}
                  onChange={(e) => setSelectedTipo(e.target.value)}
                  className="border border-gray-600 bg-gray-800 text-gray-100 rounded px-3 py-1.5 text-sm"
                >
                  {Object.entries(TIPO_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Descripción (opcional)</label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Notas adicionales"
                  className="border border-gray-600 bg-gray-800 text-gray-100 rounded px-3 py-1.5 text-sm placeholder:text-gray-500"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Archivo (PDF, JPG, PNG)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                required
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1" />Subir</>}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* Pending required docs */}
        {!loading && pendientes.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
            <p className="text-xs font-semibold text-amber-400 mb-1">Documentos pendientes</p>
            <div className="flex flex-wrap gap-1.5">
              {pendientes.map((t) => (
                <span key={t} className="text-xs bg-amber-500/20 text-amber-300 rounded-full px-2 py-0.5">
                  {TIPO_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Document list */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos...
          </div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay documentos subidos aún
          </p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-800/50 text-sm">
                <FileText className="h-4 w-4 text-primary-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{TIPO_LABELS[doc.tipo] ?? doc.tipo}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.uploadedBy.nombre} · {new Date(doc.createdAt).toLocaleDateString('es-MX')}
                    {doc.descripcion ? ` · ${doc.descripcion}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={doc.archivoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-primary-400 hover:bg-primary-500/10 border border-primary-500/30"
                  >
                    <ExternalLink className="h-4 w-4" /> Ver
                  </a>
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-500/30"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
