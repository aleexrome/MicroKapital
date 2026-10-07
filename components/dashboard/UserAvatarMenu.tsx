'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { MoreVertical, Camera, Trash2, X, Loader2 } from 'lucide-react'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useToast } from '@/components/ui/use-toast'

interface UserAvatarMenuProps {
  nombre: string
  fotoUrl?: string | null
  /** Tamaño del avatar en el sidebar. Default 44. */
  size?: number
}

/**
 * Avatar circular + menú de 3-puntos verticales al lado.
 *
 * Opciones del menú:
 *   - "Cambiar foto de perfil" → abre modal con cropper (recorta a
 *     cuadrado antes de subir, para que no se vea deforme en el
 *     avatar circular).
 *   - "Quitar foto" (solo si ya hay una) → DELETE directo.
 *
 * Subida: multipart/form-data a POST /api/users/me/foto-perfil.
 * Al terminar hace router.refresh() para que el nuevo avatar aparezca
 * en toda la UI sin recargar la página.
 */
export function UserAvatarMenu({ nombre, fotoUrl, size = 44 }: UserAvatarMenuProps) {
  const router  = useRouter()
  const { toast } = useToast()
  const [menuOpen, setMenuOpen]   = useState(false)
  const [cropOpen, setCropOpen]   = useState(false)
  const [imgSrc, setImgSrc]       = useState<string | null>(null)
  const [crop, setCrop]           = useState({ x: 0, y: 0 })
  const [zoom, setZoom]           = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function onPickFile() {
    setMenuOpen(false)
    fileInputRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Solo imágenes permitidas', variant: 'destructive' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImgSrc(reader.result as string)
      setCropOpen(true)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    }
    reader.readAsDataURL(file)
    // Permite re-seleccionar el mismo archivo después
    e.target.value = ''
  }

  const onCropComplete = useCallback((_: Area, areaPx: Area) => {
    setCroppedArea(areaPx)
  }, [])

  async function onSave() {
    if (!imgSrc || !croppedArea) return
    setSaving(true)
    try {
      const blob = await getCroppedBlob(imgSrc, croppedArea)
      const formData = new FormData()
      formData.append('foto', blob, 'avatar.jpg')
      const res = await fetch('/api/users/me/foto-perfil', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo subir la foto')
      }
      toast({ title: 'Foto actualizada' })
      setCropOpen(false)
      setImgSrc(null)
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error al subir',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    setMenuOpen(false)
    if (!confirm('¿Quitar tu foto de perfil?')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/users/me/foto-perfil', { method: 'DELETE' })
      if (!res.ok) throw new Error('No se pudo quitar la foto')
      toast({ title: 'Foto removida' })
      router.refresh()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="relative flex items-center">
        <UserAvatar nombre={nombre} fotoUrl={fotoUrl} size={size} />

        {/* Botón 3 puntos */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-auto p-1 rounded-md text-primary-200 hover:text-white hover:bg-white/10 transition-colors"
          title="Opciones de foto"
          aria-label="Opciones de foto de perfil"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {/* Menú dropdown */}
        {menuOpen && (
          <>
            {/* Overlay para cerrar al click afuera */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border border-primary-600/80 bg-primary-800 shadow-xl py-1">
              <button
                type="button"
                onClick={onPickFile}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
              >
                <Camera className="h-4 w-4 text-primary-300" />
                Cambiar foto de perfil
              </button>
              {fotoUrl && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Quitar foto
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Dialog de crop */}
      {cropOpen && imgSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-primary-800 border border-primary-600/80 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-primary-700/60">
              <p className="font-semibold text-white">Recortar foto de perfil</p>
              <button
                type="button"
                onClick={() => { setCropOpen(false); setImgSrc(null) }}
                disabled={saving}
                className="p-1 rounded-md text-primary-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative w-full h-80 bg-black/40">
              <Cropper
                image={imgSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="px-5 py-3 border-t border-primary-700/60 space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-xs text-primary-200 shrink-0">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-fuchsia-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setCropOpen(false); setImgSrc(null) }}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm rounded-md text-primary-200 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="px-4 py-1.5 text-sm font-semibold rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 text-white transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Toma la imagen fuente + el área de crop (en pixeles del original)
 * y devuelve un Blob JPEG con la región recortada.
 * Lo subimos ya recortado al servidor — Cloudinary también podría
 * hacerlo pero recortar en cliente evita subir toda la foto original
 * (ahorra ancho de banda, especialmente en móvil).
 */
async function getCroppedBlob(imgSrc: string, area: Area): Promise<Blob> {
  const img = await loadImage(imgSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no soportado')
  // Fijamos salida a 400x400 para no mandar imágenes gigantes.
  const SIZE = 400
  canvas.width  = SIZE
  canvas.height = SIZE
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, SIZE, SIZE,
  )
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))),
      'image/jpeg',
      0.92,
    )
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
