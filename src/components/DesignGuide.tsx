import { useCallback, useEffect, useState } from 'react'
import { Copy, ExternalLink, Loader2, Palette, Search } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useStore } from '../lib/store'
import { triggerWorkflow } from '../lib/trigger'
import { trDateTime } from '../lib/rows'

// Tasarım rehberi: türündeki popüler oyunların mağaza görsellerine bakılır (scripts/designguide.mjs),
// tasarım dili çıkarılır ve ChatGPT'ye yapıştırılacak hazır görsel promptları yazılır. Görseli sen ChatGPT'de üretirsin.

type Prompt = { kind: 'feature' | 'screenshot' | 'poster' | 'icon' | 'background'; title: string; size: string; prompt: string; tip: string }
interface Guide {
  status?: 'requested' | 'ready' | 'failed'; error?: string | null; at?: string; refs?: { pkg: string; title: string; installs?: string | null }[]
  references?: { title: string; notes: string }[]; style?: Record<'colors' | 'typography' | 'layout' | 'captions' | 'characters' | 'icon', string>
  doThis?: string[]; avoid?: string[]; prompts?: Prompt[]; refs_input?: string; note?: string
}
type Items = Record<string, Guide>

const kindText = { feature: 'Tanıtım görseli', screenshot: 'Ekran görüntüsü', poster: 'Reklam afişi', icon: 'İkon', background: 'Arka plan' }
const styleText = { colors: 'Renkler', typography: 'Yazı', layout: 'Yerleşim', captions: 'Başlıklar', characters: 'Karakterler', icon: 'İkon' }

const demo: Items = {
  salgin: {
    status: 'ready', at: new Date().toISOString(), refs: [{ pkg: 'com.example.a', title: 'Last Shelter', installs: '50M+' }],
    references: [{ title: 'Last Shelter', notes: 'Koyu arka plan, turuncu vurgu, karakter yakın plan, 3 kelimelik büyük başlık.' }],
    style: { colors: 'Koyu lacivert zemin, turuncu ve neon yeşil vurgu', typography: 'Çok kalın, siyah konturlu büyük harf', layout: 'Üstte başlık, ortada büyük oyun görüntüsü', captions: '2-4 kelime, fiille başlıyor', characters: 'Kahraman yakın plan, arkada kalabalık', icon: 'Tek karakter yüzü, parlak çerçeve' },
    doThis: ['İlk ekran görüntüsünde en heyecanlı anı göster'], avoid: ['Uzun cümleler'],
    prompts: [{ kind: 'feature', title: 'Gece savunması', size: '1024x500', prompt: 'Wide 1024x500 game store banner, dark navy night sky, glowing orange barricades…', tip: 'Oyun ekran görüntünü de ekle.' }],
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

export default function DesignGuide({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { toast } = useStore()
  const { items, patch } = useGuides()
  const g = items[gameId]
  const [refs, setRefs] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => { setRefs(g?.refs_input ?? ''); setNote(g?.note ?? '') }, [gameId]) // eslint-disable-line react-hooks/exhaustive-deps
  const running = g?.status === 'requested'

  async function start() {
    try {
      await patch(gameId, { status: 'requested', error: null, refs_input: refs, note })
      triggerWorkflow('assistant.yml')
      toast('Popüler oyunlar inceleniyor; 2-4 dakika')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }
  const copy = (p: Prompt, open = false) => navigator.clipboard.writeText(p.prompt).then(() => {
    toast(open ? 'Prompt kopyalandı; ChatGPT\'de yapıştır' : 'Prompt kopyalandı')
    if (open) window.open('https://chatgpt.com/', '_blank', 'noopener')
  })

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title flex" style={{ gap: 8 }}><Palette size={16} /> Tasarım rehberi</div>
          <div className="card-sub">Popüler oyunların mağaza görsellerine bakar, {gameName} için ChatGPT'de kullanacağın promptları yazar{g?.at && <> · {trDateTime(g.at)}</>}</div>
        </div>
      </div>

      <div className="guide-form">
        <input className="input" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="Örnek oyunlar (isteğe bağlı): ör. Last Shelter, State of Survival" aria-label="Örnek oyunlar" />
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="İsteğin (isteğe bağlı): ör. daha karanlık, korku havası" aria-label="İstek" />
        <button type="button" className="btn btn-primary" onClick={start} disabled={running}>
          {running ? <><Loader2 size={13} className="spin" /> İnceleniyor</> : <><Search size={13} /> {g?.prompts ? 'Yeniden incele' : 'Popüler oyunları incele'}</>}
        </button>
      </div>
      {!refs && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Boş bırakırsan türündeki en popüler oyunlar Play Store'dan seçilir.</div>}
      {g?.error && <div className="studio-wait bad" style={{ marginTop: 10 }}>{g.error}</div>}

      {g?.prompts && (
        <div className="guide">
          {g.refs && g.refs.length > 0 && (
            <div className="flex wrap" style={{ gap: 6 }}>
              <span className="muted small">İncelenen:</span>
              {g.refs.map((r) => (
                <a key={r.pkg} className="chip-btn" style={{ paddingLeft: 12 }} href={`https://play.google.com/store/apps/details?id=${r.pkg}`} target="_blank" rel="noreferrer">{r.title}{r.installs && <span className="muted"> · {r.installs}</span>} <ExternalLink size={10} /></a>
              ))}
            </div>
          )}

          {g.style && (
            <div className="guide-style">
              {(Object.keys(styleText) as (keyof typeof styleText)[]).map((k) => g.style?.[k] && (
                <div key={k}><span>{styleText[k]}</span><p>{g.style[k]}</p></div>
              ))}
            </div>
          )}

          <div className="grid g-2" style={{ gap: 10 }}>
            {g.doThis && g.doThis.length > 0 && <div className="inner"><div className="eyebrow" style={{ marginBottom: 6 }}>Yap</div><ul className="guide-list">{g.doThis.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {g.avoid && g.avoid.length > 0 && <div className="inner"><div className="eyebrow" style={{ marginBottom: 6 }}>Kaçın</div><ul className="guide-list">{g.avoid.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          </div>

          <div className="eyebrow">ChatGPT promptları</div>
          <div className="guide-prompts">
            {g.prompts.map((p, i) => (
              <div key={i} className="ai-prompt">
                <div className="flex between wrap" style={{ gap: 6 }}>
                  <span className="small"><span className="badge b-primary">{kindText[p.kind]}</span> <b>{p.title}</b> <span className="muted">· {p.size}</span></span>
                  <span className="flex" style={{ gap: 4 }}>
                    <button type="button" className="btn btn-ghost sm" onClick={() => copy(p)}><Copy size={12} /> Kopyala</button>
                    <button type="button" className="btn sm" onClick={() => copy(p, true)}><ExternalLink size={12} /> ChatGPT'de aç</button>
                  </span>
                </div>
                <code>{p.prompt}</code>
                {p.tip && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>💡 {p.tip}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
