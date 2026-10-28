import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Check, Clock, FolderOpen, NotebookPen, Play, Plus, Zap } from 'lucide-react'
import { usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, addDays, today, trDate, trDateTime } from '../lib/rows'
import { usePresence } from '../lib/presence'
import { logActivity } from '../lib/files'
import { navGroups } from '../components/Layout'
import { demoEvents, demoNotes, demoTasks } from '../data/demo'
import { ASSISTANT, levelLabel, taskCode, type Activity, type CalEvent, type FileRow, type Note, type Task, type TaskStatus } from '../lib/types'
import { FileTile, useRemoveFile, useThumbs } from '../components/Attachments'
import { GameLogo, SampleBanner, initials } from '../components/ui'

const levelRank = { critical: 0, medium: 1, low: 2 }
const levelColor = { critical: '#FF7A55', medium: '#E8C07A', low: '#8FD3AE' }
const pageName = (path: string) =>
  navGroups.flatMap((g) => g.items).find((i) => i.to !== '/' && path.startsWith(i.to))?.label ?? (path === '/' ? 'Ana sayfa' : 'panel')

// Çalışma alanı: iki kişinin ortak panosu. Kim ne yapıyor, bu hafta ne bitmeli, son ne oldu.
export default function Workspace() {
  const { me, partner, nameOf } = usePeople()
  const { toast } = useStore()
  const tasks = useRows<Task>('tasks', demoTasks, { order: 'created_at', ascending: false })
  const events = useRows<CalEvent>('events', demoEvents, { order: 'date' })
  const notes = useRows<Note>('notes', demoNotes, { order: 'updated_at', ascending: false })
  const files = useRows<FileRow>('files', [], { order: 'created_at', ascending: false })
  const feed = useRows<Activity>('activity', [], { order: 'created_at', ascending: false })
  const online = usePresence()
  const [title, setTitle] = useState('')
  const [who, setWho] = useState('')

  const t0 = today()
  const week = addDays(t0, 7)
  const open = tasks.rows.filter((t) => t.status !== 'done')
  const sortTasks = (a: Task, b: Task) =>
    (a.status === 'doing' ? 0 : 1) - (b.status === 'doing' ? 0 : 1) ||
    levelRank[a.level] - levelRank[b.level] ||
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  const mine = open.filter((t) => t.assignee === me.email).sort(sortTasks)
  const theirs = partner ? open.filter((t) => t.assignee === partner.email).sort(sortTasks) : []
  const late = open.filter((t) => t.due_date && t.due_date < t0)
  const doneWeek = tasks.rows.filter((t) => t.status === 'done' && (t.updated_at ?? t.created_at) >= addDays(t0, -7))
  const unassigned = open.filter((t) => !t.assignee)
  const upcoming = [
    ...open.filter((t) => t.due_date && t.due_date <= week).map((t) => ({ date: t.due_date!, title: t.title, who: t.assignee, link: `/gorevler?id=${t.id}`, kind: 'Görev' })),
    ...events.rows.filter((e) => e.date >= t0 && e.date <= week).map((e) => ({ date: e.date, title: e.title, who: null, link: '/takvim', kind: 'Takvim' })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const recentFiles = [...files.rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)
  const thumbs = useThumbs(recentFiles)
  const delFile = useRemoveFile(files.remove)
  const activity = [...feed.rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 14)
  const recentNotes = [...notes.rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4)

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const assignee = who || me.email
    try {
      const row = await tasks.insert({
        title: title.trim(), status: 'open', level: 'medium', assignee, created_by: me.email, tags: [], subtasks: [],
        history: [{ what: 'Çalışma alanından eklendi', at: new Date().toISOString() }],
      })
      logActivity(me.email, `${taskCode(row.id)} ${row.title} görevini açtı${assignee !== me.email ? ` → ${nameOf(assignee)}` : ''}`, `/gorevler?id=${row.id}`).catch(() => {})
      setTitle('')
      toast(assignee === me.email ? 'Görev eklendi' : `Görev ${nameOf(assignee)} için eklendi`)
    } catch (err) {
      toast('Eklenemedi: ' + (err as Error).message, 'warn')
    }
  }

  async function setStatus(t: Task, status: TaskStatus) {
    const what = status === 'doing' ? 'Başladı' : 'Bitti'
    try {
      await tasks.update(t.id, { status, history: [...t.history, { what, at: new Date().toISOString() }], updated_at: new Date().toISOString() })
      logActivity(me.email, `${taskCode(t.id)} ${t.title} · ${what}`, `/gorevler?id=${t.id}`).catch(() => {})
      if (status === 'done') toast(`${taskCode(t.id)} bitti`)
    } catch (err) {
      toast('Kaydedilemedi: ' + (err as Error).message, 'warn')
    }
  }

  const partnerOnline = partner ? online[partner.email] : undefined
  const stats = [
    { label: 'Benim açık işlerim', value: mine.length, to: '/gorevler' },
    { label: partner ? `${partner.name} üzerinde` : 'Ortağın işleri', value: theirs.length, to: '/gorevler' },
    { label: 'Geciken', value: late.length, to: '/gorevler', hot: late.length > 0 },
    { label: 'Son 7 günde biten', value: doneWeek.length, to: '/gorevler' },
  ]

  const taskList = (list: Task[], emptyText: string) =>
    list.length === 0 ? (
      <div className="empty" style={{ padding: 18 }}>{emptyText}</div>
    ) : (
      list.slice(0, 8).map((t) => {
        const isLate = t.due_date && t.due_date < t0
        return (
          <div key={t.id} className="wtask">
            <span className="dot" style={{ background: levelColor[t.level] }} title={levelLabel[t.level]} />
            {t.game_id && <GameLogo id={t.game_id} size={22} />}
            <Link to={`/gorevler?id=${t.id}`} className="wtask-title">
              <span className="muted small">{taskCode(t.id)}</span> {t.title}
              {t.status === 'doing' && <span className="badge b-warning" style={{ marginLeft: 6 }}>Sürüyor</span>}
            </Link>
            {t.due_date && <span className="small" style={{ color: isLate ? 'var(--orange)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{trDate(t.due_date)}</span>}
            {t.status === 'open' ? (
              <button type="button" className="icon-btn" title="Başla" aria-label="Başla" onClick={() => setStatus(t, 'doing')}><Play size={12} /></button>
            ) : (
              <button type="button" className="icon-btn" title="Bitti" aria-label="Bitti" onClick={() => setStatus(t, 'done')}><Check size={13} /></button>
            )}
          </div>
        )
      })
    )

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Çalışma alanı</span>
          <h1>Merhaba {me.name}</h1>
          <p>
            {partner
              ? partnerOnline
                ? <><span className="online-dot" /> {partner.name} şu an çevrimiçi · {pageName(partnerOnline.page)} sayfasında</>
                : <>{partner.name} şu an çevrimdışı. Yazdığın yorum ve görevler o girince görünür.</>
              : 'Ortağın henüz eklenmemiş: README › 1. aşama › Adım 4 (hesap aç, admins listesine ekle).'}
          </p>
        </div>
        <div className="flex wrap" style={{ gap: 8 }}>
          <Link to="/notlar" className="btn"><NotebookPen size={14} /> Notlar</Link>
          <Link to="/dosyalar" className="btn"><FolderOpen size={14} /> Dosyalar</Link>
          <Link to="/gorevler" className="btn btn-primary">Pano <ArrowRight size={14} /></Link>
        </div>
      </div>

      <form className="card quick" onSubmit={quickAdd}>
        <Zap size={16} color="var(--green)" />
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hızlı görev: ne yapılacak? (Enter ekler)" aria-label="Hızlı görev" />
        <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Kime">
          <option value="">Bana</option>
          {partner && <option value={partner.email}>{partner.name}</option>}
          <option value={ASSISTANT}>Asistan</option>
        </select>
        <button className="btn btn-primary" type="submit" disabled={!title.trim()}><Plus size={14} /> Ekle</button>
      </form>

      <div className="grid g-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="card stat" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.hot ? 'var(--orange)' : undefined }}>{s.value}</span>
          </Link>
        ))}
      </div>

      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-head">
            <div className="flex" style={{ gap: 10 }}>
              <span className="avatar">{initials(me.name)}</span>
              <div>
                <div className="card-title">Benim sıram</div>
                <div className="card-sub">Sürenler önce, sonra önceliğe ve tarihe göre</div>
              </div>
            </div>
          </div>
          {taskList(mine, 'Sende açık iş yok. Yukarıdan hızlı görev ekleyebilirsin.')}
        </section>
        <section className="card">
          <div className="card-head">
            <div className="flex" style={{ gap: 10 }}>
              <span className="avatar alt" style={{ position: 'relative' }}>
                {initials(partner?.name ?? '?')}
                {partnerOnline && <span className="online-dot abs" />}
              </span>
              <div>
                <div className="card-title">{partner ? `${partner.name} üzerinde` : 'Ortağın işleri'}</div>
                <div className="card-sub">{unassigned.length > 0 ? `${unassigned.length} iş kimseye atanmamış` : 'Ne üzerinde çalıştığı'}</div>
              </div>
            </div>
          </div>
          {taskList(theirs, partner ? `${partner.name} üzerinde açık iş yok.` : 'Henüz ortak eklenmemiş.')}
        </section>
      </div>

      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-title flex" style={{ gap: 8 }}><CalendarDays size={16} /> Bu hafta</div>
          <div className="card-sub" style={{ marginBottom: 8 }}>Önümüzdeki 7 günün son tarihleri ve takvim</div>
          {upcoming.length === 0 && <div className="empty" style={{ padding: 18 }}>Bu hafta tarihli iş yok.</div>}
          {upcoming.slice(0, 10).map((u, i) => (
            <Link key={i} to={u.link} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="chip" style={{ minWidth: 64, textAlign: 'center', color: u.date < t0 ? 'var(--orange)' : undefined }}>{u.date === t0 ? 'Bugün' : trDate(u.date)}</span>
              <span className="grow small">{u.title}</span>
              <span className="muted small">{u.who ? nameOf(u.who) : u.kind}</span>
            </Link>
          ))}
        </section>

        <section className="card">
          <div className="card-title flex" style={{ gap: 8 }}><Clock size={16} /> Ekip akışı</div>
          <div className="card-sub" style={{ marginBottom: 8 }}>Kim ne yaptı · canlı güncellenir</div>
          {activity.length === 0 && <div className="empty" style={{ padding: 18 }}>Henüz bir hareket yok. Görev açtıkça, dosya yükledikçe burada görünür.</div>}
          <div className="feed">
            {activity.map((a) => {
              const body = (
                <>
                  <span className={`avatar sm ${a.who === me.email ? '' : 'alt'}`}>{initials(nameOf(a.who))}</span>
                  <span className="grow small"><b style={{ fontWeight: 500 }}>{nameOf(a.who)}</b> <span className="muted">{a.what}</span></span>
                  <span className="muted" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{trDateTime(a.created_at)}</span>
                </>
              )
              return a.link ? <Link key={a.id} to={a.link} className="feed-row">{body}</Link> : <div key={a.id} className="feed-row">{body}</div>
            })}
          </div>
        </section>
      </div>

      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Son dosyalar</div>
              <div className="card-sub">Görevlere, notlara ve ortak klasöre yüklenenler</div>
            </div>
            <Link to="/dosyalar" className="btn sm">Tümü</Link>
          </div>
          {recentFiles.length === 0 ? <div className="empty" style={{ padding: 18 }}>Henüz dosya yok.</div> : (
            <div className="ftiles">{recentFiles.map((f) => <FileTile key={f.id} f={f} thumb={thumbs[f.path]} onDelete={() => delFile(f)} />)}</div>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Son notlar</div>
              <div className="card-sub">En son düzenlenen dokümanlar</div>
            </div>
            <Link to="/notlar" className="btn sm">Tümü</Link>
          </div>
          {recentNotes.length === 0 && <div className="empty" style={{ padding: 18 }}>Henüz not yok.</div>}
          {recentNotes.map((n) => (
            <Link key={n.id} to={`/notlar?id=${n.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <NotebookPen size={14} color="var(--muted)" />
              <span className="grow small">{n.title} <span className="muted">· {n.folder}</span></span>
              <span className="muted small">{nameOf(n.created_by)} · {trDateTime(n.updated_at)}</span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}
