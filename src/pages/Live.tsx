import LiveDashboard from '../components/LiveDashboard'
import WeeklyReport from '../components/WeeklyReport'
import { SampleBanner } from '../components/ui'

// Canlı veriler: para (dakikada bir), ülkeler (küre), kitle, oyunlar ve haftalık rapor tek sayfada
export default function Live() {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head">
        <span className="eyebrow">Canlı veriler</span>
        <h1>Şu an neler oluyor</h1>
      </div>
      <LiveDashboard />
      <WeeklyReport />
    </div>
  )
}
