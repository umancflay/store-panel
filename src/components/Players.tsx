import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase, isDemo } from '../lib/supabase'
import { countryName, dayLabel, int, pct, short } from '../lib/format'
import { BarList, ChartTip, Seg } from './ui'

// Oyuncular: Google Play toplu raporlarından son 30 günün kurulum / kaldırma / aktif cihaz kırılımları.
// Veri scripts/play.mjs › play_breakdowns tablosundan gelir. Play yaş ve cinsiyet vermez.

type Dim = 'country' | 'language' | 'device' | 'os_version' | 'app_version'
type Metric = 'installs' | 'active_devices'

interface Summary {
  dimension: Dim
  key: string
  installs: number
  uninstalls: number
  active_devices: number | null
}
interface Day {
  date: string
  installs: number
  uninstalls: number
  active_devices: number | null
}

const dimLabels: { value: Dim; label: string }[] = [
  { value: 'country', label: 'Ülke' },
  { value: 'language', label: 'Dil' },
  { value: 'device', label: 'Cihaz' },
  { value: 'os_version', label: 'Android' },
  { value: 'app_version', label: 'Sürüm' },
]

const langNames = new Intl.DisplayNames(['tr'], { type: 'language' })
function keyLabel(dim: Dim, key: string) {
  if (dim === 'country') return countryName(key)
  if (dim === 'language') {
    try {
      return langNames.of(key.replace('_', '-')) ?? key
    } catch {
      return key
    }
  }
  if (dim === 'app_version') return `Sürüm kodu ${key}`
  return key
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

// Demo modda (Supabase ayarlı değilken) örnek veri
function demoData(gameId: string): { summary: Summary[]; days: Day[] } {
  const seed = [...gameId].reduce((a, c) => a + c.charCodeAt(0), 0)
  const days = Array.from({ length: 30 }, (_, i) => {
    const installs = 40 + ((seed * (i + 3)) % 35)
    return { date: daysAgo(30 - i), installs, uninstalls: Math.round(installs * 0.35), active_devices: 1800 + i * 12 }
  })
  const rows = (dim: Dim, keys: string[]) =>
    keys.map((key, i) => {
      const installs = Math.round(900 / (i + 1.4))
      return { dimension: dim, key, installs, uninstalls: Math.round(installs * (0.25 + i * 0.04)), active_devices: installs * 3 }
    })
  return {
    days,
    summary: [
      ...rows('country', ['TR', 'BR', 'IN', 'ID', 'US', 'DE']),
      ...rows('language', ['tr_TR', 'pt_BR', 'en_US', 'id_ID', 'de_DE']),
      ...rows('device', ['samsung a52q', 'xiaomi spes', 'samsung a12', 'redmi lancelot', 'oppo CPH2219']),
      ...rows('os_version', ['Android 13', 'Android 12', 'Android 14', 'Android 11', 'Android 10']),
      ...rows('app_version', ['42', '41', '40']),
    ],
  }
}

function usePlayers(gameId: string) {
  const [summary, setSummary] = useState<Summary[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [loading, setLoading] = useState(!isDemo)
  useEffect(() => {
    if (isDemo) {
      const d = demoData(gameId)
      setSummary(d.summary)
      setDays(d.days)
      return
    }
    setLoading(true)
    const from = daysAgo(30)
    Promise.all([
      supabase!.rpc('play_breakdown_summary', { p_game: gameId, p_from: from } as never),
      supabase!.from('play_breakdowns').select('date,installs,uninstalls,active_devices').eq('game_id', gameId).eq('dimension', 'overview').gte('date', from).order('date'),
    ]).then(([s, d]) => {
      setSummary((s.data as Summary[]) ?? [])
      setDays((d.data as Day[]) ?? [])
      setLoading(false)
    })
  }, [gameId])
  return { summary, days, loading }
}

export default function Players({ gameId }: { gameId: string }) {
  const { summary, days, loading } = usePlayers(gameId)
  const [dim, setDim] = useState<Dim>('country')
  const [metric, setMetric] = useState<Metric>('installs')

  const total = useMemo(() => {
    const installs = days.reduce((a, d) => a + d.installs, 0)
    const uninstalls = days.reduce((a, d) => a + d.uninstalls, 0)
    const active = [...days].reverse().find((d) => d.active_devices != null)?.active_devices ?? null
    return { installs, uninstalls, active }
  }, [days])

  const hasActive = summary.some((s) => s.active_devices != null)
  const items = useMemo(
    () =>
      summary
        .filter((s) => s.dimension === dim)
        .map((s) => ({
          label: keyLabel(dim, s.key),
          value: metric === 'installs' ? Number(s.installs) : Number(s.active_devices ?? 0),
          extra: `${int(Number(s.uninstalls))} kaldırma${s.installs ? ` (${pct((Number(s.uninstalls) / Number(s.installs)) * 100, 0)})` : ''}${s.active_devices != null ? ` · ${int(Number(s.active_devices))} aktif cihaz` : ''}`,
        }))
        .filter((i) => i.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [summary, dim, metric],
  )

  if (!loading && !summary.length && !days.length) {
    return (
      <section className="card">
        <div className="card-title">Oyuncular</div>
        <div className="empty">
          Google Play toplu raporları henüz gelmedi. Play Console'da hizmet hesabına "toplu raporları indirme" izni verilince (24 saate kadar sürebilir)
          oyuncuların ülke, dil, cihaz ve Android sürümü burada görünür.
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="card-head wrap" style={{ gap: 10 }}>
        <div>
          <div className="card-title">Oyuncular</div>
          <div className="card-sub">Google Play · son 30 gün · Play yaş ve cinsiyet vermez (o bilgi Reklam sayfasında, Meta'dan)</div>
        </div>
      </div>

      <div className="grid g-4" style={{ gap: 10, margin: '14px 0' }}>
        <div><div className="muted small">Kurulum</div><b>{int(total.installs)}</b></div>
        <div><div className="muted small">Kaldırma</div><b>{int(total.uninstalls)}</b></div>
        <div>
          <div className="muted small">Kaldırma oranı</div>
          <b className={total.installs && total.uninstalls / total.installs > 0.5 ? 'bad' : ''}>{total.installs ? pct((total.uninstalls / total.installs) * 100, 0) : '—'}</b>
        </div>
        <div><div className="muted small">Aktif cihaz</div><b>{total.active != null ? int(total.active) : '—'}</b></div>
      </div>

      {days.length > 0 && (
        <div style={{ height: 160, marginBottom: 18 }}>
          <ResponsiveContainer>
            <BarChart data={days} margin={{ left: -14, right: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="5 5" vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fill: '#8a8a8a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={short} allowDecimals={false} />
              <Tooltip content={<ChartTip fmt={int} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="installs" name="Kurulum" fill="#8FD3AE" radius={[3, 3, 0, 0]} />
              <Bar dataKey="uninstalls" name="Kaldırma" fill="#FF7A55" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex wrap between" style={{ gap: 10, marginBottom: 14 }}>
        <Seg value={dim} onChange={setDim} options={dimLabels} />
        {hasActive && <Seg value={metric} onChange={setMetric} options={[{ value: 'installs', label: 'Kurulum' }, { value: 'active_devices', label: 'Aktif cihaz' }]} />}
      </div>
      <BarList items={items} fmt={int} />
    </section>
  )
}
