import { useId, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Globe, Lock, Trash2, Upload } from 'lucide-react'
import { deleteDocument, fetchDocuments, MAX_DOCUMENTS, setDocumentShared, uploadDocument, type DocumentWithLink } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import type { DocumentKind } from '../../lib/types'
import { validatePdf } from '../../lib/validation'
import { Badge, Button, Card, Field } from '../ui'
import { useToast } from '../ui/toast'

const KIND_LABEL: Record<DocumentKind, string> = {
  qualification: 'Qualification',
  id_document: 'ID document',
  other: 'Other',
}

const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

const documentsQuery = (ownerId: string) => ({
  queryKey: ['documents', ownerId],
  queryFn: () => fetchDocuments(ownerId),
  staleTime: 5 * 60_000, // signed links last 10 minutes
})

function DocumentLink({ doc }: { doc: DocumentWithLink }) {
  return doc.url ? (
    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:underline">
      {doc.title}
    </a>
  ) : (
    <span className="font-semibold">{doc.title}</span>
  )
}

/** The owner's view: upload PDFs, choose what appears on the public profile, delete. */
export function DocumentsManager({ userId, readOnly }: { userId: string; readOnly: boolean }) {
  const toast = useToast()
  const uid = useId()
  const q = useQuery(documentsQuery(userId))
  const docs = q.data ?? []
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<DocumentKind>('qualification')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [share, setShare] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function pickKind(k: DocumentKind) {
    setKind(k)
    setShare(k === 'qualification')
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError('Choose a PDF to upload.')
    if (title.trim().length < 2) return setError('Give the document a short name, e.g. “Trade test certificate”.')
    const problem = await validatePdf(file)
    if (problem) return setError(problem)
    setError('')
    setBusy(true)
    try {
      await uploadDocument(userId, { file, kind, title, isPublic: share })
      setFile(null)
      setTitle('')
      if (fileRef.current) fileRef.current.value = ''
      await q.refetch()
      toast.show('Document uploaded.')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onRowAction(doc: DocumentWithLink, task: () => Promise<void>, done: string) {
    setPendingId(doc.id)
    try {
      await task()
      await q.refetch()
      toast.show(done)
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setPendingId(null)
      setConfirmDelete(null)
    }
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><FileText className="size-4" aria-hidden /></span>
        <div>
          <h2 className="font-bold">Documents (PDF)</h2>
          <p className="text-sm text-muted">
            Qualifications, certificates, your ID or other paperwork. KashWise doesn’t check documents — anything you share is shown as uploaded by you.
          </p>
        </div>
      </div>

      {docs.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate"><DocumentLink doc={d} /></p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {KIND_LABEL[d.kind]} · {sizeLabel(d.size_bytes)} · {formatDate(d.created_at)}
                  {d.is_public ? (
                    <Badge tone="brand"><Globe className="size-3" aria-hidden /> On public profile</Badge>
                  ) : (
                    <Badge><Lock className="size-3" aria-hidden /> Private</Badge>
                  )}
                </p>
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  {d.kind !== 'id_document' && (
                    <Button size="sm" variant="ghost" disabled={pendingId === d.id}
                      onClick={() => onRowAction(d, () => setDocumentShared(d.id, !d.is_public), d.is_public ? 'Document is now private.' : 'Document added to your public profile.')}>
                      {d.is_public ? 'Make private' : 'Show on profile'}
                    </Button>
                  )}
                  {confirmDelete === d.id ? (
                    <Button size="sm" variant="danger" loading={pendingId === d.id} onClick={() => onRowAction(d, () => deleteDocument(d), 'Document deleted.')}>
                      Confirm delete
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" aria-label={`Delete ${d.title}`} onClick={() => setConfirmDelete(d.id)}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {q.isError && <p role="alert" className="mt-3 text-sm text-clay-700">{friendlyError(q.error)}</p>}

      {readOnly ? (
        <p className="mt-4 text-sm text-muted">Uploads are switched off on shared demo accounts.</p>
      ) : docs.length >= MAX_DOCUMENTS ? (
        <p className="mt-4 text-sm text-muted">You’ve reached {MAX_DOCUMENTS} documents. Delete one to upload another.</p>
      ) : (
        <form onSubmit={onUpload} noValidate className="mt-4 space-y-3">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Type of document</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_LABEL) as DocumentKind[]).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => pickKind(k)}>{KIND_LABEL[k]}</button>
              ))}
            </div>
          </fieldset>
          <Field label="Name" htmlFor={`${uid}-title`}>
            <input id={`${uid}-title`} className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'id_document' ? 'e.g. Smart ID card' : kind === 'qualification' ? 'e.g. Plumbing trade test certificate' : 'e.g. Police clearance'} />
          </Field>
          <label htmlFor={`${uid}-file`} className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line p-4 text-sm font-semibold text-ink-soft hover:border-brand-200 focus-within:border-brand-600">
            <Upload className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{file ? `${file.name} · ${sizeLabel(file.size)}` : 'Choose a PDF (max 5 MB)'}</span>
            <input id={`${uid}-file`} ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError('') }} />
          </label>
          {kind === 'id_document' ? (
            <p className="flex items-center gap-2 text-xs text-muted"><Lock className="size-3.5 shrink-0" aria-hidden /> ID documents are always private — only you can open them.</p>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand-600" checked={share} onChange={(e) => setShare(e.target.checked)} />
              Show on my public profile
            </label>
          )}
          {error && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{error}</p>}
          <Button type="submit" variant="secondary" loading={busy}><Upload className="size-4" aria-hidden /> Upload document</Button>
        </form>
      )}
    </Card>
  )
}

/** Public profile: only documents the owner chose to share (RLS hides the rest from everyone else). */
export function SharedDocuments({ ownerId, firstName }: { ownerId: string; firstName: string }) {
  const q = useQuery(documentsQuery(ownerId))
  const docs = (q.data ?? []).filter((d) => d.is_public)
  if (!docs.length) return null
  return (
    <Card className="mt-4 p-5">
      <h2 className="font-bold">Qualifications & documents</h2>
      <p className="text-xs text-muted">Uploaded by {firstName}. KashWise has not checked these documents.</p>
      <ul className="mt-3 space-y-2">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-sm">
            <FileText className="size-4 shrink-0 text-brand-700" aria-hidden />
            <DocumentLink doc={d} />
            <span className="text-xs text-muted">· {KIND_LABEL[d.kind]} · PDF</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
