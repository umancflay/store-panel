import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Flag, Flame, Megaphone, Rocket, Store } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, useInsight } from '../lib/rows'
import { demoNodes, demoTasks } from '../data/demo'
import type { PlanNode, Task } from '../lib/types'
import { periodRows, totals } from '../lib/metrics'
import { int, money } from '../lib/format'
import { SampleBanner } from '../components/ui'
import { useGoal } from '../components/GoalCard'
import Decisions from '../components/Decisions'

// Ana sayfa: büyük karşılama, günün özeti ve iki giriş düğmesi
export default function Welcome() {
  const { daily, hasStore, loading } = useData()
  const { alerts } = useStore()
  const { me } = usePeople()
  const { rows: tasks } = useRows<Task>('tasks', demoTasks)
  const { rows: nodes } = useRows<PlanNode>('plan_nodes', demoNodes)
  const summary = useInsight<{ headline: string; bullets: string[]; focus: string; date: string }>('daily_summary')
  const today = new Date().toISOString().slice(0, 10)
  const fresh = summary && summary.created_at.slice(0, 10) === today ? summary.content : null

  const y = totals(periodRows(daily, 1).cur)
  const goal = useGoal()
  const criticalTasks = tasks.filter((t) => t.level === 'critical' && t.status !== 'done').length
  const criticalAlerts = alerts.filter((a) => a.level === 'critical' && a.status === 'open').length
  const critical = criticalTasks + criticalAlerts
  const openTasks = tasks.filter((t) => t.status !== 'done').length
  const progress = nodes.length ? Math.round((nodes.filter((n) => n.status === 'done').length / nodes.length) * 100) : null
  const date = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hour = new Date().getHours()
  const hello = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'

  return (
    <div className="welcome fade-in">
      <SampleBanner />
      <div>
        <span className="eyebrow">{date}</span>
        <h1>
          {hello},<br />
          <span>{me.name}.</span>
        </h1>
        <p className="welcome-sub">
          {fresh ? `${fresh.headline} ${fresh.focus ? `Bugün ilk iş: ${fresh.focus}` : ''}` : critical > 0
            ? `${critical} kritik iş seni bekliyor; önce onlar.`
            : 'Kritik iş yok, her şey sakin.'}
        </p>
      </div>

      <div className="flex wrap" style={{ gap: 12 }}>
        <Link to="/komuta" className="btn btn-primary btn-lg">
          Panele gir <ArrowRight size={16} />
        </Link>
        <Link to="/gorevler" className={`btn btn-lg ${critical > 0 ? 'btn-hot' : 'btn-ghost'}`}>
          {critical > 0 ? `Kritik işlere bak (${critical})` : 'Görevlere bak'}
        </Link>
      </div>

      {/* Sık yapılan işlere tek dokunuş */}
      <div className="quick-actions">
        <Link to="/yayin"><Rocket size={14} /> Build bırak</Link>
        <Link to="/yayin?tab=aso"><Store size={14} /> Mağaza sayfası raporu</Link>
        <Link to="/reklamlar"><Megaphone size={14} /> Reklam panosu</Link>
        <Link to="/studyo"><Flame size={14} /> Reklam videosu hazırla</Link>
        <Link to="/gelir"><Flag size={14} /> {goal.target > 0 ? 'Gelir hedefi' : 'Hedef koy'}</Link>
        <Link to="/asistan"><Bot size={14} /> Asistana sor</Link>
      </div>

      <Decisions />

      <div className="welcome-stats">
        <div>
          <span>Dünkü gelir</span>
          <b>{loading ? '…' : money(y.revenue)}</b>
        </div>
        <div>
          <span>Dünkü indirme</span>
          <b>{loading ? '…' : hasStore && y.downloads > 0 ? int(y.downloads) : '—'}</b>
        </div>
        <div>
          <span>Açık görev</span>
          <b>{openTasks}</b>
        </div>
        {goal.target > 0 ? (
          <Link to="/gelir" className="welcome-goal">
            <span>{goal.monthName} hedefi</span>
            <b>%{Math.round(goal.ratio * 100)}</b>
          </Link>
        ) : (
          <div>
            <span>Plan ilerlemesi</span>
            <b>{progress == null ? '—' : `%${progress}`}</b>
          </div>
        )}
      </div>
    </div>
  )
}
