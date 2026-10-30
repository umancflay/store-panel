import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clapperboard, Download, Film, Image as ImageIcon, Loader2, Plus, RefreshCw, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { fileUrls, uploadFile } from '../lib/files'
import { triggerWorkflow } from '../lib/trigger'
import { trDateTime } from '../lib/rows'
import { GameLogo, SampleBanner } from '../components/ui'

// Reklam Stüdyosu: oyun seç → 3 fikir (çekim listesiyle) → kayıtları ekle → video + mağaza görselleri → onayla → paket.
// Projeler app_settings.ad_projects'te; fikir yazma ve video birleştirme asistan işinde (scripts/studio.mjs).
// Durumlar dürüst: fikir "denenecek fikir"dir, video senin onayından önce "hazır" sayılmaz, hiçbir şey kendiliğinden yayınlanmaz.

type Shot = { seconds: number; record: string; text: string; fileId?: number | null; fileName?: string }
type Idea = { id: string; title: string; platform: string; why: string; evidence: 'trend' | 'veri' | 'yok'; hook: string; shots: Shot[]; endText: string; storeHeadline: string }
type Out = { path: string; fileId: number | null }
type Status = 'ideas_requested' | 'pick' | 'recording' | 'render_requested' | 'review' | 'ready' | 'published' | 'failed_ideas' | 'failed_render'
interface Project {
  id: string; gameId: string; status: Status; by: string; createdAt: string; updatedAt?: string; note?: string
  ideas?: Idea[]; idea?: Idea; outputs?: { video?: Out; feature?: Out; square?: Out }; seconds?: number; error?: string | null; publishedOn?: string
}
type GameFile = { id: number; name: string; mime: string | null; created_at: string }

const waiting = (s: Status) => s === 'ideas_requested' || s === 'render_requested'
const statusLabel: Record<Status, [string, string]> = {
  ideas_requested: ['Fikirler hazırlanıyor', 'b-warning'],
  pick: ['Fikir seç', 'b-primary'],
  recording: ['Kayıt eksik', 'b-warning'],
  render_requested: ['Video hazırlanıyor', 'b-warning'],
  review: ['İnceleme bekliyor', 'b-primary'],
  ready: ['Paket hazır', 'b-ok'],
  published: ['Yayımlandı', 'b-ok'],
  failed_ideas: ['Hata', 'b-critical'],
  failed_render: ['Hata', 'b-critical'],
}
const steps = ['Fikir', 'Çekim', 'Video', 'İnceleme', 'Paket']
const stepOf: Record<Status, number> = { ideas_requested: 0, pick: 0, failed_ideas: 0, recording: 1, render_requested: 2, failed_render: 2, review: 3, ready: 4, published: 4 }
const evidenceText = { trend: 'Dayanak: güncel trend', veri: 'Dayanak: senin reklam verin', yok: 'Dayanak yok, deneme' }

const demoProjects: Project[] = [{
  id: 'demo1', gameId: 'salgin', status: 'recording', by: 'demo', createdAt: new Date().toISOString(),
  idea: {
    id: 'i0', title: 'Son 10 saniye kurtarışı', platform: 'TikTok', evidence: 'trend', why: 'Bu ay "fail → kurtarış" kurgusu oyun reklamlarında en çok izlenen kurgu.',
    hook: 'Ekran kırmızı, zombi kapıda: "Bunu kurtarabilir misin?"', endText: 'Play free now', storeHeadline: 'Hayatta kal',
    shots: [
      { seconds: 3, record: 'Kalabalık zombilerin üssü sardığı an (oyun içi kayıt)', text: 'Only 1% survive this', fileId: 1, fileName: 'kayit1.mp4' },
      { seconds: 5, record: 'Son anda barikat kurma', text: 'Watch this...' },
      { seconds: 4, record: 'Üssün kurtulduğu, ekranın yeşile döndüğü an', text: 'Can you do better?' },
    ],
  },
}]

function useProjects() {
  const [items, setItems] = useState<Project[]>(isDemo ? demoProjects : [])
  const [loading, setLoading] = useState(!isDemo)
  const load = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase!.from('app_settings').select('value').eq('key', 'ad_projects').maybeSingle()
    setItems(((data as { value?: { items?: Project[] } } | null)?.value?.items ?? []))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  // Asistan işi çalışırken durum değişsin diye 10 saniyede bir yenile
  const busy = items.some((p) => waiting(p.status))
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [busy, load])
  // Asistan da aynı anahtara yazıyor: her değişiklikte son hali okunur, sadece ilgili proje değişir
  const write = useCallback(async (fn: (list: Project[]) => Project[]) => {
    if (isDemo) return setItems((l) => fn(l))
    const { data } = await supabase!.from('app_settings').select('value').eq('key', 'ad_projects').maybeSingle()
    const next = fn(((data as { value?: { items?: Project[] } } | null)?.value?.items ?? []))
    const { error } = await supabase!.from('app_settings').upsert({ key: 'ad_projects', value: { items: next }, updated_at: new Date().toISOString() } as never)
    if (error) throw new Error(error.message)
    setItems(next)
  }, [])
  const patch = (id: string, p: Partial<Project>) => write((l) => l.map((x) => (x.id === id ? { ...x, ...p, updatedAt: new Date().toISOString() } : x)))
  return { items, loading, load, write, patch }
}

function Elapsed({ since }: { since?: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const s = since ? Math.max(0, Math.round((now - Date.parse(since)) / 1000)) : 0
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
}

export default function Studio() {
  const { games } = useData()
  const { me } = usePeople()
  const { toast } = useStore()
  const { items, loading, write, patch } = useProjects()
  const [gameId, setGameId] = useState<string>(() => items[0]?.gameId ?? games[0]?.id ?? '')
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const gid = gameId || games[0]?.id || ''
  const list = items.filter((p) => p.gameId === gid).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const open = list.find((p) => p.id === openId) ?? list[0]

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast(ok)
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }
  const start = () => run(async () => {
    const p: Project = { id: crypto.randomUUID(), gameId: gid, status: 'ideas_requested', by: me.email, createdAt: new Date().toISOString(), note: note.trim() || undefined }
    await write((l) => [...l, p])
    setOpenId(p.id)
    setNote('')
    triggerWorkflow('assistant.yml')
  }, 'Fikirler hazırlanıyor; genelde 1-2 dakika')

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head">
        <span className="eyebrow">Reklam</span>
        <h1>Reklam Stüdyosu</h1>
        <p>Oyun seç, fikir seç, kayıtları ekle. Video ve mağaza görselleri hazırlanır, sen onaylarsın.</p>
      </div>

      <div className="flex wrap" style={{ gap: 6 }}>
        {games.map((g) => (
          <button key={g.id} type="button" className={`chip-btn ${g.id === gid ? 'on' : ''}`} onClick={() => { setGameId(g.id); setOpenId(null) }}>
            <GameLogo id={g.id} size={18} /> {g.name}
          </button>
        ))}
      </div>

      <section className="card studio-new">
        <Sparkles size={18} color="var(--green)" />
        <input className="input grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="İstersen not ekle: ör. yeni boss bölümünü göster" aria-label="Not" />
        <button type="button" className="btn btn-primary" onClick={start} disabled={!gid}><Plus size={14} /> Yeni reklam: 3 fikir</button>
      </section>

      {loading ? <div className="empty">Yükleniyor…</div> : list.length === 0 ? (
        <div className="empty">Bu oyun için henüz reklam projesi yok.</div>
      ) : (
        <>
          {list.length > 1 && (
            <div className="studio-list">
              {list.map((p) => {
                const [t, c] = statusLabel[p.status]
                return (
                  <button key={p.id} type="button" className={`studio-item ${open?.id === p.id ? 'on' : ''}`} onClick={() => setOpenId(p.id)}>
                    <b>{p.idea?.title ?? 'Yeni reklam'}</b>
                    <span className={`badge ${c}`}>{t}</span>
                  </button>
                )
              })}
            </div>
          )}
          {open && <ProjectView key={open.id} p={open} patch={patch} remove={() => run(() => write((l) => l.filter((x) => x.id !== open.id)), 'Proje silindi')} run={run} me={me.email} />}
        </>
      )}
    </div>
  )
}

function ProjectView({ p, patch, remove, run, me }: { p: Project; patch: (id: string, x: Partial<Project>) => Promise<void>; remove: () => void; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; me: string }) {
  const step = stepOf[p.status]
  const [t, c] = statusLabel[p.status]
  const idea = p.idea
  const filled = idea ? idea.shots.filter((s) => s.fileId).length : 0
  const req = (status: Status, x: Partial<Project> = {}) => patch(p.id, { status, error: null, ...x }).then(() => { triggerWorkflow('assistant.yml') })

  return (
    <section className="card studio-project">
      <div className="card-head">
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><Clapperboard size={16} /> {idea?.title ?? 'Yeni reklam'}</div>
          <div className="card-sub">{trDateTime(p.createdAt)}{idea && <> · {idea.platform}</>}{p.note && <> · not: {p.note}</>}</div>
        </div>
        <div className="flex" style={{ gap: 6 }}>
          <span className={`badge ${c}`}>{p.status === 'recording' && idea ? `Kayıt eksik ${filled}/${idea.shots.length}` : t}</span>
          <button type="button" className="btn btn-ghost sm" onClick={remove} aria-label="Projeyi sil"><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="studio-steps">
        {steps.map((s, i) => <span key={s} className={i < step || p.status === 'published' || p.status === 'ready' ? 'done' : i === step ? 'now' : ''}>{s}</span>)}
      </div>

      {waiting(p.status) && (
        <div className="studio-wait"><Loader2 size={16} className="spin" /> {p.status === 'ideas_requested' ? 'Claude trendlere ve reklam verine bakıp fikir yazıyor' : 'Kayıtlar birleştiriliyor, yazılar ekleniyor'}… <Elapsed since={p.updatedAt ?? p.createdAt} /></div>
      )}

      {(p.status === 'failed_ideas' || p.status === 'failed_render') && (
        <div className="studio-wait bad">
          <X size={16} /> {p.error ?? 'Bilinmeyen hata'}
          <button type="button" className="btn sm" onClick={() => run(() => req(p.status === 'failed_ideas' ? 'ideas_requested' : 'render_requested'))}><RefreshCw size={12} /> Tekrar dene</button>
        </div>
      )}

      {p.status === 'pick' && p.ideas && (
        <div className="trend-grid">
          {p.ideas.map((i) => (
            <div key={i.id} className="trend">
              <div className="flex between"><span className="badge b-muted">{i.platform}</span><span className="muted" style={{ fontSize: 10 }}>{i.shots.reduce((a, s) => a + s.seconds, 0)} sn · {i.shots.length} çekim</span></div>
              <b>{i.title}</b>
              <p>{i.hook}</p>
              <span className="trend-why">{evidenceText[i.evidence]} · {i.why}</span>
              <button type="button" className="btn btn-primary sm" style={{ marginTop: 'auto' }} onClick={() => run(() => patch(p.id, { status: 'recording', idea: i }))}><Check size={13} /> Bunu çekelim</button>
            </div>
          ))}
        </div>
      )}

      {idea && (p.status === 'recording' || p.status === 'failed_render') && (
        <Shots p={p} idea={idea} patch={patch} run={run} me={me} onRender={() => run(() => req('render_requested'), 'Video hazırlanıyor; genelde 2-4 dakika')} />
      )}

      {(p.status === 'review' || p.status === 'ready' || p.status === 'published') && p.outputs && (
        <Outputs p={p} onApprove={() => run(() => patch(p.id, { status: 'ready' }), 'Paket hazır')} onRedo={() => run(() => patch(p.id, { status: 'recording' }))}
          onPublished={(on) => run(() => patch(p.id, { status: 'published', publishedOn: on }))} />
      )}
    </section>
  )
}

function Shots({ p, idea, patch, run, me, onRender }: { p: Project; idea: Idea; patch: (id: string, x: Partial<Project>) => Promise<void>; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; me: string; onRender: () => void }) {
  const [files, setFiles] = useState<GameFile[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const target = useRef(0)
  useEffect(() => {
    if (isDemo) return
    supabase!.from('files').select('id,name,mime,created_at').eq('game_id', p.gameId).or('mime.like.video*,mime.like.image*').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setFiles((data as GameFile[]) ?? []))
  }, [p.gameId])
  const setShot = (i: number, x: Partial<Shot>) => patch(p.id, { idea: { ...idea, shots: idea.shots.map((s, n) => (n === i ? { ...s, ...x } : s)) } })

  async function onFile(f: File) {
    const i = target.current
    setBusy(i)
    await run(async () => {
      if (!f.type.startsWith('video/') && !f.type.startsWith('image/')) throw new Error('Video ya da resim seç')
      if (f.size > 45 * 1024 * 1024) throw new Error('Çekim 45 MB\'tan küçük olmalı (kısa kayıt yeter)')
      const meta = await uploadFile(f)
      let id = Date.now()
      if (!isDemo) {
        const { data, error } = await supabase!.from('files').insert({ ...meta, folder: 'Reklam', game_id: p.gameId, uploaded_by: me } as never).select('id').single()
        if (error) throw new Error(error.message)
        id = (data as { id: number }).id
        setFiles((l) => [{ id, name: meta.name, mime: meta.mime, created_at: new Date().toISOString() }, ...l])
      }
      await setShot(i, { fileId: id, fileName: meta.name })
    }, 'Kayıt eklendi')
    setBusy(null)
  }

  const ready = idea.shots.every((s) => s.fileId)
  return (
    <div className="shots">
      <div className="muted small">Kanca: <b style={{ color: '#fff' }}>{idea.hook}</b></div>
      {idea.shots.map((s, i) => (
        <div key={i} className={`shot ${s.fileId ? 'ok' : ''}`}>
          <span className="shot-n">{i + 1}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small"><b>{s.seconds} sn</b> · {s.record}</div>
            <input className="input sm" defaultValue={s.text} maxLength={40} onBlur={(e) => e.target.value !== s.text && run(() => setShot(i, { text: e.target.value }))} placeholder="Ekran yazısı (boş bırakılabilir)" aria-label={`${i + 1}. çekim yazısı`} />
          </div>
          <div className="shot-file">
            {s.fileId ? <span className="small flex" style={{ gap: 4 }}><Check size={12} color="var(--green)" /> {s.fileName ?? 'kayıt'}</span> : <span className="small" style={{ color: '#E8C07A' }}>Kayıt eksik</span>}
            <div className="flex" style={{ gap: 4 }}>
              <button type="button" className="btn sm" disabled={busy !== null} onClick={() => { target.current = i; input.current?.click() }}>
                {busy === i ? <Loader2 size={12} className="spin" /> : <Upload size={12} />} Yükle
              </button>
              {files.length > 0 && (
                <select className="select sm" value="" onChange={(e) => { const f = files.find((x) => x.id === Number(e.target.value)); if (f) run(() => setShot(i, { fileId: f.id, fileName: f.name })) }} aria-label="Dosyalardan seç">
                  <option value="">Dosyalardan…</option>
                  {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
      ))}
      <input ref={input} type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      <div className="flex between wrap" style={{ gap: 8 }}>
        <span className="muted small">Sonda kapanış kartı: “{idea.endText}” · mağaza görseli yazısı: “{idea.storeHeadline}”</span>
        <button type="button" className="btn btn-green" disabled={!ready} onClick={onRender}><Film size={14} /> Videoyu hazırla</button>
      </div>
    </div>
  )
}

function Outputs({ p, onApprove, onRedo, onPublished }: { p: Project; onApprove: () => void; onRedo: () => void; onPublished: (on: string) => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const o = p.outputs!
  useEffect(() => {
    fileUrls([o.video?.path, o.feature?.path, o.square?.path].filter((x): x is string => !!x)).then(setUrls)
  }, [o.video?.path, o.feature?.path, o.square?.path])
  const dl = (path?: string) => (path && urls[path] ? urls[path] : undefined)
  return (
    <div className="outputs">
      <div className="outputs-grid">
        {o.video && <video className="out-video" src={dl(o.video.path)} controls playsInline preload="metadata" />}
        <div className="out-side">
          {o.feature && <img src={dl(o.feature.path)} alt="Mağaza görseli 1024x500" />}
          {o.square && <img src={dl(o.square.path)} alt="Kare görsel 1080x1080" style={{ maxWidth: 220 }} />}
          <div className="muted small">Video {p.seconds ? `${Math.round(p.seconds)} sn` : ''} · sessiz (müziği platformda eklersin) · Dosyalar › Reklam klasöründe</div>
        </div>
      </div>
      <div className="flex wrap" style={{ gap: 8 }}>
        {p.status === 'review' && <>
          <button type="button" className="btn btn-green" onClick={onApprove}><Check size={14} /> Onayla</button>
          <button type="button" className="btn" onClick={onRedo}><RefreshCw size={14} /> Çekimleri değiştir</button>
        </>}
        {p.status !== 'review' && <>
          {o.video && <a className="btn" href={dl(o.video.path)} download><Download size={14} /> Video</a>}
          {o.feature && <a className="btn" href={dl(o.feature.path)} download><ImageIcon size={14} /> 1024x500</a>}
          {o.square && <a className="btn" href={dl(o.square.path)} download><ImageIcon size={14} /> Kare</a>}
        </>}
        {p.status === 'ready' && (
          <select className="select" value="" onChange={(e) => e.target.value && onPublished(e.target.value)} aria-label="Yayımlandı olarak işaretle" style={{ width: 'auto' }}>
            <option value="">Yayımladım…</option>
            {['TikTok', 'Instagram', 'Google Ads', 'YouTube', 'Play Store sayfası'].map((x) => <option key={x}>{x}</option>)}
          </select>
        )}
        {p.status === 'published' && <span className="badge b-ok">Yayımlandı · {p.publishedOn}</span>}
      </div>
    </div>
  )
}
