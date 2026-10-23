import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, trDate } from '../lib/rows'
import { demoTasks } from '../data/demo'
import { levelLabel, taskCode, type Task, type TaskLevel } from '../lib/types'
import { byDay, periodRows, totals } from '../lib/metrics'
import { change, int, money, platformLabel } from '../lib/format'
import { computeSignals, levelColor, levelText, type Signal } from '../lib/signals'
import { Donut, GameLogo, SampleBanner, StatCard } from '../components/ui'
import Needs from '../components/Needs'

const taskLevel: Record<Signal['level'], TaskLevel> = { k: 'critical', d: 'medium', n: 'low' }
const rank: Record<Signal['level'], number> = { k: 0, d: 1, n: 2 }
const levelDot: Record<TaskLevel, string> = { critical: '#FF7A55', medium: '#E8C07A', low: '#8FD3AE' }

// Komuta merkezi: günün rakamları + her oyunun sinyal → değerlendirme → aksiyon akışı
export default function Komuta() {
  const { games, daily, builds, hasStore, connected, loading } = useData()
  const { alerts, toast } = useStore()
  const { me } = usePeople()
  const { rows: tasks, insert } = useRows<Task>('tasks', demoTasks)

  const { cur, prev } = periodRows(daily, 7)
  const t = totals(cur)
  const p = totals(prev)
  const days = byDay(cur)
  const month = totals(periodRows(daily, 30).cur)
  const flows = useMemo(() => computeSignals(games, daily, alerts, builds), [games, daily, alerts, builds])
  const all = flows.flatMap((f) => f.signals)
  const count = (l: Signal['level']) => all.filter((s) => s.level === l).length
  const open = tasks.filter((x) => x.status !== 'done').sort((a, b) => (a.level === 'critical' ? -1 : 0) - (b.level === 'critical' ? -1 : 0))
  const taskBySource = new Map(tasks.filter((x) => x.source).map((x) => [x.source!, x]))

  async function toTask(s: Signal, gameName: string) {
    try {
      await insert({
        title: `${gameName}: ${s.label}`,
        level: taskLevel[s.level],
        status: 'open',
        game_id: s.gameId,
        source: s.key,
        advice: s.action,
        assignee: me.email,
        created_by: me.email,
        tags: ['Sinyal'],
        subtasks: [],
        history: [{ what: `Komutadan oluşturuldu (${s.value})`, at: new Date().toISOString() }],
      })
      toast('Görev oluşturuldu')
    } catch (e) {
      toast('Görev oluşturulamadı: ' + (e as Error).message, 'warn')
    }
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head">
        <span className="eyebrow">Komuta merkezi</span>
        <h1>Bugün neler oluyor</h1>
        <p>Mağazalardan ve AdMob’dan gelen sinyaller tek akışta. Bir sinyali tek tıkla göreve çevirebilirsin.</p>
      </div>

      {!connected.admob && !loading && <Needs source="admob" />}

      <div className="grid g-4">
        <StatCard label="Gelir · 7 gün" value={t.revenue} format={money} delta={change(t.revenue, p.revenue)} spark={days.map((d) => d.ad + d.iap)} />
        <StatCard label="İndirme · 7 gün" value={hasStore && t.downloads > 0 ? t.downloads : null} format={int} delta={change(t.downloads, p.downloads)} spark={hasStore ? days.map((d) => d.downloads) : undefined} />
        <StatCard label="Açık görev" value={open.length} format={int} note={`${open.filter((x) => x.level === 'critical').length} kritik`} />
        <StatCard label="Kritik sinyal" value={count('k')} format={int} note={`${count('d')} dikkat`} />
      </div>

      <div className="grid g-3">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Açık görevler</div>
              <div className="card-sub">Önce kritik olanlar</div>
            </div>
            <Link to="/gorevler" className="btn sm">Tümü <ArrowRight size={13} /></Link>
          </div>
          {open.length === 0 ? (
            <div className="empty">Açık görev yok. Aşağıdaki sinyallerden görev oluşturabilirsin.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {open.slice(0, 5).map((x) => (
                <Link key={x.id} to={`/gorevler?id=${x.id}`} className="row" style={{ gap: 10 }}>
                  <span className="dot" style={{ background: levelDot[x.level] }} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</span>
                    <span className="muted" style={{ fontSize: 10 }}>{taskCode(x.id)} · {levelLabel[x.level]}</span>
                  </span>
                  <span className="muted small">{x.due_date ? trDate(x.due_date) : ''}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Gelir kaynakları</div>
          <div className="card-sub">Son 30 gün</div>
          <div className="flex" style={{ gap: 18, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Donut parts={[{ value: month.adRevenue, color: '#FFFFFF' }, { value: month.iapRevenue, color: '#8FD3AE' }]}>
              <b style={{ fontSize: 18, fontWeight: 400 }}>{money(month.revenue)}</b>
              <small className="muted" style={{ fontSize: 10 }}>toplam</small>
            </Donut>
            <div className="legend" style={{ flex: 1, minWidth: 140 }}>
              <div className="legend-row"><span className="dot" style={{ background: '#fff' }} /><span>AdMob reklam</span><b>{money(month.adRevenue)}</b></div>
              <div className="legend-row"><span className="dot" style={{ background: '#8FD3AE' }} /><span>Uygulama içi satın alma</span><b>{hasStore ? money(month.iapRevenue) : '—'}</b></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Sinyal seviyeleri</div>
          <div className="card-sub">Tüm oyunlar · şu an</div>
          <div className="flex" style={{ gap: 18, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Donut parts={(['k', 'd', 'n'] as const).map((l) => ({ value: count(l), color: levelColor[l] }))}>
              <b style={{ fontSize: 22, fontWeight: 400 }}>{all.length}</b>
              <small className="muted" style={{ fontSize: 10 }}>sinyal</small>
            </Donut>
            <div className="legend" style={{ flex: 1, minWidth: 120 }}>
              {(['k', 'd', 'n'] as const).map((l) => (
                <div key={l} className="legend-row"><span className="dot" style={{ background: levelColor[l] }} /><span>{levelText[l]}</span><b>{count(l)}</b></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex between wrap" style={{ gap: 10, marginTop: 6 }}>
        <div>
          <div className="card-title" style={{ fontSize: 16 }}>Oyunlar ve sinyaller</div>
          <div className="card-sub">Sorunlu oyunlar önce · her sinyalin yanında önerilen aksiyon</div>
        </div>
        <div className="flex wrap" style={{ gap: 12, fontSize: 11 }}>
          {(['k', 'd', 'n'] as const).map((l) => (
            <span key={l} className="flex muted" style={{ gap: 6 }}><span className="dot" style={{ background: levelColor[l] }} />{levelText[l]}</span>
          ))}
        </div>
      </div>
      {flows.length === 0 ? (
        <div className="card empty">{loading ? 'Yükleniyor…' : 'Henüz oyun yok. Veri toplama çalışınca oyunların burada görünür.'}</div>
      ) : (
        <div className="games-grid">
          {[...flows]
            .sort((a, b) => rank[a.level] - rank[b.level] || b.revenue - a.revenue)
            .map((f) => (
              <section key={f.game.id} className={`gcard ${f.level}`}>
                <div className="gcard-head">
                  <GameLogo id={f.game.id} size={52} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link to={`/oyunlar/${f.game.id}`}><b>{f.game.name}</b></Link>
                    <div className="flex wrap" style={{ gap: 6, marginTop: 6 }}>
                      {f.game.platforms.map((p) => <span key={p} className="chip">{platformLabel(p)}</span>)}
                    </div>
                  </div>
                  <span className="lvl" style={{ background: levelColor[f.level] + '22', color: levelColor[f.level] }}>
                    {f.level === 'n' ? 'Yolunda' : levelText[f.level]}
                  </span>
                </div>
                <div className="gcard-stats">
                  <div>
                    <span>Toplam indirme</span>
                    <b title={f.game.installsLabel ?? ''}>{f.game.installs != null ? int(f.game.installs) : f.downloads > 0 ? int(f.downloads) : '—'}</b>
                  </div>
                  <div>
                    <span>Gelir · 7 gün</span>
                    <b>{money(f.revenue)}</b>
                  </div>
                  <div>
                    <span>Puan</span>
                    <b>{f.rating != null ? '★ ' + f.rating.toFixed(1).replace('.', ',') : '—'}</b>
                  </div>
                </div>
                {f.signals.length === 0 ? (
                  <div className="ok-line"><Check size={14} color="var(--green)" /> Sorun yok, izlemeye devam.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {f.signals.map((s) => (
                      <div key={s.key} className="sig">
                        <span className="bar-l" style={{ background: levelColor[s.level] }} />
                        <div className="sig-top">
                          <span className="t" title={s.label}>{s.label}</span>
                        </div>
                        <b style={{ fontSize: 12, fontWeight: 600 }}>{s.value}</b>
                        <div className="sig-act">
                          <span>{s.action}</span>
                          <TaskButton s={s} existing={taskBySource.get(s.key)} onCreate={() => toTask(s, f.game.name)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
        </div>
      )}
    </div>
  )
}

function TaskButton({ s, existing, onCreate }: { s: Signal; existing?: Task; onCreate: () => void }) {
  if (existing)
    return (
      <Link to={`/gorevler?id=${existing.id}`} className="linkish" style={{ color: 'var(--green)' }}>
        <Check size={11} /> {taskCode(existing.id)}
      </Link>
    )
  if (s.level === 'n') return null
  return (
    <button type="button" className="linkish" onClick={onCreate}>
      Göreve çevir →
    </button>
  )
}
