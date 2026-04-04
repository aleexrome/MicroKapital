import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { FileText, ExternalLink } from 'lucide-react'

const DOC_LABELS: Record<string, string> = {
  INE_FRONT: 'INE (Frente)',
  INE_BACK: 'INE (Reverso)',
  PHOTO: 'Fotografía',
  CONTRACT: 'Contrato',
  PROOF_ADDRESS: 'Comprobante de domicilio',
  OTHER: 'Otro documento',
}

export default async function MisDocumentosPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const client = await prisma.client.findFirst({
    where: { userId: session.user.id, companyId: session.user.companyId! },
    include: {
      documents: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!client) {
    return <div className="text-center py-12 text-muted-foreground">No se encontró tu expediente</div>
  }

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold">Mis documentos</h1>
        <p className="text-sm text-muted-foreground">{client.documents.length} documento(s)</p>
      </div>

      {client.documents.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2" />
            No tienes documentos cargados
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {client.documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{DOC_LABELS[doc.tipo] ?? doc.tipo}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
                    {doc.descripcion && <p className="text-xs text-muted-foreground">{doc.descripcion}</p>}
                  </div>
                </div>
                <a
                  href={doc.archivoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-800"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
