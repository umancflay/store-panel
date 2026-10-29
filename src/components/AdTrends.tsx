import { useState } from 'react'
import { ExternalLink, Flame, Loader2, Search } from 'lucide-react'
import { useSetting, trDateTime } from '../lib/rows'
import { useStore } from '../lib/store'
import { triggerWorkflow } from '../lib/trigger'
import { gameById } from '../data/sample'
import { GameLogo } from './ui'

// Şu an çalışan oyun reklamları: Claude haftada bir internette araştırır (scripts/adtrends.mjs) ve
// bizim oyunlara uyarlanmış çekim senaryoları yazar. "Şimdi araştır" beklemeden yeniler.

interface Trend { platform: string; title: string; example: string; hook: string; format: string; why: string; source: string }
interface Idea { platform: string; title: string; script: string }
interface Trends { at: string | null; summary?: string; items?: Trend[]; forGames?: { game_id: string; ideas: Idea[] }[] }

export default function AdTrends() {
  const { toast } = useStore()
  const [trends] = useSetting<Trends>('ad_trends', { at: null })
  const [req, saveReq] = useSetting<{ at: string | null; started?: string }>('ad_trends_request', { at: null })
  const [game, setGame] = useState<string | null>(null)
  const running = !!req.at && (!trends.at || req.at > trends.at)
  const ideas = trends.forGames ?? []
  const shown = ideas.find((g) => g.game_id === (game ?? ideas[0]?.game_id))

  async function research() {
    try {
      await saveReq({ at: new Date().toISOString() })
      triggerWorkflow('assistant.yml')
      toast('Araştırma başladı; 5-10 dakika içinde burada olur', 'info')
    } catch (e) {
      toast('Başlatılamadı: ' + (e as Error).message, 'warn')
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><Flame size={16} color="var(--orange)" /> Şu an çalışan oyun reklamları</div>
          <div className="card-sub">TikTok, Instagram ve YouTube'dan haftalık araştırma{trends.at && <> · {trDateTime(trends.at)}</>}</div>
        </div>
        <button type="button" className="btn sm" onClick={research} disabled={running}>
          {running ? <><Loader2 size={13} className="spin" /> Araştırılıyor</> : <><Search size={13} /> Şimdi araştır</>}
        </button>
      </div>

      {!trends.items?.length ? (
        <div className="empty" style={{ padding: 18 }}>{running ? 'Claude internette araştırıyor…' : 'Henüz araştırma yok. "Şimdi araştır"a bas.'}</div>
      ) : (
        <>
          {trends.summary && <p className="small" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>{trends.summary}</p>}
          <div className="trend-grid">
            {trends.items.map((t) => (
              <div className="trend" key={t.title}>
                <div className="flex between"><span className="badge b-muted">{t.platform}</span><span className="muted" style={{ fontSize: 10 }}>{t.format}</span></div>
                <b>{t.title}</b>
                <p>{t.hook}</p>
                <span className="trend-why">{t.why}</span>
                <div className="flex between" style={{ marginTop: 'auto' }}>
                  <span className="muted" style={{ fontSize: 10 }}>örn. {t.example}</span>
                  {/^https?:\/\//.test(t.source) && <a className="linkish" href={t.source} target="_blank" rel="noreferrer">Kaynak <ExternalLink size={10} /></a>}
                </div>
              </div>
            ))}
          </div>

          {ideas.length > 0 && (
            <div className="mt">
              <div className="eyebrow" style={{ marginBottom: 8 }}>Senin oyunların için çekim fikirleri</div>
              <div className="flex wrap" style={{ gap: 6, marginBottom: 10 }}>
                {ideas.map((g) => (
                  <button key={g.game_id} type="button" className={`chip-btn ${shown?.game_id === g.game_id ? 'on' : ''}`} onClick={() => setGame(g.game_id)}>
                    <GameLogo id={g.game_id} size={18} /> {gameById(g.game_id)?.name ?? g.game_id}
                  </button>
                ))}
              </div>
              <div className="trend-grid">
                {shown?.ideas.map((i) => (
                  <div className="trend" key={i.title}>
                    <span className="badge b-primary" style={{ alignSelf: 'start' }}>{i.platform}</span>
                    <b>{i.title}</b>
                    <p>{i.script}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
