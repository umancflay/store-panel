import { useState } from 'react'
import { ArrowDown, ArrowUp, Flame, Star } from 'lucide-react'
import { useSetting, trDateTime } from '../lib/rows'
import { isDemo } from '../lib/supabase'

// Şu an popüler oyunlar: App Store'un resmi listeleri (scripts/charts.mjs günde bir yazar).
// Yanında dünkü listeye göre yükselen/düşen/yeni giren ve listede en çok görülen türler.

export type ChartItem = { id: string; name: string; artist: string; icon: string | null; genres?: string[]; rating?: number | null; ratings?: number | null; prev?: number | null }
export type Charts = { updated?: string; countries?: Record<string, { free: ChartItem[]; grossing: ChartItem[]; genres: [string, number][] }>; hints?: Record<string, string[]> }

// App Store tür adları → Türkçe
const GENRE: Record<string, string> = {
  Action: 'Aksiyon', Adventure: 'Macera', Arcade: 'Arcade', Board: 'Masa', Card: 'Kart', Casino: 'Kumarhane', Casual: 'Gündelik',
  Dice: 'Zar', Educational: 'Eğitici', Entertainment: 'Eğlence', Family: 'Aile', Music: 'Müzik', Puzzle: 'Bulmaca', Racing: 'Yarış',
  'Role Playing': 'Rol yapma', Simulation: 'Simülasyon', Sports: 'Spor', Strategy: 'Strateji', Trivia: 'Bilgi', Word: 'Kelime',
}
const tr = (g: string) => GENRE[g] ?? g

const demoItems: ChartItem[] = [
  { id: '1', name: 'Block Blast!', artist: 'Hungry Studio', icon: null, genres: ['Games', 'Puzzle', 'Casual'], rating: 4.7, prev: 2 },
  { id: '2', name: 'Royal Match', artist: 'Dream Games', icon: null, genres: ['Games', 'Puzzle', 'Casual'], rating: 4.7, prev: 1 },
  { id: '3', name: 'Bus Fever Party!', artist: 'Örnek', icon: null, genres: ['Games', 'Puzzle'], rating: 4.5, prev: null },
  { id: '4', name: 'Warline: Sniper Strike', artist: 'Örnek', icon: null, genres: ['Games', 'Action', 'Strategy'], rating: 4.4, prev: 9 },
]
export const demoCharts: Charts = {
  updated: new Date().toISOString(),
  countries: { us: { free: demoItems, grossing: demoItems.slice().reverse(), genres: [['Puzzle', 21], ['Casual', 18], ['Action', 7], ['Simulation', 5]] } },
  hints: { 'zombie survival': ['zombie survival games', 'zombie survival offline', 'zombie shooter'] },
}

export function useCharts() {
  return useSetting<Charts>('top_charts', isDemo ? demoCharts : {})[0]
}

export default function TopCharts() {
  const charts = useCharts()
  const [cc, setCc] = useState<'us' | 'tr'>('us')
  const [kind, setKind] = useState<'free' | 'grossing'>('free')
  const [more, setMore] = useState(false)
  const data = charts.countries?.[cc] ?? charts.countries?.us
  if (!data) {
    return (
      <section className="card">
        <div className="card-title flex" style={{ gap: 8 }}><Flame size={16} /> Şu an popüler oyunlar</div>
        <div className="empty small" style={{ marginTop: 10 }}>İlk liste bir sonraki saatlik işte gelecek.</div>
      </section>
    )
  }
  const list = data[kind].slice(0, more ? 50 : 15)
  return (
    <section className="card">
      <div className="card-head wrap" style={{ gap: 10 }}>
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><Flame size={16} /> Şu an popüler oyunlar</div>
          <div className="card-sub">App Store resmi listesi{charts.updated ? ` · ${trDateTime(charts.updated)}` : ''} · oklar düne göre</div>
        </div>
        <div className="flex wrap" style={{ gap: 8 }}>
          <div className="seg">
            <button type="button" className={cc === 'us' ? 'on' : ''} onClick={() => setCc('us')}>ABD</button>
            <button type="button" className={cc === 'tr' ? 'on' : ''} onClick={() => setCc('tr')}>Türkiye</button>
          </div>
          <div className="seg">
            <button type="button" className={kind === 'free' ? 'on' : ''} onClick={() => setKind('free')}>En çok indirilen</button>
            <button type="button" className={kind === 'grossing' ? 'on' : ''} onClick={() => setKind('grossing')}>En çok kazanan</button>
          </div>
        </div>
      </div>

      {data.genres.length > 0 && (
        <div className="flex wrap" style={{ gap: 6, margin: '4px 0 12px' }}>
          <span className="muted small">İlk 50'de en çok tutan türler:</span>
          {data.genres.slice(0, 6).map(([g, n]) => <span key={g} className="badge b-muted">{tr(g)} · {n}</span>)}
        </div>
      )}

      <ol className="chart-list">
        {list.map((x, i) => {
          const rank = i + 1
          const diff = x.prev != null ? x.prev - rank : 0
          return (
            <li key={x.id}>
              <span className="chart-rank">{rank}</span>
              {x.icon ? <img src={x.icon} alt="" width={36} height={36} loading="lazy" /> : <span className="rival-ph" />}
              <a className="grow linkish" style={{ minWidth: 0 }} href={`https://apps.apple.com/${cc}/app/id${x.id}`} target="_blank" rel="noreferrer">
                <b className="ellipsis">{x.name}</b>
                <span className="muted small ellipsis">{(x.genres ?? []).filter((g) => g !== 'Games').slice(0, 2).map(tr).join(' · ') || x.artist}{x.rating ? <> · <Star size={9} /> {x.rating.toFixed(1).replace('.', ',')}</> : null}</span>
              </a>
              {x.prev === null ? <span className="badge b-ok">Yeni</span>
                : diff !== 0 ? <span className={`chart-move ${diff > 0 ? 'up' : 'down'}`}>{diff > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(diff)}</span> : null}
            </li>
          )
        })}
      </ol>
      <button type="button" className="btn btn-ghost sm" style={{ marginTop: 8 }} onClick={() => setMore(!more)}>{more ? 'Daha az göster' : 'İlk 50\'yi göster'}</button>
      <p className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        Google Play herkese açık liste vermiyor; trendler iki mağazada genelde aynı. "Yeni" = dün ilk 50'de yoktu.
      </p>
    </section>
  )
}
