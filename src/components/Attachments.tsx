import { useEffect, useRef, useState } from 'react'
import { Download, FileArchive, FileAudio, FileText, FileVideo, File as FileIcon, Paperclip, Trash2, Upload } from 'lucide-react'
import { usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, trDateTime } from '../lib/rows'
import { deleteStored, fileKind, fileSize, fileUrls, logActivity, openFile, uploadFile, type FileKind } from '../lib/files'
import type { FileRow } from '../lib/types'

const kindIcon: Record<FileKind, typeof FileIcon> = {
  image: FileIcon, video: FileVideo, audio: FileAudio, pdf: FileText, archive: FileArchive, doc: FileText, other: FileIcon,
}

// Dosya yükleme alanı: tıkla, sürükle-bırak ya da ekran görüntüsünü yapıştır (Ctrl+V)
export function DropZone({ onFiles, compact = false }: { onFiles: (f: File[]) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`drop ${over ? 'on' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]) }}
      onClick={() => input.current?.click()}
      onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) onFiles(f) }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
    >
      <Upload size={compact ? 14 : 20} />
      <span>{compact ? 'Dosya ekle' : 'Dosyaları buraya bırak, tıkla ya da Ctrl+V ile yapıştır'}</span>
      <small className="muted">En çok 500 MB</small>
      <input ref={input} type="file" multiple hidden onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
    </div>
  )
}

// Yükleme + kayıt + akış: hem bu bileşen hem Dosyalar sayfası kullanır
export function useUpload(insert: (f: Partial<FileRow>) => Promise<FileRow>, extra: Partial<FileRow>, where: string, link: string | null) {
  const { me } = usePeople()
  const { toast } = useStore()
  const [busy, setBusy] = useState(0)
  const [progress, setProgress] = useState<string | null>(null)
  async function upload(files: File[]) {
    for (const file of files) {
      setBusy((n) => n + 1)
      try {
        const stored = await uploadFile(file, (p) => setProgress(p < 1 ? `${file.name} %${Math.round(p * 100)}` : null))
        await insert({ folder: 'Genel', ...extra, ...stored, uploaded_by: me.email })
        logActivity(me.email, `${where}${file.name} yükledi`, link).catch(() => {})
        toast(`${file.name} yüklendi`)
      } catch (e) {
        toast('Yüklenemedi: ' + (e as Error).message, 'warn')
      } finally {
        setBusy((n) => n - 1)
        setProgress(null)
      }
    }
  }
  return { upload, busy, progress }
}

// İmzalı adresle küçük resimler (1 saat geçerli)
export function useThumbs(files: FileRow[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = files.filter((f) => fileKind(f) === 'image').map((f) => f.path).join('|')
  useEffect(() => {
    const paths = key ? key.split('|') : []
    fileUrls(paths).then(setUrls).catch(() => {})
  }, [key])
  return urls
}

export function FileTile({ f, thumb, onDelete }: { f: FileRow; thumb?: string; onDelete: () => void }) {
  const { nameOf } = usePeople()
  const { toast } = useStore()
  const kind = fileKind(f)
  const Icon = kindIcon[kind]
  const open = (dl = false) => openFile(f, dl).catch((e) => toast('Açılamadı: ' + e.message, 'warn'))
  return (
    <div className="ftile">
      <button type="button" className="ftile-thumb" onClick={() => open()} title="Aç">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon size={22} />}
      </button>
      <div className="ftile-info">
        <b title={f.name}>{f.name}</b>
        <small>{fileSize(f.size)} · {nameOf(f.uploaded_by)} · {trDateTime(f.created_at)}</small>
      </div>
      <div className="ftile-act">
        <button type="button" className="icon-btn" onClick={() => open(true)} aria-label="İndir" title="İndir"><Download size={13} /></button>
        <button type="button" className="icon-btn" onClick={onDelete} aria-label="Sil" title="Sil"><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

export function useRemoveFile(remove: (id: number) => Promise<void>) {
  const { toast } = useStore()
  return async (f: FileRow) => {
    if (!window.confirm(`"${f.name}" silinsin mi?`)) return
    try {
      await remove(f.id)
      await deleteStored(f)
      toast('Dosya silindi', 'info')
    } catch (e) {
      toast('Silinemedi: ' + (e as Error).message, 'warn')
    }
  }
}

// Görev ya da notun ekleri
export default function Attachments({ taskId, noteId, gameId, folder, label }: { taskId?: number; noteId?: number; gameId?: string | null; folder?: string; label: string }) {
  const filter: [string, number] = taskId ? ['task_id', taskId] : ['note_id', noteId!]
  const all = useRows<FileRow>('files', [], { order: 'created_at', filter })
  const { insert, remove } = all
  // Demo modda süzgeç veritabanında çalışmaz; burada da süz
  const rows = all.rows.filter((f) => (taskId ? f.task_id === taskId : f.note_id === noteId))
  const link = taskId ? `/gorevler?id=${taskId}` : `/notlar?id=${noteId}`
  const { upload, busy, progress } = useUpload(insert, { task_id: taskId ?? null, note_id: noteId ?? null, game_id: gameId ?? null, folder: folder ?? 'Genel' }, `“${label}” içine `, link)
  const thumbs = useThumbs(rows)
  const del = useRemoveFile(remove)
  return (
    <div className="attach">
      <div className="card-sub flex" style={{ gap: 6, marginBottom: 8 }}>
        <Paperclip size={12} /> Dosyalar {rows.length > 0 && <span className="chip">{rows.length}</span>}
        {busy > 0 && <span className="muted">· {progress ?? `${busy} yükleniyor…`}</span>}
      </div>
      <div className="ftiles">
        {rows.map((f) => <FileTile key={f.id} f={f} thumb={thumbs[f.path]} onDelete={() => del(f)} />)}
      </div>
      <DropZone compact onFiles={upload} />
    </div>
  )
}
