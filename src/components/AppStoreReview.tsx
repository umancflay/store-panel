import { useEffect, useState } from 'react'
import { Apple, Copy, ExternalLink, Loader2, RefreshCw, Scale, Sparkles } from 'lucide-react'
import { isDemo } from '../lib/supabase'
import { useStore } from '../lib/store'
import { usePeople } from '../lib/data'
import { trDateTime } from '../lib/rows'
import { enqueue, useSettingRow, type QueueItem } from '../lib/expertQueue'
import { copy } from './AsoCoach'
import { triggerWorkflow } from '../lib/trigger'

// App Store incelemesi: oyunun iOS sürümü hangi aşamada (birkaç dakikada bir güncellenir, değişince telefona gelir);
// ret gelirse Apple'ın mesajı yapıştırılır, uzman kuralı Türkçe açıklar ve İngilizce cevap taslağı yazar.

type AppState = { gameId: string; name: string; version: string; state: string; since: string }
type Rejection = {
  at: string; error?: string; ids?: string[]; unknown?: string[]; reply?: string; ai?: boolean
  known?: { id: string; title: string; meaning: string; fix: string[]; appeal: string | null }[]
}

const LABEL: Record<string, [string, string, number]> = {
  PREPARE_FOR_SUBMISSION: ['Hazırlanıyor', 'b-muted', 0],
  WAITING_FOR_REVIEW: ['İnceleme sırasında', 'b-warning', 1],
  IN_REVIEW: ['Apple inceliyor', 'b-warning', 2],
  PENDING_DEVELOPER_RELEASE: ['Onaylandı, yayına al', 'b-ok', 3],
  PENDING_APPLE_RELEASE: ['Onaylandı', 'b-ok', 3],
  READY_FOR_SALE: ['Yayında', 'b-ok', 4],
  READY_FOR_DISTRIBUTION: ['Yayında', 'b-ok', 4],
  REJECTED: ['Reddedildi', 'b-critical', 2],
  METADATA_REJECTED: ['Bilgiler reddedildi', 'b-critical', 2],
  INVALID_BINARY: ['Geçersiz build', 'b-critical', 1],
  DEVELOPER_REJECTED: ['Geri çekildi', 'b-muted', 0],
}
const STEPS = ['Hazırlık', 'Sırada', 'İnceleme', 'Onay', 'Yayında']

const demoState = { at: new Date().toISOString(), apps: { 1: { gameId: 'salgin', name: 'Salgın', version: '1.1', state: 'REJECTED', since: new Date(Date.now() - 3 * 3600000).toISOString() } } }
const demoRejection: Rejection = {
  at: new Date().toISOString(), ids: ['5.1.1(v)', '2.1'], unknown: [], ai: true,
  known: [
    { id: '5.1.1(v)', title: 'Hesap silme seçeneği yok', meaning: 'Oyunda hesap oluşturulabiliyor ama oyun içinden hesabı silmenin yolu yok.', fix: ['Ayarlar menüsüne "Hesabımı sil" ekle; silme gerçekten verileri silsin.', 'İnceleme notlarına bu düğmenin yerini yaz.'], appeal: null },
    { id: '2.1', title: 'Uygulama tamlığı (çökme, eksik içerik, demo hesap)', meaning: 'Apple oyunu açarken çökme gördü.', fix: ['Mesajdaki cihazda TestFlight ile dene.'], appeal: 'Çökme senin cihazlarında hiç oluşmuyorsa ekran kaydı ekle.' },
  ],
  reply: 'Hello App Review Team,\n\nThank you for your review. Regarding Guideline 5.1.1(v), we added an in-app "Delete my account" option under Settings. Regarding Guideline 2.1, we fixed the launch crash on iPad and tested on several devices.\n\nWe have uploaded build 1.1 (8).\n\nBest regards,\nVoo Game Studio',
}

export default function AppStoreReview({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { toast } = useStore()
  const { me } = usePeople()
  const [states, reloadStates] = useSettingRow<{ at: string; apps: Record<string, AppState> }>('asc_review_state', demoState)
  const [rej, reloadRej] = useSettingRow<Rejection>(`rejection:${gameId}`, demoRejection)
  const [queue, reloadQueue] = useSettingRow<{ items: QueueItem[] }>('expert_queue', { items: [] })
  const [text, setText] = useState('')
  const [fixes, setFixes] = useState('')
  const [appeal, setAppeal] = useState(false)
  const busy = queue?.items?.some((i) => i.kind === 'rejection' && i.gameId === gameId)
  const app = Object.values(states?.apps ?? {}).find((a) => a.gameId === gameId)
  const [label, cls, step] = app ? LABEL[app.state] ?? [app.state, 'b-muted', 0] : ['Bilgi yok', 'b-muted', -1]
  const rejected = app && ['REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(app.state)

  useEffect(() => {
    if (!busy || isDemo) return
    const t = setInterval(() => (reloadQueue(), reloadRej()), 20000)
    return () => clearInterval(t)
  }, [busy, reloadQueue, reloadRej])

  async function ask() {
    if (isDemo) return toast('Demo modda çalışmaz', 'info')
    const { error, started } = await enqueue({ kind: 'rejection', gameId, by: me.email, text, fixes, appeal })
    if (error) return toast('İstenemedi: ' + error, 'warn')
    await reloadQueue()
    toast(started ? 'Uzman yazıyor; birkaç dakikada hazır, telefonuna haber gelir.' : 'Sıraya alındı; uzman en geç 15 dakikada başlar.')
  }

  const r = rej && !rej.error ? rej : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section className="card">
        <div className="card-head wrap">
          <div className="flex" style={{ gap: 10 }}>
            <span className="menu-ico"><Apple size={16} /></span>
            <div>
              <div className="card-title">{gameName} {app ? `· iOS ${app.version}` : ''}</div>
              <div className="card-sub">{app ? `Bu durumda: ${trDateTime(app.since)} · son bakış ${trDateTime(states!.at)}` : 'App Store Connect bağlıysa birkaç dakika içinde burada görünür.'}</div>
            </div>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <span className={`badge ${cls}`}>{label}</span>
            <button type="button" className="icon-btn" title="Şimdi kontrol et" aria-label="Şimdi kontrol et" onClick={async () => {
              if (isDemo) return toast('Demo modda çalışmaz', 'info')
              const err = await triggerWorkflow('expert.yml')
              toast(err ? 'Başlatılamadı: ' + err : 'Kontrol ediliyor; bir dakika içinde güncellenir.', err ? 'warn' : 'ok')
              if (!err) setTimeout(reloadStates, 60000)
            }}><RefreshCw size={14} /></button>
          </div>
        </div>
        {app && (
          <div className="stepper" aria-label="İnceleme aşaması">
            {STEPS.map((s, i) => (
              <div key={s} className={`step${i < step ? ' done' : i === step ? ' now' : ''}${i === step && rejected ? ' bad' : ''}`}>
                <span className="step-dot" />
                <span className="step-label">{s}</span>
              </div>
            ))}
          </div>
        )}
        <div className="muted small" style={{ marginTop: 10 }}>
          Durum her değiştiğinde telefonuna bildirim gelir (sıraya girdi, inceleniyor, onaylandı, reddedildi). Uzman yüklemeyi senin yerine yapmaz: build'i Xcode Organizer ya da Transporter ile yükleyip App Store Connect'ten incelemeye gönderirsin.
          {' '}<a className="linkish" href="https://appstoreconnect.apple.com/apps" target="_blank" rel="noreferrer">App Store Connect <ExternalLink size={10} /></a>
        </div>
      </section>

      <section className="card">
        <div className="card-title flex" style={{ gap: 8, marginBottom: 4 }}><Scale size={15} /> {rejected ? 'Apple reddetti: ne yapmalısın?' : 'Ret gelirse'}</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>App Store Connect › App Review'daki Apple mesajını olduğu gibi yapıştır. Uzman kuralın ne dediğini Türkçe anlatır, adım adım ne yapacağını söyler ve Resolution Center'a yazacağın İngilizce cevabı hazırlar.</div>
        <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Guideline 2.1 - Performance - App Completeness\nWe found that your app crashed on iPad…'} />
        <textarea className="input" rows={2} style={{ marginTop: 8 }} value={fixes} onChange={(e) => setFixes(e.target.value)} placeholder="Ne düzelttin? (Türkçe yazabilirsin; cevaba eklenir) — ör. hesap silme ekledik, iPad çökmesini düzelttik" />
        <div className="flex between wrap" style={{ marginTop: 8, gap: 8 }}>
          <label className="flex small" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={appeal} onChange={(e) => setAppeal(e.target.checked)} /> Haklı olduğumu düşünüyorum (itiraz dili kullan)
          </label>
          <button type="button" className="btn btn-primary" disabled={!text.trim() || busy} onClick={ask}>
            {busy ? <><Loader2 size={14} className="spin" /> Yazılıyor…</> : <><Sparkles size={14} /> Açıkla ve cevap yaz</>}
          </button>
        </div>
        {rej?.error && <div className="expert-error">Yazılamadı: {rej.error}</div>}
      </section>

      {r?.known && (
        <section className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Apple ne diyor</div>
          <div className="card-sub" style={{ marginBottom: 12 }}>{trDateTime(r.at)} · {r.ids?.length ? `Kural ${r.ids.join(', ')}` : 'Mesajda kural numarası bulunamadı'}</div>
          {r.known.map((k) => (
            <div key={k.id} className="finding warn" style={{ marginBottom: 10 }}>
              <div className="finding-head" style={{ cursor: 'default' }}><span className="grow"><b>{k.id} · {k.title}</b></span></div>
              <div className="finding-body">
                <p>{k.meaning}</p>
                <ol>{k.fix.map((s, i) => <li key={i}>{s}</li>)}</ol>
                {k.appeal && <p className="small muted" style={{ marginTop: 6 }}><b>İtiraz edilebilir mi?</b> {k.appeal}</p>}
              </div>
            </div>
          ))}
          {r.unknown && r.unknown.length > 0 && <div className="muted small">Bilgi tabanında olmayan kurallar: {r.unknown.join(', ')}. Apple'ın kural sayfasına bak: <a className="linkish" href="https://developer.apple.com/app-store/review/guidelines/" target="_blank" rel="noreferrer">App Review Guidelines</a></div>}
        </section>
      )}

      {r?.reply && (
        <section className="card">
          <div className="flex between" style={{ marginBottom: 6 }}>
            <div className="card-title">Resolution Center cevabı (İngilizce)</div>
            <button type="button" className="btn sm" onClick={() => copy(r.reply!, toast)}><Copy size={12} /> Kopyala</button>
          </div>
          <div className="card-sub" style={{ marginBottom: 10 }}>{r.ai ? 'Kendi modelin yazdı. ' : 'Şablon (model çalışmadı). '}Göndermeden önce oku; yapmadığın bir şeyi yazdıysa düzelt. App Store Connect › App Review › mesaja cevap ver.</div>
          <div className="aso-notes" style={{ marginTop: 0 }}><pre>{r.reply}</pre></div>
        </section>
      )}
    </div>
  )
}
