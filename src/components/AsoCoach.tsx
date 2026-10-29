import { useEffect, useState } from 'react'
import { Copy, Film, Image as ImageIcon, Loader2, PenLine, Search, Sparkles } from 'lucide-react'
import { isDemo } from '../lib/supabase'
import { enqueue, useSettingRow, type QueueItem } from '../lib/expertQueue'
import { useStore } from '../lib/store'
import { usePeople } from '../lib/data'
import { trDateTime } from '../lib/rows'
import type { Finding } from '../lib/types'
import { FindingRow } from './BuildCard'

// Mağaza sayfası koçu: Play sayfanı okur, en çok indirilen benzer oyunlarla karşılaştırır, ne eksik der,
// kendi modelin başlık/kısa açıklama önerir ve sürüm notu yazar. Hiçbir şey Play'e otomatik yazılmaz.

type Rival = { pkg: string; title: string; installsLabel: string | null; screenshots: number; video: boolean; descLength: number }
type AsoReport = {
  at: string; error?: string; query?: string; language?: string; languages?: string[]
  listing?: { title: string; short: string; fullLength: number; video: string | null } | null
  images?: { phone: number; tablet7: number; tablet10: number; feature: number }
  rivals?: Rival[]; findings?: Finding[]
  suggestions?: { titles: string[]; shorts: string[]; intro: string | null } | null
}
type Notes = { at: string; error?: string; bullets?: string; tr?: string; en?: string | null; ai?: boolean }

const demoReport: AsoReport = {
  at: new Date().toISOString(), query: 'zombie survival', language: 'tr-TR', languages: ['tr-TR'],
  listing: { title: 'Salgın', short: 'Zombilerden kaç!', fullLength: 640, video: null },
  images: { phone: 3, tablet7: 0, tablet10: 0, feature: 1 },
  rivals: [
    { pkg: 'a', title: 'Last Day on Earth: Survival', installsLabel: '100M+', screenshots: 8, video: true, descLength: 3900 },
    { pkg: 'b', title: 'State of Survival: Zombie War', installsLabel: '100M+', screenshots: 8, video: true, descLength: 3400 },
    { pkg: 'c', title: 'Dead Ahead: Zombie Warfare', installsLabel: '10M+', screenshots: 7, video: false, descLength: 2100 },
  ],
  findings: [
    { id: 'title-short', severity: 'warn', title: 'Başlık kısa (6/30 karakter)', detail: 'Başlık aramada en güçlü yer. Oyunun adının yanına türünü ya da ana anahtar kelimeyi ekleyebilirsin.', fix: ['Ad + iki nokta + tür kalıbını dene: "Oyun Adı: Idle Tycoon".'] },
    { id: 'few-shots', severity: 'warn', title: 'Az ekran görüntüsü (3, rakiplerde 8)', detail: 'Oyuncuların çoğu sadece ilk 2–3 görsele bakıp karar veriyor.', fix: ['En heyecanlı oyun anını ilk görsele koy, üstüne 3–5 kelimelik büyük yazı ekle.', 'Toplam 6–8 görsel.'] },
    { id: 'no-video', severity: 'warn', title: "Tanıtım videosu yok (rakiplerin %67'sinde var)", detail: 'Video ekranın en üstünde oynar.', fix: ['15–30 saniyelik oyun içi kayıt yap.'] },
  ],
  suggestions: { titles: ['Salgın: Zombi Hayatta Kalma', 'Salgın: Zombi Şehri'], shorts: ['Zombilerle dolu şehirde hayatta kal, üssünü kur, ekibini büyüt!'], intro: 'Şehir düştü. Elinde sadece bir sırt çantası ve birkaç dost var…' },
}

export const copy = (text: string, toast: (t: string) => void) => navigator.clipboard.writeText(text).then(() => toast('Panoya kopyalandı'))

export default function AsoCoach({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { toast } = useStore()
  const { me } = usePeople()
  const [report, reloadReport] = useSettingRow<AsoReport>(`aso:${gameId}`, demoReport)
  const [notes, reloadNotes] = useSettingRow<Notes>(`whatsnew:${gameId}`, null)
  const [queue, reloadQueue] = useSettingRow<{ items: QueueItem[] }>('expert_queue', { items: [] })
  const [bullets, setBullets] = useState('')
  const waiting = (kind: QueueItem['kind']) => queue?.items?.some((i) => i.kind === kind && i.gameId === gameId)
  const busy = waiting('aso') || waiting('notes')

  // İş sıradayken 20 saniyede bir sonuca bak
  useEffect(() => {
    if (!busy || isDemo) return
    const t = setInterval(() => (reloadQueue(), reloadReport(), reloadNotes()), 20000)
    return () => clearInterval(t)
  }, [busy, reloadQueue, reloadReport, reloadNotes])

  async function request(kind: QueueItem['kind'], extra: Partial<QueueItem> = {}) {
    if (isDemo) return toast('Demo modda çalışmaz', 'info')
    const { error, started } = await enqueue({ kind, gameId, by: me.email, ...extra })
    if (error) return toast('İstenemedi: ' + error, 'warn')
    await reloadQueue()
    toast(started ? 'Uzman başladı; birkaç dakikada hazır olur, telefonuna haber gelir.' : 'Sıraya alındı; uzman en geç 15 dakikada başlar.')
  }

  const r = report && !report.error ? report : null
  const med = (k: 'screenshots' | 'descLength') => {
    const v = (r?.rivals ?? []).map((x) => x[k]).sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section className="card">
        <div className="card-head wrap">
          <div>
            <div className="card-title">{gameName} · Play mağaza sayfası</div>
            <div className="card-sub">{r ? `Son inceleme ${trDateTime(r.at)} · "${r.query}" aramasındaki ilk ${r.rivals?.length ?? 0} oyunla karşılaştırıldı` : 'Sayfanı Play\'den okur (değiştirmez), aynı türün en çok indirilen oyunlarıyla karşılaştırır.'}</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => request('aso')} disabled={waiting('aso')}>
            {waiting('aso') ? <><Loader2 size={14} className="spin" /> İnceleniyor…</> : <><Search size={14} /> {r ? 'Yeniden incele' : 'Sayfamı incele'}</>}
          </button>
        </div>
        {report?.error && <div className="expert-error">İncelenemedi: {report.error}</div>}
        {r?.listing && r.images && (
          <div className="aso-compare">
            <div><span>Başlık</span><b>{r.listing.title.length}/30</b><small>{r.listing.title}</small></div>
            <div><span>Kısa açıklama</span><b>{r.listing.short.length}/80</b><small>{r.listing.short}</small></div>
            <div><span>Uzun açıklama</span><b>{r.listing.fullLength}</b><small>{med('descLength') != null ? `rakiplerde ~${med('descLength')}` : 'karakter'}</small></div>
            <div><span><ImageIcon size={11} /> Ekran görüntüsü</span><b>{r.images.phone}</b><small>{med('screenshots') != null ? `rakiplerde ~${med('screenshots')} (tüm cihazlar)` : 'telefon'}</small></div>
            <div><span><Film size={11} /> Video</span><b>{r.listing.video ? 'Var' : 'Yok'}</b><small>{r.rivals?.length ? `${r.rivals.filter((x) => x.video).length}/${r.rivals.length} rakipte var` : ''}</small></div>
            <div><span>Diller</span><b>{r.languages?.length ?? 0}</b><small>{r.languages?.join(', ')}</small></div>
          </div>
        )}
      </section>

      {r?.findings && r.findings.length > 0 && (
        <section className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Ne yapmalısın</div>
          <div className="findings">{r.findings.map((f) => <FindingRow key={f.id} f={f} />)}</div>
        </section>
      )}
      {r?.findings && r.findings.length === 0 && <div className="card up small">✓ Sayfan Play'in önerdiği her şeyi karşılıyor.</div>}

      {r?.suggestions && (
        <section className="card">
          <div className="card-title flex" style={{ gap: 8, marginBottom: 4 }}><Sparkles size={15} /> Kendi modelinin önerileri</div>
          <div className="card-sub" style={{ marginBottom: 12 }}>Beğendiğini kopyalayıp Play Console › Mağazada varlık › Ana mağaza girişi'ne yapıştır. Oyunda olmayan bir şey yazdıysa düzelt.</div>
          {[['Başlık', r.suggestions.titles], ['Kısa açıklama', r.suggestions.shorts]].map(([label, list]) => (list as string[]).length > 0 && (
            <div key={label as string} style={{ marginBottom: 12 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>{label as string}</div>
              {(list as string[]).map((s) => (
                <div key={s} className="aso-sugg"><span className="grow">{s}</span><small className="muted">{s.length}</small><button type="button" className="icon-btn" onClick={() => copy(s, toast)} aria-label="Kopyala"><Copy size={13} /></button></div>
              ))}
            </div>
          ))}
          {r.suggestions.intro && (
            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>Uzun açıklamanın girişi</div>
              <div className="aso-sugg"><span className="grow">{r.suggestions.intro}</span><button type="button" className="icon-btn" onClick={() => copy(r.suggestions!.intro!, toast)} aria-label="Kopyala"><Copy size={13} /></button></div>
            </div>
          )}
        </section>
      )}

      {r?.rivals && r.rivals.length > 0 && (
        <section className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Rakipler ne yapıyor</div>
          {r.rivals.map((x) => (
            <div key={x.pkg} className="row">
              <a className="grow linkish" href={`https://play.google.com/store/apps/details?id=${x.pkg}`} target="_blank" rel="noreferrer">{x.title}</a>
              <span className="muted small">{x.installsLabel ?? '—'}</span>
              <span className="badge">{x.screenshots} görsel</span>
              <span className={`badge ${x.video ? 'b-ok' : ''}`}>{x.video ? 'Video var' : 'Video yok'}</span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card-title flex" style={{ gap: 8, marginBottom: 4 }}><PenLine size={15} /> Sürüm notu yaz</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>Bu sürümde neler değişti, kendi kelimelerinle madde madde yaz. Model Türkçe ve İngilizce "Yenilikler" metni çıkarır (en fazla 500 karakter).</div>
        <textarea className="input" rows={4} value={bullets} onChange={(e) => setBullets(e.target.value)} placeholder={'- 10 yeni bölüm\n- Reklamlar daha az sıklıkta\n- Çökme düzeltildi'} />
        <div className="flex" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn" disabled={!bullets.trim() || waiting('notes')} onClick={() => request('notes', { bullets })}>
            {waiting('notes') ? <><Loader2 size={14} className="spin" /> Yazılıyor…</> : <><Sparkles size={14} /> Yaz</>}
          </button>
        </div>
        {notes?.error && <div className="expert-error">Yazılamadı: {notes.error}</div>}
        {notes?.tr && (
          <div className="aso-notes">
            {[['Türkçe', notes.tr], ['English', notes.en]].filter(([, t]) => t).map(([l, t]) => (
              <div key={l as string}>
                <div className="flex between"><span className="small muted">{l}{!notes.ai && ' · model çalışmadı, maddelerin aynen'}</span><button type="button" className="icon-btn" onClick={() => copy(t as string, toast)} aria-label="Kopyala"><Copy size={13} /></button></div>
                <pre>{t}</pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
