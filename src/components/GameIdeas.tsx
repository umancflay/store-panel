import { useState } from 'react'
import { ChevronDown, Lightbulb, Loader2, Sparkles, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react'
import { useSetting, trDateTime } from '../lib/rows'
import { useStore } from '../lib/store'
import { triggerWorkflow } from '../lib/trigger'
import { isDemo } from '../lib/supabase'
import { gameById } from '../data/sample'
import { GameLogo } from './ui'

// Oyun fikirleri: Claude popüler oyun listelerine, trendlere ve stüdyonun oyunlarına bakıp yeni oyun fikirleri
// ve mevcut oyunlara küçük özellikler önerir (scripts/gameideas.mjs). Beğen / geç işaretleri sonraki önerileri yönlendirir.

type Idea = {
  name: string; pitch: string; genre: string; whyNow: string; coreLoop: string; adMoment: string; monetization: string
  weeks: number; reuse: string; references: string[]; risk: string; scores: { market: number; fit: number; effort: number }
}
type Ideas = { at: string | null; summary?: string; ideas?: Idea[]; quickWins?: { game_id: string; title: string; why: string; days: number }[] }
type Feedback = { items: Record<string, 'like' | 'pass'> }

const demo: Ideas = {
  at: new Date().toISOString(),
  summary: 'Listelerin başında renk sıralama ve kuyruk (sort/jam) bulmacaları var; Türkiye’de okey ve strateji güçlü. Stüdyo için fırsat: co-op fizik ve tycoon bilgisini birleştiren kısa oturumlu oyunlar.',
  ideas: [
    {
      name: 'Parcel Panic', pitch: 'Kargo bandından gelen paketleri renklerine göre kamyonlara dizip zamanında yola çıkardığın bir sıralama bulmacası.', genre: 'Bulmaca · Sıralama',
      whyNow: 'Bus Fever Party! ABD ilk 10’a yeni girdi; ilk 50’nin 21’i bulmaca.', coreLoop: 'Paketi seç, doğru kamyona at, kamyon dolunca yola çıksın.', adMoment: 'Son paket tam sığarken kamyonun kornayla çıkışı.',
      monetization: 'Seviye sonu geçiş reklamı, “ek alan” için ödüllü reklam.', weeks: 4, reuse: 'Haul Guys’ın kamyon ve koli modelleri, fizik yerleştirme kodu.', references: ['Bus Jam', 'Parking Jam 3D'], risk: 'Tür kalabalık; görsel kimlik farkı şart.',
      scores: { market: 5, fit: 4, effort: 4 },
    },
  ],
  quickWins: [{ game_id: 'salgin', title: 'Günlük ödül çarkı yerine 7 günlük giriş takvimi', why: 'Listedeki strateji oyunlarının hepsinde var; 2. gün dönüşünü artırır.', days: 2 }],
}

const Score = ({ label, v }: { label: string; v: number }) => (
  <div className="idea-score"><span>{label}</span><i>{[1, 2, 3, 4, 5].map((n) => <b key={n} className={n <= v ? 'on' : ''} />)}</i></div>
)

export default function GameIdeas() {
  const { toast } = useStore()
  const [data] = useSetting<Ideas>('game_ideas', isDemo ? demo : { at: null })
  const [req, saveReq] = useSetting<{ at: string | null; note?: string; started?: string }>('game_ideas_request', { at: null })
  const [fb, saveFb] = useSetting<Feedback>('game_ideas_feedback', { items: {} })
  const [note, setNote] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const running = !!req.at && (!data.at || req.at > data.at)

  async function generate() {
    try {
      await saveReq({ at: new Date().toISOString(), note: note.trim() || undefined })
      triggerWorkflow('assistant.yml')
      setNote('')
      toast('Claude fikir üretiyor; 5-10 dakika içinde burada olur', 'info')
    } catch (e) {
      toast('Başlatılamadı: ' + (e as Error).message, 'warn')
    }
  }
  async function mark(name: string, v: 'like' | 'pass') {
    const items = { ...fb.items }
    if (items[name] === v) delete items[name]
    else items[name] = v
    try {
      await saveFb({ items })
      if (items[name]) toast(v === 'like' ? 'Not edildi: benzer fikirler gelecek' : 'Not edildi: buna benzer önermeyecek')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }

  return (
    <section className="card">
      <div className="card-head wrap" style={{ gap: 10 }}>
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><Lightbulb size={16} color="var(--orange)" /> Oyun fikirleri</div>
          <div className="card-sub">Popüler listelere, trendlere ve senin oyunlarına göre · haftada bir{data.at && <> · {trDateTime(data.at)}</>}</div>
        </div>
      </div>
      <form className="flex wrap" style={{ gap: 8, marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); generate() }}>
        <input className="input grow" style={{ minWidth: 200 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="İstersen yön ver: ör. çok oyunculu olsun, 3 haftada biter" disabled={running} />
        <button type="submit" className="btn sm" disabled={running}>
          {running ? <><Loader2 size={13} className="spin" /> Üretiliyor</> : <><Sparkles size={13} /> Yeni fikir üret</>}
        </button>
      </form>

      {!data.ideas?.length ? (
        <div className="empty" style={{ padding: 18 }}>{running ? 'Claude listelere ve trendlere bakıyor…' : 'Henüz fikir yok. "Yeni fikir üret"e bas.'}</div>
      ) : (
        <>
          {data.summary && <p className="small" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>{data.summary}</p>}
          <div className="idea-grid">
            {data.ideas.map((i) => {
              const f = fb.items?.[i.name]
              const isOpen = open === i.name
              return (
                <div key={i.name} className={`idea ${f ?? ''}`}>
                  <div className="flex between" style={{ gap: 8 }}>
                    <span className="badge b-muted">{i.genre}</span>
                    <span className="muted" style={{ fontSize: 10 }}>~{i.weeks} hafta</span>
                  </div>
                  <b className="idea-name">{i.name}</b>
                  <p>{i.pitch}</p>
                  <div className="idea-scores"><Score label="Talep" v={i.scores.market} /><Score label="Bize uygun" v={i.scores.fit} /><Score label="Kolaylık" v={i.scores.effort} /></div>
                  <span className="trend-why">{i.whyNow}</span>
                  {isOpen && (
                    <dl className="idea-more">
                      <dt>Oynanış</dt><dd>{i.coreLoop}</dd>
                      <dt>Reklamdaki an</dt><dd>{i.adMoment}</dd>
                      <dt>Para</dt><dd>{i.monetization}</dd>
                      <dt>Elimizdekinden</dt><dd>{i.reuse}</dd>
                      <dt>İlham</dt><dd>{i.references.join(', ')}</dd>
                      <dt>Risk</dt><dd>{i.risk}</dd>
                    </dl>
                  )}
                  <div className="flex between" style={{ marginTop: 'auto', gap: 6 }}>
                    <button type="button" className="btn btn-ghost sm" onClick={() => setOpen(isOpen ? null : i.name)}>
                      <ChevronDown size={12} style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} /> {isOpen ? 'Kapat' : 'Detay'}
                    </button>
                    <div className="flex" style={{ gap: 4 }}>
                      <button type="button" className={`icon-btn ${f === 'like' ? 'on-like' : ''}`} title="Beğendim" onClick={() => mark(i.name, 'like')}><ThumbsUp size={13} /></button>
                      <button type="button" className={`icon-btn ${f === 'pass' ? 'on-pass' : ''}`} title="Geç" onClick={() => mark(i.name, 'pass')}><ThumbsDown size={13} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {!!data.quickWins?.length && (
            <>
              <div className="eyebrow flex" style={{ gap: 6, margin: '18px 0 8px' }}><Wrench size={12} /> Mevcut oyunlara küçük eklemeler</div>
              <div className="profit-list">
                {data.quickWins.map((q) => (
                  <div key={q.game_id + q.title} className="profit-row">
                    <GameLogo id={q.game_id} size={28} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b>{q.title}</b>
                      <div className="muted small">{gameById(q.game_id)?.name ?? q.game_id} · {q.why}</div>
                    </div>
                    <span className="badge b-muted">~{q.days} gün</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
