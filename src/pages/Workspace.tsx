import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, FolderOpen, NotebookPen, Play, Plus, Zap } from 'lucide-react'
import { usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, addDays, today, trDate, trDateTime } from '../lib/rows'
import { usePresence } from '../lib/presence'
import { logActivity } from '../lib/files'
import { allPages } from '../components/Layout'
import { demoEvents, demoNotes, demoTasks } from '../data/demo'
import { ASSISTANT, levelLabel, taskCode, type Activity, type CalEvent, type FileRow, type Note, type Task, type TaskStatus } from '../lib/types'
import { FileTile, useRemoveFile, useThumbs } from '../components/Attachments'
import { GameLogo, SampleBanner, Seg, initials } from '../components/ui'
import ClaudePlan from '../components/ClaudePlan'
import Select from '../components/Select'
import { triggerWorkflow } from '../lib/trigger'

const levelRank = { critical: 0, medium: 1, low: 2 }
const levelColor = { critical: '#FF7A55', medium: '#E8C07A', low: '#8FD3AE' }
const pageName = (path: string) =>
  allPages.find((i) => i.to !== '/' && path.startsWith(i.to))?.label ?? (path === '/' ? 'Ana sayfa' : 'panel')
const dayName = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })

type Tab = 'week' | 'feed' | 'recent'

// Çalışma alanı: önce "bugün ne yapmalıyım", sonra ortağın ne yaptığı ve Claude'un haftalık planı.
// Ayrıntılar (hafta, ekip akışı, son eklenenler) tek sekmeli kartta; sayfa kısa ve sakin kalsın.
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
  const [tab, setTab] = useState<Tab>('week')
  const [showAll, setShowAll] = useState(false)

  const t0 = today()
  const week = addDays(t0, 7)
  const open = tasks.rows.filter((t) => t.status !== 'done')
  // Bugün sırası: sürenler, gecikenler, bugün/yarın bitmesi gerekenler, sonra öncelik ve tarih
  const urgency = (t: Task) =>
    t.status === 'doing' ? 0 : t.due_date && t.due_date < t0 ? 1 : t.due_date && t.due_date <= addDays(t0, 1) ? 2 : t.level === 'critical' ? 3 : 4
  const sortTasks = (a: Task, b: Task) =>
    urgency(a) - urgency(b) || levelRank[a.level] - levelRank[b.level] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  const mine = open.filter((t) => t.assignee === me.email).sort(sortTasks)
  const theirs = partner ? open.filter((t) => t.assignee === partner.email).sort(sortTasks) : []
  const late = mine.filter((t) => t.due_date && t.due_date < t0)
  const doneWeek = tasks.rows.filter((t) => t.status === 'done' && (t.updated_at ?? t.created_at) >= addDays(t0, -7))
  const unassigned = open.filter((t) => !t.assignee)
  const forAssistant = open.filter((t) => t.assignee === ASSISTANT)
  const upcoming = [
    ...open.filter((t) => t.due_date && t.due_date <= week).map((t) => ({ date: t.due_date!, title: t.title, who: t.assignee, link: `/gorevler?id=${t.id}`, kind: 'Görev' })),
    ...events.rows.filter((e) => e.date >= t0 && e.date <= week).map((e) => ({ date: e.date, title: e.title, who: null, link: '/takvim', kind: 'Takvim' })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const recentFiles = [...files.rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)
  const thumbs = useThumbs(recentFiles)
  const delFile = useRemoveFile(files.remove)
  const activity = [...feed.rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12)
  const recentNotes = [...notes.rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4)
  const partnerLast = partner ? activity.find((a) => a.who === partner.email) : undefined

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
      if (assignee === ASSISTANT) triggerWorkflow('assistant.yml')
      toast(assignee === me.email ? 'Görev eklendi' : `Görev ${nameOf(assignee)} için eklendi${assignee === ASSISTANT ? '' : ', telefonuna bildirim gider'}`)
    } catch (err) {
      toast('Eklenemedi: ' + (err as Error).message, 'warn')
    }
  }

  async function setStatus(t: Task, status: TaskStatus) {
    const what = status === 'doing' ? 'Başladı' : 'Bitti'
    try {
      await tasks.update(t.id, { status, history: [...t.history, { what, at: new Date().toISOString() }], updated_at: new Date().toISOString() })
      logActivity(me.email, `${taskCode(t.id)} ${t.title} · ${what}`, `/gorevler?id=${t.id}`).catch(() => {})
      if (status === 'done') toast(`${taskCode(t.id)} bitti 🎉`)
    } catch (err) {
      toast('Kaydedilemedi: ' + (err as Error).message, 'warn')
    }
  }

  const partnerOnline = partner ? online[partner.email] : undefined

  const taskRow = (t: Task, actions: boolean) => {
    const isLate = t.due_date && t.due_date < t0
    const soon = t.due_date && !isLate && t.due_date <= addDays(t0, 1)
    return (
      <div key={t.id} className="wtask">
        <span className="dot" style={{ background: levelColor[t.level] }} title={levelLabel[t.level]} />
        {t.game_id && <GameLogo id={t.game_id} size={22} />}
        <Link to={`/gorevler?id=${t.id}`} className="wtask-title">
          {t.title}
          {t.status === 'doing' && <span className="badge b-warning" style={{ marginLeft: 6 }}>Sürüyor</span>}
        </Link>
        {t.due_date && (
          <span className="small" style={{ color: isLate ? 'var(--orange)' : soon ? 'var(--gold)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
            {isLate ? 'Gecikti' : t.due_date === t0 ? 'Bugün' : trDate(t.due_date)}
          </span>
        )}
        {actions &&
          (t.status === 'open' ? (
            <button type="button" className="icon-btn sm" title="Başla" aria-label={`${t.title}: başla`} onClick={() => setStatus(t, 'doing')}><Play size={12} /></button>
          ) : (
            <button type="button" className="icon-btn sm done" title="Bitti" aria-label={`${t.title}: bitti`} onClick={() => setStatus(t, 'done')}><Check size={13} /></button>
          ))}
      </div>
    )
  }

  const shownMine = showAll ? mine : mine.slice(0, 5)

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">{dayName(t0)}</span>
          <h1>Merhaba {me.name}</h1>
          <p>
            {mine.length === 0
              ? 'Bugün sende açık iş yok. Claude\'un önerilerine göz atabilir ya da hızlı görev ekleyebilirsin.'
              : `Sende ${mine.length} açık iş var${late.length ? `, ${late.length} tanesi gecikti` : ''}. Son 7 günde ekip ${doneWeek.length} iş bitirdi.`}
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
        <Select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Kime">
          <option value="">Bana</option>
          {partner && <option value={partner.email}>{partner.name}</option>}
          <option value={ASSISTANT}>Asistan (Claude)</option>
        </Select>
        <button className="btn btn-primary" type="submit" disabled={!title.trim()}><Plus size={14} /> Ekle</button>
      </form>

      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <section className="card today">
          <div className="card-head">
            <div className="flex" style={{ gap: 10 }}>
              <span className="avatar">{initials(me.name)}</span>
              <div>
                <div className="card-title">Bugün sırada</div>
                <div className="card-sub">Sürenler ve gecikenler önce · ▶ başla, ✓ bitti</div>
              </div>
            </div>
            {late.length > 0 && <span className="badge b-critical"><AlertTriangle size={11} /> {late.length} gecikti</span>}
          </div>
          {mine.length === 0 ? <div className="empty" style={{ padding: 18 }}>Sende açık iş yok. 🎉</div> : shownMine.map((t) => taskRow(t, true))}
          {mine.length > 5 && (
            <button type="button" className="btn btn-ghost sm" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Daha az göster' : `+${mine.length - 5} iş daha`}
            </button>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div className="flex" style={{ gap: 10 }}>
              <span className="avatar alt" style={{ position: 'relative' }}>
                {initials(partner?.name ?? '?')}
                {partnerOnline && <span className="online-dot abs" />}
              </span>
              <div>
                <div className="card-title">{partner ? partner.name : 'Ortağın'}</div>
                <div className="card-sub">
                  {!partner
                    ? 'Ortak henüz eklenmemiş'
                    : partnerOnline
                      ? `Şu an çevrimiçi · ${pageName(partnerOnline.page)} sayfasında`
                      : partnerLast
                        ? `Son hareket ${trDateTime(partnerLast.created_at)}`
                        : 'Çevrimdışı'}
                </div>
              </div>
            </div>
            <span className="chip">{theirs.length} açık iş</span>
          </div>
          {theirs.length === 0 ? (
            <div className="empty" style={{ padding: 18 }}>{partner ? `${partner.name} üzerinde açık iş yok.` : 'README › 1. aşama › Adım 4 ile ortağını ekle.'}</div>
          ) : (
            theirs.slice(0, 4).map((t) => taskRow(t, false))
          )}
          {(unassigned.length > 0 || forAssistant.length > 0) && (
            <div className="muted small" style={{ marginTop: 10 }}>
              {unassigned.length > 0 && <Link to="/gorevler" className="linkish">{unassigned.length} iş kimseye atanmamış</Link>}
              {unassigned.length > 0 && forAssistant.length > 0 && ' · '}
              {forAssistant.length > 0 && `${forAssistant.length} iş Claude'da`}
            </div>
          )}
        </section>
      </div>

      <ClaudePlan tasks={tasks} />

      <section className="card">
        <div className="card-head wrap">
          <Seg value={tab} onChange={setTab} options={[{ value: 'week', label: 'Bu hafta' }, { value: 'feed', label: 'Ekip akışı' }, { value: 'recent', label: 'Son eklenenler' }]} />
          <span className="muted small">{tab === 'week' ? 'Önümüzdeki 7 günün son tarihleri ve takvim' : tab === 'feed' ? 'Kim ne yaptı · canlı' : 'Son dosyalar ve notlar'}</span>
        </div>

        {tab === 'week' && (
          <>
            {upcoming.length === 0 && <div className="empty" style={{ padding: 18 }}>Bu hafta tarihli iş yok.</div>}
            {upcoming.slice(0, 10).map((u, i) => (
              <Link key={i} to={u.link} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="chip" style={{ minWidth: 64, textAlign: 'center', color: u.date < t0 ? 'var(--orange)' : undefined }}>{u.date === t0 ? 'Bugün' : trDate(u.date)}</span>
                <span className="grow small">{u.title}</span>
                <span className="muted small">{u.who ? nameOf(u.who) : u.kind}</span>
              </Link>
            ))}
          </>
        )}

        {tab === 'feed' && (
          <div className="feed">
            {activity.length === 0 && <div className="empty" style={{ padding: 18 }}>Henüz bir hareket yok. Görev açtıkça, dosya yükledikçe burada görünür.</div>}
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
        )}

        {tab === 'recent' && (
          <>
            {recentFiles.length > 0 && <div className="ftiles" style={{ marginBottom: 12 }}>{recentFiles.map((f) => <FileTile key={f.id} f={f} thumb={thumbs[f.path]} onDelete={() => delFile(f)} />)}</div>}
            {recentNotes.map((n) => (
              <Link key={n.id} to={`/notlar?id=${n.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <NotebookPen size={14} color="var(--muted)" />
                <span className="grow small">{n.title} <span className="muted">· {n.folder}</span></span>
                <span className="muted small">{nameOf(n.created_by)} · {trDateTime(n.updated_at)}</span>
              </Link>
            ))}
            {recentFiles.length === 0 && recentNotes.length === 0 && <div className="empty" style={{ padding: 18 }}>Henüz dosya ya da not yok.</div>}
          </>
        )}
      </section>
    </div>
  )
}
