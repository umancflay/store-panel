import { useEffect, useState } from 'react'
import { supabase, isDemo } from '../lib/supabase'
import { useData } from '../lib/data'
import { int, localIso } from '../lib/format'

// Firebase (Google Analytics) varsa: şu an oynayan (son 30 dk) ve bugün ilk kez açan oyuncu.
// Play indirme sayısı 2-5 gün geriden gelir; bunlar aynı gün. Veri yoksa hiçbir şey göstermez.
export default function LiveStats() {
  const { games } = useData()
  const [live, setLive] = useState<{ n: number; at: string } | null>(isDemo ? { n: 12, at: new Date().toISOString() } : null)
  const [today, setToday] = useState<number | null>(isDemo ? 37 : null)
  const ids = games.map((g) => g.id)
  const key = ids.join(',')

  useEffect(() => {
    if (isDemo || !ids.length) return
    const visible = new Set(ids)
    supabase!.from('app_settings').select('value').eq('key', 'live_players').maybeSingle().then(({ data }) => {
      const v = (data as { value?: { at: string; items: Record<string, number> } } | null)?.value
      // 2 saatten eski canlı sayı "şu an" sayılmaz
      if (v && Date.now() - Date.parse(v.at) < 2 * 3600000) setLive({ at: v.at, n: Object.entries(v.items ?? {}).filter(([g]) => visible.has(g)).reduce((a, [, n]) => a + n, 0) })
    })
    supabase!.from('store_daily').select('game_id,new_users').eq('date', localIso(new Date())).not('new_users', 'is', null).then(({ data }) => {
      const rows = (data as { game_id: string; new_users: number }[] | null) ?? []
      if (rows.length) setToday(rows.filter((r) => visible.has(r.game_id)).reduce((a, r) => a + r.new_users, 0))
    })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (live == null && today == null) return null
  return (
    <>
      {live != null && (
        <div title="Firebase · son 30 dakika">
          <span><span className="live-dot" /> Şu an oynayan</span>
          <b>{int(live.n)}</b>
        </div>
      )}
      {today != null && (
        <div title="Firebase · bugün oyunu ilk kez açan">
          <span>Bugün yeni oyuncu</span>
          <b>{int(today)}</b>
        </div>
      )}
    </>
  )
}
