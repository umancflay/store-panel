import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows } from '../lib/rows'
import { demoNodes, demoTasks } from '../data/demo'
import type { PlanNode, Task } from '../lib/types'
import { periodRows, totals } from '../lib/metrics'
import { int, money } from '../lib/format'
import { SampleBanner } from '../components/ui'

// Ana sayfa: büyük karşılama, günün özeti ve iki giriş düğmesi
export default function Welcome() {
  const { daily, hasStore, loading } = useData()
  const { alerts } = useStore()
  const { me } = usePeople()
  const { rows: tasks } = useRows<Task>('tasks', demoTasks)
  const { rows: nodes } = useRows<PlanNode>('plan_nodes', demoNodes)

  const y = totals(periodRows(daily, 1).cur)
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
          {critical > 0
            ? `Bugün ${critical} kritik iş seni bekliyor. Önce onlara bakmanı öneririm; geri kalan her şey yolunda görünüyor.`
            : 'Bugün kritik bir iş yok. Panelde her şey sakin; plana ve yeni fikirlere vakit ayırabilirsin.'}
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
        <div>
          <span>Plan ilerlemesi</span>
          <b>{progress == null ? '—' : `%${progress}`}</b>
        </div>
      </div>
    </div>
  )
}
