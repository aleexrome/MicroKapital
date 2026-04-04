import { v2 as cloudinary } from 'cloudinary'
import { DocumentType } from '@prisma/client'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const FOLDER_MAP: Record<DocumentType, string> = {
  INE_FRONT: 'microkapital/ine',
  INE_BACK: 'microkapital/ine',
  PHOTO: 'microkapital/fotos',
  CONTRACT: 'microkapital/contratos',
  PROOF_ADDRESS: 'microkapital/domicilio',
  OTHER: 'microkapital/otros',
}

interface UploadResult {
  url: string
  publicId: string
}

/**
 * Sube un archivo a Cloudinary y retorna la URL segura
 */
export async function uploadFile(
  fileBuffer: Buffer,
  documentType: DocumentType,
  fileName: string
): Promise<UploadResult> {
  const folder = FOLDER_MAP[documentType]

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`,
        resource_type: 'auto',
        quality: 'auto',
        fetch_format: 'auto',
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Upload failed'))
          return
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        })
      }
    )

    uploadStream.end(fileBuffer)
  })
}

/**
 * Elimina un archivo de Cloudinary por su public_id
 */
export async function deleteFile(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId)
}

/**
 * Extrae el public_id de una URL de Cloudinary
 */
export function extractPublicId(url: string): string {
  const parts = url.split('/')
  const fileWithExt = parts[parts.length - 1]
  const file = fileWithExt.split('.')[0]
  const folder = parts.slice(parts.indexOf('microkapital')).slice(0, -1).join('/')
  return folder ? `${folder}/${file}` : file
}
