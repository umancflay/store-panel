import { useState } from 'react'
import { Sparkles, PenLine, Send, X } from 'lucide-react'
import { categoryLabels, games, reviewClusters, reviews, sampleReplyDraft, type Review, type ReviewCategory } from '../data/sample'
import { dayLabel, platformLabel } from '../lib/format'
import { useStore } from '../lib/store'
import { GameChip, SampleBanner, Stars } from '../components/ui'

const catClass: Record<ReviewCategory, string> = {
  crash: 'b-critical', bug: 'b-warning', ads: 'b-warning', performance: 'b-warning', suggestion: 'b-info', praise: 'b-ok',
}

export default function Reviews() {
  const [game, setGame] = useState('all')
  const [platform, setPlatform] = useState('all')
  const [rating, setRating] = useState(0)
  const [cat, setCat] = useState<ReviewCategory | 'all'>('all')

  const base = reviews.filter((r) => (game === 'all' || r.gameId === game) && (platform === 'all' || r.platform === platform) && (!rating || r.rating === rating))
  const list = base.filter((r) => cat === 'all' || r.category === cat)
  const cats = (Object.keys(categoryLabels) as ReviewCategory[]).map((c) => ({ c, n: base.filter((r) => r.category === c).length })).filter((x) => x.n > 0)

  return (
    <>
      <SampleBanner>Örnek yorumlar gösteriliyor. Gerçek yorumlar 3. aşamada, Claude gruplaması 4. aşamada gelecek.</SampleBanner>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title flex"><Sparkles size={18} color="var(--primary)" /> Sık tekrar eden sorunlar</div>
            <div className="card-sub">Claude yorumları gruplayıp en çok tekrar edenleri üste çıkarır.</div>
          </div>
        </div>
        <div className="grid g-3">
          {reviewClusters.map((c) => (
            <div className="inner cluster" key={c.title}>
              <div className={`cluster-count badge ${catClass[c.category]}`}>{c.count}</div>
              <div>
                <b style={{ fontSize: 13, lineHeight: 1.4, display: 'block' }}>{c.title}</b>
                <p className="muted small" style={{ marginTop: 6, lineHeight: 1.5 }}>{c.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="flex wrap" style={{ marginBottom: 14 }}>
          <select className="select" value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="all">Tüm oyunlar</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="all">Tüm platformlar</option>
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </select>
          <select className="select" value={rating} onChange={(e) => setRating(+e.target.value)}>
            <option value={0}>Tüm puanlar</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
          </select>
        </div>
        <div className="flex wrap" style={{ gap: 6 }}>
          <button className={`badge ${cat === 'all' ? 'b-primary' : 'b-muted'}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setCat('all')}>Tümü ({base.length})</button>
          {cats.map(({ c, n }) => (
            <button key={c} className={`badge ${cat === c ? catClass[c] : 'b-muted'}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setCat(c)}>
              {categoryLabels[c]} ({n})
            </button>
          ))}
        </div>

        <div className="mt">
          {list.map((r) => <ReviewItem key={r.id} r={r} />)}
          {list.length === 0 && <div className="empty">Bu filtreye uyan yorum yok.</div>}
        </div>
      </section>
    </>
  )
}

function ReviewItem({ r }: { r: Review }) {
  const { toast } = useStore()
  const [draft, setDraft] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="review">
      <div className="review-head">
        <GameChip id={r.gameId} />
        <span className="badge b-muted">{platformLabel(r.platform)}</span>
        <span className={`badge ${catClass[r.category]}`}>{categoryLabels[r.category]}</span>
        <span className="muted small" style={{ marginLeft: 'auto' }}>{dayLabel(r.date)} · v{r.version}</span>
      </div>
      <div className="flex"><Stars n={r.rating} /><b className="small">{r.author}</b></div>
      <p style={{ lineHeight: 1.6, color: '#dbe4f3' }}>{r.body}</p>

      {draft === null ? (
        <div><button className="btn" onClick={() => setDraft(sampleReplyDraft(r))}><PenLine size={14} /> Cevap taslağı yaz</button></div>
      ) : (
        <div className="draft">
          <span className="ai-tag" style={{ justifySelf: 'start' }}><Sparkles size={12} /> Claude taslağı · düzenleyebilirsin</span>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
          {confirming ? (
            <div className="flex wrap">
              <span className="small" style={{ fontWeight: 700 }}>Bu cevap mağazada herkese açık yayınlanacak. Emin misin?</span>
              <button className="btn btn-green" onClick={() => { setConfirming(false); setDraft(null); toast('Örnek veri: cevap gönderilmedi. Gönderme 3. aşamada açılacak.', 'info') }}>
                <Send size={14} /> Evet, gönder
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>Vazgeç</button>
            </div>
          ) : (
            <div className="flex wrap">
              <button className="btn btn-primary" onClick={() => setConfirming(true)}><Send size={14} /> Gönder…</button>
              <button className="btn" onClick={() => setDraft(null)}><X size={14} /> Kapat</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
