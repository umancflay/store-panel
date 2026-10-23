import { useState } from 'react'
import { Link2Off, Clock, BellRing, Gamepad2, Plug } from 'lucide-react'
import { games } from '../data/sample'
import { platformLabel } from '../lib/format'
import { useStore } from '../lib/store'
import { enablePush, pushConfigured, pushSupported } from '../lib/push'
import { GameChip, SampleBanner, Toggle } from '../components/ui'

const sources = [
  { id: 'admob', name: 'AdMob', phase: 2 },
  { id: 'google_play', name: 'Google Play Console', phase: 3 },
  { id: 'app_store', name: 'App Store Connect', phase: 3 },
  { id: 'gmail', name: 'Gmail (politika mailleri)', phase: 4 },
  { id: 'claude', name: 'Claude (GitHub Actions)', phase: 4 },
  { id: 'ads', name: 'Reklam platformları', phase: 6 },
]

export default function Settings() {
  const { toast } = useStore()
  const [critical, setCritical] = useState(true)
  const [daily, setDaily] = useState(false)

  const turnOnPush = async () => {
    const err = await enablePush()
    toast(err ?? 'Bildirimler açıldı.', err ? 'warn' : 'ok')
  }

  return (
    <>
      <SampleBanner>Henüz hiçbir hesap bağlı değil. Bağlantılar sonraki aşamalarda eklenecek.</SampleBanner>

      <div className="grid g-2">
        <section className="card">
          <div className="card-title flex" style={{ marginBottom: 6 }}><Plug size={18} color="var(--primary)" /> Bağlı hesaplar</div>
          {sources.map((s) => (
            <div className="row" key={s.id}>
              <span className="icon-box sm" style={{ width: 36, height: 36, background: '#1a1f37', boxShadow: 'none', color: 'var(--muted)' }}><Link2Off size={15} /></span>
              <div className="grow"><b>{s.name}</b><div className="muted small">{s.phase}. aşamada bağlanacak</div></div>
              <span className="badge b-muted">Bağlı değil</span>
            </div>
          ))}
        </section>

        <div className="grid" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-title flex" style={{ marginBottom: 6 }}><Clock size={18} color="var(--primary)" /> Veri çekme</div>
            <div className="row"><div className="grow"><b>Son veri çekme</b><div className="muted small">Henüz çalışmadı</div></div></div>
            <div className="row"><div className="grow"><b>Her sabah 08:00</b><div className="muted small">Tüm veriler + Claude analizi</div></div><span className="badge b-muted">Hazır</span></div>
            <div className="row"><div className="grow"><b>Her 6 saatte bir</b><div className="muted small">Politika mailleri ve inceleme durumları</div></div><span className="badge b-muted">Hazır</span></div>
            <div className="row"><div className="grow"><b>Haftada bir (Pazartesi)</b><div className="muted small">Reklam planlarını güncelle</div></div><span className="badge b-muted">Hazır</span></div>
          </section>

          <section className="card">
            <div className="card-title flex" style={{ marginBottom: 6 }}><BellRing size={18} color="var(--primary)" /> Bildirimler</div>
            <div className="row"><div className="grow"><b>Kritik uyarılarda bildir</b><div className="muted small">Politika ihlali, reddedilen build</div></div><Toggle on={critical} onChange={setCritical} /></div>
            <div className="row"><div className="grow"><b>Günün özeti hazır olunca bildir</b><div className="muted small">Her sabah</div></div><Toggle on={daily} onChange={setDaily} /></div>
            <div className="row">
              <div className="grow">
                <b>Bu cihazda bildirimleri aç</b>
                <div className="muted small">
                  {!pushSupported ? 'Bu tarayıcı desteklemiyor (iPhone\'da önce ana ekrana ekle).' : pushConfigured ? 'Telefonuna bildirim gelir.' : 'Bildirim gönderimi 4. aşamada açılacak.'}
                </div>
              </div>
              <button className="btn btn-primary" onClick={turnOnPush}>Aç</button>
            </div>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-title flex" style={{ marginBottom: 6 }}><Gamepad2 size={18} color="var(--primary)" /> Oyun listesi</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Oyun</th><th>Tür</th><th>Platformlar</th><th>Durum</th></tr></thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td><GameChip id={g.id} /></td>
                  <td className="muted">{g.genre}</td>
                  <td><div className="flex" style={{ gap: 6 }}>{g.platforms.map((p) => <span key={p} className="badge b-primary">{platformLabel(p)}</span>)}</div></td>
                  <td><span className="badge b-ok">Aktif</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small mt">Oyun eklemek veya paket adlarını girmek için şimdilik Supabase › Table Editor › games tablosunu kullan.</p>
      </section>
    </>
  )
}
