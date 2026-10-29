import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, ShieldCheck, Clock, Check, X } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, useSetting, trDateTime } from '../lib/rows'
import { demoQuestions } from '../data/demo'
import type { AssistantQuestion } from '../lib/types'
import { gameById } from '../data/sample'
import { money } from '../lib/format'
import { SampleBanner, Toggle, useIsMobile } from '../components/ui'
import Needs from '../components/Needs'
import { triggerWorkflow } from '../lib/trigger'

// Bekleyen sorunun yanında geçen süre: sayfa donmuş gibi görünmesin
function Waiting({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.round((now - Date.parse(since)) / 1000))
  const step = s < 25 ? 'Soru alındı, asistan başlatılıyor' : s < 60 ? 'Verilere bakıyor' : 'Cevabı yazıyor'
  return <>{step}… <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span></>
}

const prompts = [
  'Bu hafta en çok gelir getiren oyun hangisi?',
  'Hangi oyunun çökme oranı yükseldi?',
  'Kötü yorumlarda en sık şikayet ne?',
  'Hangi reklamım en verimli, bütçeyi nereye kaydırayım?',
  'Bu hafta TikTok için hangi reklamı çekeyim?',
  'Bir sonraki güncellemede neye odaklanmalıyım?',
]

const capabilities = [
  { key: 'daily_summary', label: 'Günlük özet', hint: 'Her sabah kısa durum özeti' },
  { key: 'fix_advice', label: 'Sorun çözüm önerisi', hint: 'Uyarı ve görevlere adım adım çözüm' },
  { key: 'review_analysis', label: 'Yorum analizi', hint: 'Yorumları gruplar, cevap taslağı yazar' },
  { key: 'answer_questions', label: 'Soruları cevapla', hint: 'Bu sayfadaki sorulara cevap verir' },
  { key: 'ad_plans', label: 'Reklam planı', hint: 'Haftalık reklam stratejisi önerir' },
] as const
type Caps = Record<(typeof capabilities)[number]['key'], boolean>
const defaultCaps: Caps = { daily_summary: true, fix_advice: true, review_analysis: true, answer_questions: true, ad_plans: true }

// Asistan: sorular veritabanına yazılır; Claude (4. aşama, GitHub Actions) cevaplar.
// Asistan sadece önerir; para harcayan ya da mağazayı değiştiren her şey senin onayını bekler.
export default function Assistant() {
  const { connected, demo } = useData()
  const { recs, decide, toast } = useStore()
  const { me, nameOf } = usePeople()
  const qs = useRows<AssistantQuestion>('assistant_questions', demoQuestions, { order: 'created_at' })
  const [caps, setCaps] = useSetting<Caps>('assistant', defaultCaps)
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const mobile = useIsMobile()
  const pending = recs.filter((r) => r.status === 'pending')
  const claude = !!connected.claude

  // Yeni soru eklenince sohbetin sonuna kaydır. İlk yükleme sayılmaz: eski sorular gelince sayfa aşağı kaymasın.
  const count = useRef<number | null>(null)
  useEffect(() => {
    if (qs.loading) return
    if (count.current !== null && qs.rows.length > count.current) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    count.current = qs.rows.length
  }, [qs.rows.length, qs.loading])

  async function ask(q: string) {
    if (!q.trim()) return
    setText('')
    try {
      await qs.insert({ question: q.trim(), status: 'pending', answer: null, asked_by: me.email })
      triggerWorkflow('assistant.yml')
      if (demo) toast('Demo: soru kaydedildi, cevap 4. aşamada gelir.', 'info')
    } catch (e) {
      toast('Soru kaydedilemedi: ' + (e as Error).message, 'warn')
      setText(q)
    }
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="grid" style={{ gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 2fr) minmax(280px, 1fr)', alignItems: 'start' }}>
        <section className="card" style={{ minWidth: 0, minHeight: 560, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <div className="orb"><span /><span /><span /></div>
            <h1 style={{ fontSize: 30, fontWeight: 300, letterSpacing: -1 }}>Ne sormak istersin?</h1>
            <p className="muted small" style={{ maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
              Gelir, yorumlar, çökmeler ve politika uyarıları hakkında sor. {claude ? 'Reklam, gelir, yorum, yayın: hepsinin verisini bilir. Cevap genelde 1-2 dakikada gelir.' : 'Claude bağlanınca sorularını cevaplar.'}
            </p>
          </div>

          <div className="chat" style={{ flex: 1 }}>
            {qs.rows.length === 0 && (
              <div className="flex wrap" style={{ gap: 8, justifyContent: 'center' }}>
                {prompts.map((p) => <button key={p} type="button" className="chip" style={{ cursor: 'pointer', padding: '8px 14px' }} onClick={() => ask(p)}>{p}</button>)}
              </div>
            )}
            {qs.rows.map((q) => (
              <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="msg me">
                  {q.question}
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{nameOf(q.asked_by)} · {trDateTime(q.created_at)}</div>
                </div>
                <div className="msg ai">
                  {q.status === 'answered' ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{q.answer}</span>
                  ) : q.status === 'failed' ? (
                    <span style={{ color: 'var(--orange)' }}>Cevaplanamadı. {q.answer ?? ''}</span>
                  ) : (
                    <span className="flex muted" style={{ gap: 8 }}><Clock size={13} /> {claude ? <Waiting since={q.created_at} /> : 'Sırada — Claude bağlanınca cevaplanacak'}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>

          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(text) }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Asistana sor…" aria-label="Soru" />
            <button type="submit" className="btn btn-primary sm" disabled={!text.trim()} aria-label="Gönder"><Send size={13} /></button>
          </form>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {!claude && !demo ? (
            <Needs source="claude" />
          ) : (
            <div className="card">
              <div className="card-title">Claude</div>
              <span className="presence" style={{ marginTop: 8 }}><span className="dot" /> Bağlı</span>
            </div>
          )}

          <div className="card">
            <div className="card-title flex" style={{ gap: 8 }}><ShieldCheck size={15} color="var(--green)" /> Değişmeyen kural</div>
            <p className="muted small" style={{ marginTop: 8, lineHeight: 1.6 }}>
              Asistan hiçbir zaman senin onayın olmadan para harcamaz ya da mağazada bir şey değiştirmez. Sadece önerir; sen “Onayla” deyince uygulanır.
            </p>
          </div>

          <div className="card">
            <div className="card-title">Onay bekleyenler</div>
            <div className="card-sub">{pending.length ? `${pending.length} öneri` : 'Bekleyen öneri yok'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {pending.slice(0, 4).map((r) => (
                <div key={r.id} className="inner" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{r.title}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{gameById(r.gameId)?.name ?? r.gameId}{r.cost != null ? ` · ${money(r.cost)}` : ' · ücretsiz'}</div>
                  <div className="flex" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-green sm" onClick={() => decide(r.id, 'approved')}><Check size={12} /> Onayla</button>
                    <button type="button" className="btn btn-ghost sm" onClick={() => decide(r.id, 'rejected')}><X size={12} /> Reddet</button>
                  </div>
                </div>
              ))}
              {pending.length > 4 && <Link to="/reklamlar" className="linkish">Tümünü gör →</Link>}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Ne yapsın?</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
              {capabilities.map((c) => (
                <div key={c.key} className="row">
                  <div className="grow">
                    <div style={{ fontSize: 12 }}>{c.label}</div>
                    <div className="muted" style={{ fontSize: 10 }}>{c.hint}</div>
                  </div>
                  <Toggle
                    on={caps[c.key]}
                    label={c.label}
                    onChange={(v) => setCaps({ ...caps, [c.key]: v }).catch((e) => toast('Kaydedilemedi: ' + e.message, 'warn'))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
