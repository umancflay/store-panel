import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderPlus, ListTodo, NotebookPen, Search } from 'lucide-react'
import { useData } from '../lib/data'
import { useRows } from '../lib/rows'
import { fileKind, fileSize, type FileKind } from '../lib/files'
import { taskCode, type FileRow } from '../lib/types'
import { DropZone, FileTile, useRemoveFile, useThumbs, useUpload } from '../components/Attachments'
import { SampleBanner } from '../components/ui'

const kinds: { id: FileKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Hepsi' },
  { id: 'image', label: 'Görsel' },
  { id: 'video', label: 'Video' },
  { id: 'doc', label: 'Doküman' },
  { id: 'pdf', label: 'PDF' },
  { id: 'archive', label: 'Arşiv / build' },
]

// Ortak klasör: iki kişinin paylaştığı tüm dosyalar (görev ve not ekleri dahil)
export default function Files() {
  const { games } = useData()
  const { rows, insert, update, remove } = useRows<FileRow>('files', [], { order: 'created_at', ascending: false })
  const [folder, setFolder] = useState<string | null>(null)
  const [kind, setKind] = useState<FileKind | 'all'>('all')
  const [game, setGame] = useState('')
  const [q, setQ] = useState('')
  const [extra, setExtra] = useState<string[]>([])

  const folders = [...new Set([...rows.map((f) => f.folder), ...extra])].sort((a, b) => a.localeCompare(b, 'tr'))
  const list = rows
    .filter((f) => (!folder || f.folder === folder) && (kind === 'all' || fileKind(f) === kind) && (!game || f.game_id === game) && (!q || f.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const target = folder ?? 'Genel'
  const { upload, busy } = useUpload(insert, { folder: target, game_id: game || null }, `${target} klasörüne `, '/dosyalar')
  const thumbs = useThumbs(list)
  const del = useRemoveFile(remove)
  const total = rows.reduce((a, f) => a + f.size, 0)

  function newFolder() {
    const name = window.prompt('Klasör adı')?.trim()
    if (!name) return
    setExtra((x) => [...x, name])
    setFolder(name)
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head">
        <span className="eyebrow">Dosyalar</span>
        <h1>Ortak klasör</h1>
        <p>Görseller, videolar, build'ler, dokümanlar. İkiniz de görür; görev ve not ekleri de burada toplanır. Toplam {fileSize(total)} (ücretsiz alan 1 GB).</p>
      </div>

      <div className="notes-layout files-layout">
        <nav className="notes-side" aria-label="Klasörler">
          <span className="card-sub" style={{ padding: '0 10px 8px' }}>Klasörler</span>
          <button type="button" className={`side-link ${!folder ? 'on' : ''}`} onClick={() => setFolder(null)}>
            <span className="sq" /> Tümü <span className="muted" style={{ marginLeft: 'auto' }}>{rows.length}</span>
          </button>
          {folders.map((f) => (
            <button key={f} type="button" className={`side-link ${folder === f ? 'on' : ''}`} onClick={() => setFolder(f)}>
              <span className="sq" /> {f} <span className="muted" style={{ marginLeft: 'auto' }}>{rows.filter((x) => x.folder === f).length}</span>
            </button>
          ))}
          <button type="button" className="side-link" onClick={newFolder}><FolderPlus size={12} /> Yeni klasör</button>
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <DropZone onFiles={upload} />
          {busy > 0 && <div className="muted small">{busy} dosya yükleniyor…</div>}
          <div className="flex wrap" style={{ gap: 10 }}>
            <label className="search" style={{ flex: '1 1 200px' }}>
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dosya ara" aria-label="Dosya ara" />
            </label>
            <select className="select" style={{ width: 'auto' }} value={game} onChange={(e) => setGame(e.target.value)} aria-label="Oyun">
              <option value="">Tüm oyunlar</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            {kinds.map((k) => <button key={k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>{k.label}</button>)}
          </div>

          {list.length === 0 && <div className="empty">{rows.length ? 'Bu süzgece uyan dosya yok.' : 'Henüz dosya yok. Yukarıya sürükleyip bırak.'}</div>}
          <div className="ftiles grid-files">
            {list.map((f) => (
              <div key={f.id} className="fcell">
                <FileTile f={f} thumb={thumbs[f.path]} onDelete={() => del(f)} />
                <div className="flex wrap" style={{ gap: 6, padding: '0 4px' }}>
                  <select
                    className="select mini"
                    value={f.folder}
                    onChange={(e) => update(f.id, { folder: e.target.value })}
                    aria-label="Klasörü değiştir"
                  >
                    {[...new Set([f.folder, ...folders, 'Genel'])].map((x) => <option key={x}>{x}</option>)}
                  </select>
                  {f.task_id && <Link className="chip" to={`/gorevler?id=${f.task_id}`}><ListTodo size={10} /> {taskCode(f.task_id)}</Link>}
                  {f.note_id && <Link className="chip" to={`/notlar?id=${f.note_id}`}><NotebookPen size={10} /> Not</Link>}
                  {f.game_id && <span className="chip">{games.find((g) => g.id === f.game_id)?.name ?? f.game_id}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
