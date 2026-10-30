import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, BookOpen, Check, Clapperboard, MessageSquareText, Rocket, Wallet, X } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useData } from '../lib/data'
import { useStore } from '../lib/store'
import { gameById } from '../data/sample'
import { money } from '../lib/format'

// Ana sayfa: bugün senin karar vermen gereken en fazla 5 iş. Her birinde neye dayandığı ve tek tık.
// Sıra: kritik uyarı → yayın onayı → para harcayan öneri → reklam stüdyosu → yorum taslakları → oyun kartı.

type Item = { id: string; icon: ReactNode; title: string; why: string; action: ReactNode; tone?: 'hot' }

interface Extra { approvals: { id: number; game_id: string | null; version_name: string | null }[]; studio: { gameId: string; status: string; title: string }[]; drafts: number; noProfile: string[]; draftProfile: string[] }

function useExtra(gameIds: string[]) {
  const [x, setX] = useState<Extra>({ approvals: [], studio: [], drafts: 0, noProfile: [], draftProfile: [] })
  const key = gameIds.join(',')
  useEffect(() => {
    if (isDemo) {
      setX({ approvals: [], studio: [{ gameId: 'salgin', status: 'review', title: 'Son 10 saniye kurtarışı' }], drafts: 3, noProfile: ['stockguys'], draftProfile: [] })
      return
    }
    const db = supabase!
    Promise.all([
      db.from('store_builds').select('id,game_id,version_name').eq('status', 'awaiting_approval').limit(5),
      db.from('app_settings').select('key,value').in('key', ['ad_projects', 'game_profiles']),
      db.from('reviews').select('id', { count: 'exact', head: true }).eq('reply_status', 'draft'),
    ]).then(([b, s, r]) => {
      const rows = (s.data ?? []) as { key: string; value: { items?: unknown } }[]
      const projects = (rows.find((x) => x.key === 'ad_projects')?.value.items ?? []) as { gameId: string; status: string; idea?: { title: string } }[]
      const profiles = (rows.find((x) => x.key === 'game_profiles')?.value.items ?? {}) as Record<string, { status?: string; summary?: string }>
      setX({
        approvals: (b.data ?? []) as Extra['approvals'],
        studio: projects.filter((p) => p.status === 'review' || p.status === 'pick').map((p) => ({ gameId: p.gameId, status: p.status, title: p.idea?.title ?? 'Yeni reklam' })),
        drafts: r.count ?? 0,
        noProfile: gameIds.filter((g) => !profiles[g]?.summary),
        draftProfile: gameIds.filter((g) => profiles[g]?.status === 'draft'),
      })
    })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return x
}

export default function Decisions() {
  const { games } = useData()
  const { alerts, recs, decide } = useStore()
  const x = useExtra(games.map((g) => g.id))
  const name = (id: string | null) => (id ? gameById(id)?.name ?? id : '')
  const items: Item[] = []

  for (const a of alerts.filter((a) => a.level === 'critical' && a.status === 'open').slice(0, 2)) {
    items.push({
      id: `a${a.id}`, tone: 'hot', icon: <AlertOctagon size={16} />, title: a.title,
      why: [name(a.gameId), a.deadline ? `son tarih ${a.deadline}` : null, a.body.slice(0, 90)].filter(Boolean).join(' · '),
      action: <Link className="btn sm" to="/uyarilar">Çözümü gör</Link>,
    })
  }
  for (const b of x.approvals) {
    items.push({ id: `b${b.id}`, icon: <Rocket size={16} />, title: `${name(b.game_id)} ${b.version_name ?? ''}: oyunculara açılsın mı?`, why: 'Uzman inceledi, dahili test bitti; senin onayını bekliyor', action: <Link className="btn btn-green sm" to="/yayin">İncele</Link> })
  }
  for (const r of recs.filter((r) => r.status === 'pending').slice(0, 2)) {
    items.push({
      id: `r${r.id}`, icon: <Wallet size={16} />, title: r.title,
      why: `${name(r.gameId)} · ${r.cost ? `tahmini ${money(r.cost)}` : 'para harcamaz'} · ${r.detail.slice(0, 80)}`,
      action: (
        <div className="flex" style={{ gap: 4 }}>
          <button type="button" className="btn btn-green sm" onClick={() => decide(r.id, 'approved')}><Check size={12} /> Onayla</button>
          <button type="button" className="btn btn-ghost sm" onClick={() => decide(r.id, 'rejected')} aria-label="Reddet"><X size={12} /></button>
        </div>
      ),
    })
  }
  for (const s of x.studio.slice(0, 2)) {
    items.push({
      id: `s${s.gameId}${s.title}`, icon: <Clapperboard size={16} />,
      title: s.status === 'review' ? `Reklam videosu hazır: ${s.title}` : `${name(s.gameId)} için 3 reklam fikri geldi`,
      why: s.status === 'review' ? `${name(s.gameId)} · izle, onayla ya da çekimleri değiştir` : 'Birini seç ya da "olmaz" de; sebebin hatırlanır',
      action: <Link className="btn sm" to="/studyo">{s.status === 'review' ? 'İzle' : 'Seç'}</Link>,
    })
  }
  if (x.drafts > 0) items.push({ id: 'rv', icon: <MessageSquareText size={16} />, title: `${x.drafts} yorum cevabı taslağı onay bekliyor`, why: 'Claude yazdı; gönderilmeden önce senin onayın gerekiyor', action: <Link className="btn sm" to="/yorumlar">Bak</Link> })
  const prof = [...x.draftProfile, ...x.noProfile]
  if (prof.length) items.push({ id: 'gp', icon: <BookOpen size={16} />, title: `${prof.length} oyunun kartı ${x.draftProfile.length ? 'onay bekliyor' : 'eksik'}`, why: `${prof.map(name).join(', ')} · reklam fikirleri oyunu tanımadan yazılıyor`, action: <Link className="btn sm" to="/studyo">Tanıt</Link> })

  const shown = items.slice(0, 5)
  return (
    <section className="decisions" aria-label="Bugün karar ver">
      <div className="flex between"><span className="eyebrow">Bugün karar ver</span>{items.length > 5 && <span className="muted small">+{items.length - 5} daha</span>}</div>
      {shown.length === 0 ? (
        <div className="decision"><Check size={16} color="var(--green)" /><div className="grow"><b>Senden bekleyen karar yok</b><span>Uyarı, onay ve taslakların hepsi bitmiş</span></div></div>
      ) : shown.map((i) => (
        <div key={i.id} className={`decision ${i.tone ?? ''}`}>
          <span className="decision-ico">{i.icon}</span>
          <div className="grow" style={{ minWidth: 0 }}><b>{i.title}</b><span>{i.why}</span></div>
          {i.action}
        </div>
      ))}
    </section>
  )
}
