import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Clapperboard, Globe2, Megaphone } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useData } from '../lib/data'
import { countryName, localIso, money } from '../lib/format'

// Oyun sayfasının ek bölümleri: oyunun ülkeleri (30 gün), reklam harcaması, oyun kartı ve Stüdyo kısa yolları.
// Böylece bir oyunla ilgili her şey tek sayfada.

type Row = { country: string; date: string; revenue: number; revenue_try: number | null }

export default function GameExtras({ gameId }: { gameId: string }) {
  const { currency, fx } = useData()
  const [countries, setCountries] = useState<[string, number][]>(isDemo ? [['US', 120], ['TR', 60], ['DE', 31]] : [])
  const [spend, setSpend] = useState<number | null>(isDemo ? 40 : null)
  const [card, setCard] = useState<{ summary?: string; status?: string } | null>(isDemo ? { summary: 'Örnek oyun kartı özeti.', status: 'ok' } : null)
  const [projects, setProjects] = useState(0)
  const since = localIso(new Date(Date.now() - 30 * 86400000))

  useEffect(() => {
    if (isDemo) return
    const dates = Object.keys(fx).sort()
    const latest = dates.length ? fx[dates[dates.length - 1]] : 1
    const rate = (d: string) => (currency === 'TRY' ? fx[d] || latest : 1)
    supabase!.from('admob_daily').select('country,date,revenue,revenue_try').eq('game_id', gameId).gte('date', since).limit(20000).then(({ data }) => {
      const m = new Map<string, number>()
      for (const r of (data as Row[]) ?? []) {
        const v = currency === 'TRY' ? (r.revenue_try ?? Number(r.revenue) * rate(r.date)) : Number(r.revenue)
        m.set(r.country, (m.get(r.country) ?? 0) + Number(v))
      }
      setCountries([...m].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6))
    })
    supabase!.from('campaigns').select('date,spend').eq('game_id', gameId).gte('date', since).then(({ data }) => {
      const rows = (data as { date: string; spend: number }[]) ?? []
      setSpend(rows.length ? rows.reduce((a, r) => a + Number(r.spend) * rate(r.date), 0) : null)
    })
    supabase!.from('app_settings').select('key,value').in('key', ['game_profiles', 'ad_projects']).then(({ data }) => {
      const rows = (data as { key: string; value: { items?: unknown } }[]) ?? []
      const profiles = (rows.find((r) => r.key === 'game_profiles')?.value.items ?? {}) as Record<string, { summary?: string; status?: string }>
      setCard(profiles[gameId] ?? null)
      const items = (rows.find((r) => r.key === 'ad_projects')?.value.items ?? []) as { gameId: string }[]
      setProjects(items.filter((p) => p.gameId === gameId).length)
    })
  }, [gameId, currency, since]) // eslint-disable-line react-hooks/exhaustive-deps

  const max = countries[0]?.[1] ?? 1
  return (
    <section className="grid g-2">
      <div className="card">
        <div className="card-title flex" style={{ gap: 8 }}><Globe2 size={16} /> Ülkeler</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>Reklam geliri, son 30 gün</div>
        {countries.length === 0 ? <div className="empty">Son 30 günde gelir yok.</div> : (
          <div className="country-bars">
            {countries.map(([c, v]) => (
              <div key={c} className="cbar">
                <div className="flex between"><b>{countryName(c)}</b><span>{money(v)}</span></div>
                <div className="cbar-track"><span style={{ width: `${(v / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><BookOpen size={16} /> Oyun kartı</div>
          <p className="small" style={{ margin: '8px 0 0', lineHeight: 1.55, color: '#d8d8d8' }}>
            {card?.summary || 'Henüz tanıtılmadı: reklam fikirleri ve promptlar oyunu bilmeden yazılır.'}
          </p>
        </div>
        <div className="game-links">
          <Link to="/studyo" className="btn sm"><BookOpen size={13} /> {card?.status === 'ok' ? 'Kartı düzenle' : 'Kartı doldur'}</Link>
          <Link to="/studyo" className="btn sm"><Clapperboard size={13} /> Stüdyo{projects ? ` · ${projects} proje` : ''}</Link>
          <Link to="/reklamlar" className="btn sm"><Megaphone size={13} /> Reklam{spend != null ? ` · 30 günde ${money(spend)}` : ''}</Link>
        </div>
      </div>
    </section>
  )
}
