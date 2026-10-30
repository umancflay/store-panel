import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Check, ChevronDown, Loader2, Save, Search } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useStore } from '../lib/store'
import { triggerWorkflow } from '../lib/trigger'
import { trDateTime } from '../lib/rows'

// Oyun kartı: Claude ve kendi model reklam fikri yazarken oyunun gerçekte ne olduğunu buradan bilir.
// "Mağazadan oku" Claude'a Play Store / App Store sayfasını okutur (scripts/gameprofile.mjs); sen düzeltip onaylarsın.

export interface Profile {
  status?: 'requested' | 'draft' | 'ok' | 'failed'
  summary?: string; gameplay?: string; moments?: string[]; look?: string; characters?: string[]; audience?: string; selling?: string[]; avoid?: string; notes?: string
  sources?: string[]; error?: string | null; updatedAt?: string
}
type Items = Record<string, Profile>

const fields: { key: keyof Profile; label: string; hint: string; list?: boolean; rows?: number }[] = [
  { key: 'summary', label: 'Oyun ne?', hint: '2 cümle', rows: 2 },
  { key: 'gameplay', label: 'Nasıl oynanıyor', hint: 'Temel döngü: oyuncu ne yapar, ne kazanır', rows: 3 },
  { key: 'moments', label: 'Kayda değer anlar', hint: 'Her satıra bir an (reklamda gösterilecek, oyunda gerçekten olan)', list: true, rows: 4 },
  { key: 'look', label: 'Görsel tarz', hint: '2D/3D, low-poly, cartoon, renkler, kamera', rows: 2 },
  { key: 'characters', label: 'Karakterler, mekanlar, nesneler', hint: 'Her satıra bir tane', list: true, rows: 3 },
  { key: 'audience', label: 'Kime hitap ediyor', hint: '', rows: 1 },
  { key: 'selling', label: 'Öne çıkan özellikler', hint: 'Her satıra bir tane', list: true, rows: 3 },
  { key: 'avoid', label: 'Reklamda olmasın', hint: 'Yanıltıcı olabilecek ya da göstermek istemediğin şeyler', rows: 2 },
  { key: 'notes', label: 'Senin notun', hint: 'Mağazada yazmayan her şey: yeni bölüm, oyunun hissi … (Claude en çok buna güvenir)', rows: 3 },
]

const demo: Items = {
  salgin: { status: 'draft', summary: 'Zombi salgınında üssünü savunduğun bir hayatta kalma stratejisi.', gameplay: 'Gündüz kaynak toplayıp barikat kurarsın, gece dalga dalga gelen zombilere karşı savunursun.', moments: ['Gece ilk dalganın gelişi', 'Barikatın son anda kurulması'], look: '3D low-poly, karanlık mavi-kırmızı tonlar, yukarıdan kamera', sources: ['https://play.google.com/store/apps/details?id=…'] },
}

function useProfiles() {
  const [items, setItems] = useState<Items>(isDemo ? demo : {})
  const load = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase!.from('app_settings').select('value').eq('key', 'game_profiles').maybeSingle()
    setItems((data as { value?: { items?: Items } } | null)?.value?.items ?? {})
  }, [])
  useEffect(() => { load() }, [load])
  const busy = Object.values(items).some((p) => p.status === 'requested')
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [busy, load])
  // İş de aynı anahtara yazıyor: son hali okuyup sadece bu oyunu değiştir
  const patch = useCallback(async (gameId: string, p: Profile) => {
    if (isDemo) return setItems((l) => ({ ...l, [gameId]: { ...l[gameId], ...p } }))
    const { data } = await supabase!.from('app_settings').select('value').eq('key', 'game_profiles').maybeSingle()
    const cur = (data as { value?: { items?: Items } } | null)?.value?.items ?? {}
    const next = { ...cur, [gameId]: { ...cur[gameId], ...p, updatedAt: new Date().toISOString() } }
    const { error } = await supabase!.from('app_settings').upsert({ key: 'game_profiles', value: { items: next }, updated_at: new Date().toISOString() } as never)
    if (error) throw new Error(error.message)
    setItems(next)
  }, [])
  return { items, patch }
}

export function useGameProfile(gameId: string) {
  const { items, patch } = useProfiles()
  return { profile: items[gameId] as Profile | undefined, patch: (p: Profile) => patch(gameId, p) }
}

export default function GameProfile({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { toast } = useStore()
  const { profile, patch } = useGameProfile(gameId)
  const [form, setForm] = useState<Profile>({})
  const [open, setOpen] = useState(false)
  const status = profile?.status
  const empty = !profile?.summary && !profile?.gameplay

  useEffect(() => { setForm(profile ?? {}) }, [profile])
  useEffect(() => { setOpen(empty || status === 'draft') }, [gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  const val = (k: keyof Profile) => {
    const v = form[k]
    return Array.isArray(v) ? v.join('\n') : (v as string | undefined) ?? ''
  }
  const set = (k: keyof Profile, list: boolean | undefined, v: string) => setForm((f) => ({ ...f, [k]: list ? v.split('\n') : v }))
  const clean = (f: Profile): Profile => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => x.trim()).filter(Boolean) : v])) as Profile
  const fields2 = (f: Profile) => Object.fromEntries(fields.map((x) => [x.key, f[x.key]])) as Profile

  const run = async (p: Profile, ok: string, trigger = false) => {
    try {
      await patch(p)
      if (trigger) triggerWorkflow('assistant.yml')
      toast(ok)
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }

  const chip = status === 'requested' ? ['Mağazadan okunuyor', 'b-warning'] : status === 'ok' ? ['Onaylandı', 'b-ok'] : status === 'draft' ? ['Taslak: kontrol et', 'b-warning'] : empty ? ['Tanıtılmadı', 'b-critical'] : ['Taslak', 'b-warning']

  return (
    <section className="card game-profile">
      <button type="button" className="gp-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <BookOpen size={16} />
        <div className="grow" style={{ textAlign: 'left' }}>
          <b>{gameName} oyun kartı</b>
          <div className="muted small">{empty ? 'Fikirler oyunun gerçekte ne olduğunu bilmeden yazılıyor. Önce tanıt.' : profile?.summary}</div>
        </div>
        <span className={`badge ${chip[1]}`}>{status === 'requested' && <Loader2 size={11} className="spin" />} {chip[0]}</span>
        <ChevronDown size={14} className={`finding-chev${open ? ' open' : ''}`} />
      </button>

      {open && (
        <div className="gp-body">
          {profile?.error && <div className="studio-wait bad">{profile.error}</div>}
          <div className="gp-grid">
            {fields.map((f) => (
              <label key={f.key} className={f.key === 'notes' || f.key === 'gameplay' ? 'wide' : ''}>
                <span>{f.label} {f.hint && <i>· {f.hint}</i>}</span>
                <textarea className="input" rows={f.rows} value={val(f.key)} onChange={(e) => set(f.key, f.list, e.target.value)} />
              </label>
            ))}
          </div>
          {profile?.sources && profile.sources.length > 0 && <div className="muted" style={{ fontSize: 10 }}>Kaynak: {profile.sources.join(' · ')}{profile.updatedAt && <> · {trDateTime(profile.updatedAt)}</>}</div>}
          <div className="flex wrap" style={{ gap: 8 }}>
            <button type="button" className="btn" disabled={status === 'requested'} onClick={() => run({ ...fields2(clean(form)), status: 'requested', error: null }, 'Claude mağaza sayfasını okuyor; 1-2 dakika', true)}>
              <Search size={13} /> {empty ? 'Mağazadan oku ve taslak yaz' : 'Mağazadan yeniden oku'}
            </button>
            <button type="button" className="btn" onClick={() => run({ ...fields2(clean(form)), status: status === 'ok' ? 'ok' : 'draft' }, 'Kaydedildi')}><Save size={13} /> Kaydet</button>
            <button type="button" className="btn btn-green" disabled={!form.summary && !form.gameplay} onClick={() => run({ ...fields2(clean(form)), status: 'ok' }, 'Oyun kartı onaylandı')}><Check size={13} /> Doğru, onayla</button>
          </div>
        </div>
      )}
    </section>
  )
}
