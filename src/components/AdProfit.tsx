import { useEffect, useMemo, useState } from 'react'
import { Scale } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useData } from '../lib/data'
import { localIso, money } from '../lib/format'
import { gameById } from '../data/sample'
import { GameLogo } from './ui'

// Reklam kârı: oyun başına son 30 günde reklama harcanan para ile oyunun aynı dönemdeki geliri.
// Gelirin içinde reklamsız gelen oyuncular da var; o yüzden oran "en iyi ihtimalle" kârı gösterir, yanında uyarısı yazar.

type Spend = { game_id: string | null; date: string; spend: number }

export default function AdProfit() {
  const { daily, fx, currency, demo } = useData()
  const [rows, setRows] = useState<Spend[] | null>(isDemo ? [{ game_id: 'salgin', date: localIso(new Date(Date.now() - 2 * 86400000)), spend: 40 }, { game_id: null, date: localIso(new Date(Date.now() - 3 * 86400000)), spend: 6 }] : null)
  const since = localIso(new Date(Date.now() - 30 * 86400000))
  useEffect(() => {
    if (isDemo) return
    supabase!.from('campaigns').select('game_id,date,spend').gte('date', since).then(({ data }) => setRows((data as Spend[]) ?? []))
  }, [since])

  const dates = Object.keys(fx).sort()
  const latest = dates.length ? fx[dates[dates.length - 1]] : 1
  const rate = (d: string) => (currency === 'TRY' ? fx[d] || latest : 1)

  const list = useMemo(() => {
    const m = new Map<string, { spend: number; revenue: number }>()
    for (const r of rows ?? []) {
      const k = r.game_id ?? '_'
      const e = m.get(k) ?? { spend: 0, revenue: 0 }
      e.spend += Number(r.spend) * rate(r.date)
      m.set(k, e)
    }
    for (const r of daily) {
      if (r.date < since || !m.has(r.gameId)) continue
      m.get(r.gameId)!.revenue += r.adRevenue + r.iapRevenue
    }
    return [...m].filter(([, v]) => v.spend > 0).sort((a, b) => b[1].spend - a[1].spend)
  }, [rows, daily, since, currency]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows || list.length === 0) return null
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><Scale size={16} /> Reklam kendini ödüyor mu?</div>
          <div className="card-sub">Son 30 gün · oyun başına reklam harcaması ve oyunun aynı dönemdeki geliri</div>
        </div>
      </div>
      <div className="profit-list">
        {list.map(([id, v]) => {
          const ratio = v.spend ? v.revenue / v.spend : 0
          const game = id === '_' ? null : gameById(id)
          return (
            <div key={id} className="profit-row">
              {game ? <GameLogo id={game.id} size={32} /> : <span className="profit-dot" />}
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{game?.name ?? 'Oyuna bağlanmamış kampanyalar'}</b>
                <div className="muted small">Harcama {money(v.spend)}{game && <> · gelir {money(v.revenue)}</>}</div>
              </div>
              {game && (
                <span className={`badge ${ratio >= 1.2 ? 'b-ok' : ratio >= 0.8 ? 'b-warning' : 'b-critical'}`}>
                  {ratio >= 1.2 ? 'Kâr ediyor' : ratio >= 0.8 ? 'Başa baş' : 'Zarar'} · ×{ratio.toFixed(1).replace('.', ',')}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
        {demo ? 'Örnek veri. ' : ''}Gelire reklamsız gelen oyuncular da dahil; gerçek reklam kârı bundan biraz düşüktür. "×1,5" = harcanan her 1 liraya karşılık 1,5 lira gelir.
      </p>
    </section>
  )
}
