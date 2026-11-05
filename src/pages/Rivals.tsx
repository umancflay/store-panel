import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Plus, RefreshCw, Search, Star, Swords, X } from 'lucide-react'
import { useData } from '../lib/data'
import { useSetting, trDateTime } from '../lib/rows'
import { useStore } from '../lib/store'
import { isDemo } from '../lib/supabase'
import { GameLogo, SampleBanner } from '../components/ui'
import TopCharts, { useCharts } from '../components/TopCharts'

// Rakip ve anahtar kelime takibi. Ne takip edileceğini burada seçersin; günlük iş (scripts/ranks.mjs)
// Play ve App Store'da sıranı, rakiplerin puanını, indirmesini ve güncellemelerini yazar.

type Watch = { keywords: string[]; rivals: string[]; country: string }
type WatchSetting = { items: Record<string, Watch>; requested?: boolean }
type KwSnap = { d: string; play?: number | null; ios?: number | null }
type RivalSnap = { d: string; rating: number | null; reviews: string | null; installs: number | null; label: string | null }
type Hist = { keywords: Record<string, { snaps: KwSnap[] }>; rivals: Record<string, { title: string; icon: string | null; updated: string | null; snaps: RivalSnap[] }> }
type HistSetting = { items: Record<string, Hist>; updated?: string }
type Guides = { items: Record<string, { refs?: { pkg: string; title: string }[] }> }

const COUNTRIES: [string, string][] = [['us', 'ABD'], ['tr', 'Türkiye'], ['gb', 'İngiltere'], ['de', 'Almanya'], ['br', 'Brezilya'], ['in', 'Hindistan']]
const iso = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)).replace('.0', '').replace('.', ',')
const pkgOf = (s: string) => s.match(/[?&]id=([A-Za-z0-9._]+)/)?.[1] ?? (/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(s.trim()) ? s.trim() : null)
// 7 gün önceki (ya da en eski) kayıt: değişimi göstermek için
const weekAgo = <T extends { d: string }>(snaps: T[]) => snaps.find((s) => s.d >= iso(7)) ?? snaps[0]
const daysSince = (d: string) => Math.round((Date.now() - Date.parse(d)) / 86400000)

const demoWatch: WatchSetting = { items: { salgin: { keywords: ['zombie survival', 'zombie defense', 'base defense'], rivals: ['com.kefirgames.lastdayonearth'], country: 'us' } } }
const demoHist: HistSetting = {
  updated: new Date().toISOString(),
  items: {
    salgin: {
      keywords: {
        'zombie survival': { snaps: [{ d: iso(7), play: 24, ios: 41 }, { d: iso(0), play: 17, ios: 38 }] },
        'zombie defense': { snaps: [{ d: iso(7), play: 12, ios: null }, { d: iso(0), play: 8, ios: 63 }] },
        'base defense': { snaps: [{ d: iso(0), play: null, ios: null }] },
      },
      rivals: {
        'com.kefirgames.lastdayonearth': { title: 'Last Day on Earth: Survival', icon: null, updated: iso(2), snaps: [{ d: iso(7), rating: 4.3, reviews: '3.9M', installs: 101200000, label: '100M+' }, { d: iso(0), rating: 4.3, reviews: '3.9M', installs: 101650000, label: '100M+' }] },
      },
    },
  },
}

export default function Rivals() {
  const { games } = useData()
  const { toast } = useStore()
  const [watchSetting, saveWatch] = useSetting<WatchSetting>('rank_watch', isDemo ? demoWatch : { items: {} })
  const [hist] = useSetting<HistSetting>('rank_history', isDemo ? demoHist : { items: {} })
  const [guides] = useSetting<Guides>('design_guides', { items: {} })
  const charts = useCharts()
  const [picked, setPicked] = useState<string | null>(null)
  const [kwInput, setKwInput] = useState('')
  const [rivalInput, setRivalInput] = useState('')
  const gameId = picked ?? games[0]?.id ?? null
  const game = games.find((g) => g.id === gameId)
  const watch: Watch = (gameId && watchSetting.items[gameId]) || { keywords: [], rivals: [], country: 'us' }
  const h: Hist | undefined = gameId ? hist.items?.[gameId] : undefined

  const update = async (w: Partial<Watch>, extra: Partial<WatchSetting> = {}) => {
    if (!gameId) return
    try {
      await saveWatch({ ...watchSetting, ...extra, items: { ...watchSetting.items, [gameId]: { ...watch, ...w } } })
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }
  const addKw = () => {
    const k = kwInput.trim().toLowerCase()
    if (!k || watch.keywords.includes(k)) return setKwInput('')
    if (watch.keywords.length >= 15) return toast('Oyun başına en fazla 15 kelime', 'warn')
    update({ keywords: [...watch.keywords, k] })
    setKwInput('')
  }
  const addRival = (raw: string) => {
    const p = pkgOf(raw)
    if (!p) return toast('Play linki ya da paket adı yaz (ör. com.firma.oyun)', 'warn')
    if (watch.rivals.includes(p)) return setRivalInput('')
    if (watch.rivals.length >= 10) return toast('Oyun başına en fazla 10 rakip', 'warn')
    update({ rivals: [...watch.rivals, p] })
    setRivalInput('')
  }
  const checkNow = async () => {
    await update({}, { requested: true })
    toast('Bir sonraki saatlik işte kontrol edilecek', 'info')
  }

  const suggestions = useMemo(
    () => (gameId ? guides.items?.[gameId]?.refs ?? [] : []).filter((r) => !watch.rivals.includes(r.pkg)).slice(0, 4),
    [guides, gameId, watch.rivals],
  )

  const rankCell = (snaps: KwSnap[], store: 'play' | 'ios') => {
    const now = snaps[snaps.length - 1]?.[store]
    const before = weekAgo(snaps)?.[store]
    if (now === undefined) return <span className="muted">—</span>
    const max = store === 'play' ? '30+' : '200+'
    const diff = now != null && before != null && before !== now ? before - now : 0
    return (
      <span className={`rank ${now != null && now <= 10 ? 'top' : ''}`}>
        {now == null ? <span className="muted">{max}</span> : <b>{now}.</b>}
        {diff !== 0 && <small className={diff > 0 ? 'up' : 'down'}>{diff > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{Math.abs(diff)}</small>}
        {now != null && before == null && snaps.length > 1 && <small className="up">yeni</small>}
      </span>
    )
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 12 }}>
        <div>
          <span className="eyebrow">Mağaza takibi</span>
          <h1>Rakipler ve arama sırası</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Günde bir kontrol edilir{hist.updated ? ` · son: ${trDateTime(hist.updated)}` : ' · henüz kontrol edilmedi'}. İlk 10'a girince ya da rakip güncelleme yapınca telefonuna bildirim gelir.
          </p>
        </div>
        <button type="button" className="btn" onClick={checkNow} disabled={watchSetting.requested}>
          {watchSetting.requested ? <><Loader2 size={13} className="spin" /> Sırada</> : <><RefreshCw size={13} /> Şimdi kontrol et</>}
        </button>
      </div>

      {games.length > 1 && (
        <div className="flex wrap" style={{ gap: 8 }}>
          {games.map((g) => (
            <button key={g.id} type="button" className={`chip-btn ${g.id === gameId ? 'on' : ''}`} onClick={() => setPicked(g.id)}>
              <GameLogo id={g.id} size={18} /> {g.name}
            </button>
          ))}
        </div>
      )}

      {!game ? <div className="card empty">Henüz oyun yok.</div> : (
        <div className="grid g-2" style={{ alignItems: 'start' }}>
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title flex" style={{ gap: 8 }}><Search size={16} /> Arama sırası</div>
                <div className="card-sub">Oyuncu bu kelimeyi aratınca {game.name} kaçıncı çıkıyor</div>
              </div>
              <select className="select sm" value={watch.country} onChange={(e) => update({ country: e.target.value })} aria-label="Ülke" style={{ width: 'auto' }}>
                {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </div>
            <form className="flex" style={{ gap: 8, marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); addKw() }}>
              <input className="input grow" value={kwInput} onChange={(e) => setKwInput(e.target.value)} placeholder="ör. moving simulator (İngilizce yaz)" />
              <button type="submit" className="btn sm" disabled={!kwInput.trim()}><Plus size={13} /> Ekle</button>
            </form>
            {watch.keywords.length === 0 ? (
              <div className="empty small">Oyuncuların seni bulmak için yazacağı 3–10 kelime ekle. İpucu: oyunun türü ("moving simulator"), ana eylem ("truck loading"), rakibin adı.</div>
            ) : (
              <table className="rank-table">
                <thead><tr><th>Kelime</th><th>Play</th><th>App Store</th><th aria-label="Sil" /></tr></thead>
                <tbody>
                  {watch.keywords.map((k) => {
                    const snaps = h?.keywords?.[k]?.snaps ?? []
                    return (
                      <tr key={k}>
                        <td><b>{k}</b></td>
                        <td>{snaps.length ? rankCell(snaps, 'play') : <span className="muted small">bekliyor</span>}</td>
                        <td>{snaps.length ? rankCell(snaps, 'ios') : <span className="muted small">bekliyor</span>}</td>
                        <td><button type="button" className="icon-btn" title="Takipten çıkar" onClick={() => update({ keywords: watch.keywords.filter((x) => x !== k) })}><X size={13} /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {(() => {
              // App Store'un arama önerileri: takip edilen kelimeleri yazanlar bunları da arıyor
              const ideas = [...new Set(watch.keywords.flatMap((k) => charts.hints?.[k] ?? []))].filter((t) => !watch.keywords.includes(t)).slice(0, 10)
              return ideas.length > 0 && (
                <div className="flex wrap" style={{ gap: 6, marginTop: 12 }}>
                  <span className="muted small">Oyuncular şunu da arıyor:</span>
                  {ideas.map((t) => <button key={t} type="button" className="chip-btn" onClick={() => watch.keywords.length < 15 && update({ keywords: [...watch.keywords, t] })}><Plus size={11} /> {t}</button>)}
                </div>
              )
            })()}
            <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
              Play ilk 30, App Store ilk 200 sonuca bakılır. Oklar geçen haftaya göre değişim. "—" = oyun o mağazada yok.
            </p>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title flex" style={{ gap: 8 }}><Swords size={16} /> Rakipler</div>
                <div className="card-sub">Puan, indirme ve son güncelleme (Google Play)</div>
              </div>
            </div>
            <form className="flex" style={{ gap: 8, marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); addRival(rivalInput) }}>
              <input className="input grow" value={rivalInput} onChange={(e) => setRivalInput(e.target.value)} placeholder="Play linki ya da paket adı" />
              <button type="submit" className="btn sm" disabled={!rivalInput.trim()}><Plus size={13} /> Ekle</button>
            </form>
            {suggestions.length > 0 && (
              <div className="flex wrap" style={{ gap: 6, marginBottom: 12 }}>
                <span className="muted small">Tasarım rehberinden:</span>
                {suggestions.map((r) => <button key={r.pkg} type="button" className="chip-btn" onClick={() => addRival(r.pkg)}><Plus size={11} /> {r.title}</button>)}
              </div>
            )}
            {watch.rivals.length === 0 ? <div className="empty small">Seninle aynı türde, iyi giden 3–5 oyun ekle.</div> : (
              <div className="rival-list">
                {watch.rivals.map((p) => {
                  const r = h?.rivals?.[p]
                  const last = r ? r.snaps[r.snaps.length - 1] : undefined
                  const old = r ? weekAgo(r.snaps) : undefined
                  const gained = last?.installs != null && old?.installs != null && old !== last ? last.installs - old.installs : null
                  const fresh = r?.updated ? daysSince(r.updated) : null
                  return (
                    <div key={p} className="rival-row">
                      {r?.icon ? <img src={`${r.icon}=s64`} alt="" width={32} height={32} /> : <span className="rival-ph" />}
                      <div className="grow" style={{ minWidth: 0 }}>
                        <a className="linkish" href={`https://play.google.com/store/apps/details?id=${p}`} target="_blank" rel="noreferrer"><b>{r?.title ?? p}</b> <ExternalLink size={10} /></a>
                        {last ? (
                          <div className="muted small flex wrap" style={{ gap: 10 }}>
                            {last.rating != null && <span><Star size={10} /> {String(last.rating).replace('.', ',')}{last.reviews ? ` · ${last.reviews} yorum` : ''}</span>}
                            {last.label && <span>{last.label} indirme{gained ? ` · +${compact(gained)} bu hafta` : ''}</span>}
                          </div>
                        ) : <div className="muted small">İlk kontrol bekleniyor</div>}
                      </div>
                      {fresh != null && <span className={`badge ${fresh <= 7 ? 'b-warning' : 'b-muted'}`} title={`Son güncelleme ${r!.updated}`}>{fresh === 0 ? 'Bugün güncelledi' : `${fresh} gün önce güncelledi`}</span>}
                      <button type="button" className="icon-btn" title="Takipten çıkar" onClick={() => update({ rivals: watch.rivals.filter((x) => x !== p) })}><X size={13} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <TopCharts />
    </div>
  )
}
