import { CalendarCheck, Check } from 'lucide-react'
import { useInsight, trDateTime } from '../lib/rows'
import { isDemo } from '../lib/supabase'

// Haftalık rapor: pazartesi sabahı Claude yazar (scripts/weekly.mjs), telefona da bildirim gider
interface Report { week: string; headline: string; good: string[]; bad: string[]; tasks: string[] }

const demo: Report = {
  week: 'Geçen hafta',
  headline: 'Gelir %12 arttı; artışın çoğu ABD ve Almanya’dan, Salgın’ın ödüllü reklamlarından.',
  good: ['Salgın ödüllü reklam geliri %30 arttı', 'Türkiye’de eCPM yükseldi'],
  bad: ['Taşınma Kaosu’nda geçiş reklamı doluluğu %70’e düştü'],
  tasks: ['Taşınma Kaosu’na ikinci reklam ağı ekle', 'Salgın için yeni reklam videosu çek', 'Haul Guys mağaza ekran görüntülerini yenile'],
}

export default function WeeklyReport() {
  const insight = useInsight<Report>('weekly_report')
  const r = isDemo ? demo : insight?.content
  if (!r) return null
  return (
    <section className="card weekly">
      <div className="card-head">
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><CalendarCheck size={16} /> Haftalık rapor</div>
          <div className="card-sub">{r.week}{insight?.created_at && <> · {trDateTime(insight.created_at)}</>}</div>
        </div>
      </div>
      <p className="weekly-head">{r.headline}</p>
      <div className="grid g-3" style={{ gap: 10 }}>
        <div className="inner"><div className="eyebrow" style={{ marginBottom: 6 }}>İyi giden</div><ul className="guide-list">{r.good.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div className="inner"><div className="eyebrow" style={{ marginBottom: 6 }}>Dikkat</div><ul className="guide-list">{r.bad.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div className="inner"><div className="eyebrow" style={{ marginBottom: 6 }}>Bu hafta yap</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{r.tasks.map((x) => <span key={x} className="small flex" style={{ gap: 6, alignItems: 'flex-start' }}><Check size={13} color="var(--green)" style={{ marginTop: 2 }} /> {x}</span>)}</div>
        </div>
      </div>
    </section>
  )
}
