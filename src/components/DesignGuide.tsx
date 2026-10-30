import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, Copy, ExternalLink, ImagePlus, Loader2, Palette, Search, Settings2 } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useStore } from '../lib/store'
import { usePeople } from '../lib/data'
import { triggerWorkflow } from '../lib/trigger'
import { trDateTime } from '../lib/rows'
import { uploadFile } from '../lib/files'

// Tasarım rehberi: Claude önce SENİN oyununun görsellerine (Play sayfası + panele yüklenenler) ve oyun kartına bakar,
// popüler oyunlardan sadece tarzı (renk, yazı, kompozisyon) alır, ChatGPT'de kullanılacak promptları yazar (scripts/designguide.mjs).

type Prompt = { kind: 'feature' | 'screenshot' | 'poster' | 'icon' | 'background'; title: string; size: string; prompt: string; promptTr?: string; tip: string }
interface Guide {
  status?: 'requested' | 'ready' | 'failed'; error?: string | null; at?: string; refs?: { pkg: string; title: string; installs?: string | null }[]
  ourGame?: string; ownImages?: number; hasCard?: boolean
  references?: { title: string; notes: string }[]; style?: Record<'colors' | 'typography' | 'layout' | 'captions' | 'characters' | 'icon', string>
  doThis?: string[]; avoid?: string[]; prompts?: Prompt[]; refs_input?: string; note?: string
}
type Items = Record<string, Guide>

const kindText = { feature: 'Tanıtım', screenshot: 'Ekran görüntüsü', poster: 'Afiş', icon: 'İkon', background: 'Arka plan' }
const styleText = { colors: 'Renkler', typography: 'Yazı', layout: 'Yerleşim', captions: 'Başlıklar', characters: 'Karakterler', icon: 'İkon' }

const demo: Items = {
  salgin: {
    status: 'ready', at: new Date().toISOString(), ownImages: 3, hasCard: true, ourGame: 'Üstten görünen, low-poly bir şehir; gece sahnesinde barikatlar ve yeşil zombiler, turuncu arayüz.',
    refs: [{ pkg: 'com.example.a', title: 'Last Shelter', installs: '50M+' }],
    style: { colors: 'Koyu zemin, turuncu ve neon yeşil vurgu', typography: 'Çok kalın, konturlu büyük harf', layout: 'Üstte başlık, ortada büyük oyun görüntüsü', captions: '2-4 kelime, fiille başlıyor', characters: 'Yakın plan kahraman', icon: 'Tek yüz, parlak çerçeve' },
    doThis: ['İlk görselde en heyecanlı anı göster'], avoid: ['Uzun cümleler'],
    prompts: [{ kind: 'feature', title: 'Gece savunması', size: '1024x500', prompt: 'Wide 1024x500 store banner of our low-poly night city…', promptTr: 'Gece şehrimizin 1024x500 mağaza afişi…', tip: 'Oyun ekran görüntünü de ekle.' }],
  },
}

function useGuides() {
  const [items, setItems] = useState<Items>(isDemo ? demo : {})
  const load = useCallback(async () => {
    if (isDemo) return
    const { data } = await supabase!.from('app_settings').select('value').eq('key', 'design_guides').maybeSingle()
    setItems((data as { value?: { items?: Items } } | null)?.value?.items ?? {})
  }, [])
  useEffect(() => { load() }, [load])
  const busy = Object.values(items).some((g) => g.status === 'requested')
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [busy, load])
  const patch = useCallback(async (gameId: string, g: Guide) => {
    if (isDemo) return setItems((l) => ({ ...l, [gameId]: { ...l[gameId], ...g } }))
    const { data } = await supabase!.from('app_settings').select('value').eq('key', 'design_guides').maybeSingle()
    const cur = (data as { value?: { items?: Items } } | null)?.value?.items ?? {}
    const next = { ...cur, [gameId]: { ...cur[gameId], ...g } }
    const { error } = await supabase!.from('app_settings').upsert({ key: 'design_guides', value: { items: next }, updated_at: new Date().toISOString() } as never)
    if (error) throw new Error(error.message)
    setItems(next)
  }, [])
  return { items, patch }
}

// Oyunun kendi görselleri kaç tane (Claude bunlara bakar)
function useOwnImages(gameId: string) {
  const [n, setN] = useState<number | null>(isDemo ? 3 : null)
  const load = useCallback(async () => {
    if (isDemo) return
    const { count } = await supabase!.from('files').select('id', { count: 'exact', head: true }).eq('game_id', gameId).like('mime', 'image*').neq('uploaded_by', 'Reklam Stüdyosu')
    setN(count ?? 0)
  }, [gameId])
  useEffect(() => { load() }, [load])
  return [n, load] as const
}

const LANG_KEY = 'guide-lang'

export default function DesignGuide({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { toast } = useStore()
  const { me } = usePeople()
  const { items, patch } = useGuides()
  const [own, reloadOwn] = useOwnImages(gameId)
  const g = items[gameId]
  const [refs, setRefs] = useState('')
  const [note, setNote] = useState('')
  const [lang, setLang] = useState<'tr' | 'en'>(() => { try { return (localStorage.getItem(LANG_KEY) as 'tr' | 'en') || 'tr' } catch { return 'tr' } })
  const [openPrompt, setOpenPrompt] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { setRefs(g?.refs_input ?? ''); setNote(g?.note ?? ''); setOpenPrompt(null) }, [gameId]) // eslint-disable-line react-hooks/exhaustive-deps
  const running = g?.status === 'requested'

  const setLanguage = (l: 'tr' | 'en') => { setLang(l); try { localStorage.setItem(LANG_KEY, l) } catch { /* yok */ } }
  const textOf = (p: Prompt) => (lang === 'tr' && p.promptTr ? p.promptTr : p.prompt)

  async function start() {
    try {
      await patch(gameId, { status: 'requested', error: null, refs_input: refs, note })
      triggerWorkflow('assistant.yml')
      toast('İnceleniyor; 2-4 dakika')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }
  async function addImages(list: FileList) {
    setUploading(true)
    try {
      for (const f of Array.from(list).slice(0, 6)) {
        if (!f.type.startsWith('image/')) continue
        const meta = await uploadFile(f)
        if (!isDemo) {
          const { error } = await supabase!.from('files').insert({ ...meta, folder: 'Oyun görselleri', game_id: gameId, uploaded_by: me.email } as never)
          if (error) throw new Error(error.message)
        }
      }
      await reloadOwn()
      toast('Görseller eklendi; şimdi incelet')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
    setUploading(false)
  }
  const copy = (p: Prompt, open = false) => navigator.clipboard.writeText(textOf(p)).then(() => {
    toast(open ? 'Kopyalandı; ChatGPT\'de yapıştır' : 'Kopyalandı')
    if (open) window.open('https://chatgpt.com/', '_blank', 'noopener')
  })

  // Play sayfasından okunanlar da sayılır (son incelemede kaç görsele baktığı)
  const ownCount = Math.max(own ?? 0, g?.ownImages ?? 0)
  const noBasis = own !== null && ownCount === 0
  return (
    <section className="card guide-card">
      <div className="guide-top">
        <Palette size={16} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>Tasarım rehberi</b>
          <div className="muted small">{g?.at ? `Son inceleme ${trDateTime(g.at)}` : `${gameName} için ChatGPT görsel promptları`}</div>
        </div>
        <button type="button" className="btn btn-primary sm" onClick={start} disabled={running}>
          {running ? <><Loader2 size={13} className="spin" /> İnceleniyor</> : <><Search size={13} /> {g?.prompts ? 'Yenile' : 'İncele'}</>}
        </button>
      </div>

      {/* Claude'un oyunu neyle tanıdığı */}
      <div className={`guide-basis ${noBasis ? 'warn' : ''}`}>
        {noBasis ? <AlertTriangle size={14} /> : <ImagePlus size={14} />}
        <span className="grow">
          {noBasis
            ? 'Oyunundan görsel yok: promptlar tahmine kalır. 2-4 ekran görüntüsü ekle.'
            : `Claude oyununu ${ownCount} görselinden${g?.hasCard ? ' ve oyun kartından' : ''} tanıyor.`}
        </span>
        <button type="button" className="btn btn-ghost sm" disabled={uploading} onClick={() => file.current?.click()}>
          {uploading ? <Loader2 size={12} className="spin" /> : <ImagePlus size={12} />} Ekran görüntüsü ekle
        </button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addImages(e.target.files); e.target.value = '' }} />
      </div>
      {g?.ourGame && <p className="guide-seen"><span>Gördüğü:</span> {g.ourGame}</p>}
      {g?.error && <div className="studio-wait bad">{g.error}</div>}

      <details className="guide-more">
        <summary><Settings2 size={12} /> Örnek oyun ve istek {refs || note ? '· ayarlı' : ''}</summary>
        <div className="guide-form">
          <input className="input sm" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="Örnek oyunlar: ör. Last Shelter, State of Survival (boşsa türündeki popülerler)" aria-label="Örnek oyunlar" />
          <input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="İsteğin: ör. daha karanlık, korku havası" aria-label="İstek" />
        </div>
      </details>

      {g?.prompts && (
        <>
          <div className="flex between wrap" style={{ gap: 8 }}>
            <span className="eyebrow">Promptlar</span>
            <div className="seg">
              <button type="button" className={lang === 'tr' ? 'on' : ''} onClick={() => setLanguage('tr')}>Türkçe</button>
              <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLanguage('en')}>English</button>
            </div>
          </div>
          <div className="prompt-list">
            {g.prompts.map((p, i) => (
              <div key={i} className={`prompt-row ${openPrompt === i ? 'open' : ''}`}>
                <button type="button" className="prompt-head" onClick={() => setOpenPrompt(openPrompt === i ? null : i)} aria-expanded={openPrompt === i}>
                  <span className="badge b-muted">{kindText[p.kind]}</span>
                  <b className="grow">{p.title}</b>
                  <span className="muted small">{p.size}</span>
                  <ChevronDown size={13} className={`finding-chev${openPrompt === i ? ' open' : ''}`} />
                </button>
                <span className="prompt-actions">
                  <button type="button" className="btn btn-ghost sm" onClick={() => copy(p)} aria-label="Kopyala"><Copy size={12} /></button>
                  <button type="button" className="btn sm" onClick={() => copy(p, true)}><ExternalLink size={12} /> ChatGPT</button>
                </span>
                {openPrompt === i && (
                  <div className="prompt-body">
                    <p>{textOf(p)}</p>
                    {p.tip && <span>💡 {p.tip}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <details className="guide-more">
            <summary><Palette size={12} /> Tasarım dili{g.refs?.length ? ` · ${g.refs.map((r) => r.title).slice(0, 3).join(', ')}` : ''}</summary>
            {g.style && (
              <div className="guide-style">
                {(Object.keys(styleText) as (keyof typeof styleText)[]).map((k) => g.style?.[k] && <div key={k}><span>{styleText[k]}</span><p>{g.style[k]}</p></div>)}
              </div>
            )}
            <div className="grid g-2" style={{ gap: 8, marginTop: 8 }}>
              {g.doThis && g.doThis.length > 0 && <div className="inner"><div className="eyebrow" style={{ marginBottom: 6 }}>Yap</div><ul className="guide-list">{g.doThis.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              {g.avoid && g.avoid.length > 0 && <div className="inner"><div className="eyebrow" style={{ marginBottom: 6 }}>Kaçın</div><ul className="guide-list">{g.avoid.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            </div>
            {g.refs && g.refs.length > 0 && (
              <div className="flex wrap" style={{ gap: 6, marginTop: 8 }}>
                {g.refs.map((r) => <a key={r.pkg} className="chip-btn" style={{ paddingLeft: 12 }} href={`https://play.google.com/store/apps/details?id=${r.pkg}`} target="_blank" rel="noreferrer">{r.title}{r.installs && <span className="muted"> · {r.installs}</span>} <ExternalLink size={10} /></a>)}
              </div>
            )}
          </details>
        </>
      )}
    </section>
  )
}
