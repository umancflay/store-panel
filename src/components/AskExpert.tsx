import { useEffect, useState } from 'react'
import { BookOpen, GraduationCap, Loader2, Send, Trash2 } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useData, usePeople } from '../lib/data'
import { trDateTime } from '../lib/rows'
import { enqueue, useSettingRow, type QueueItem } from '../lib/expertQueue'
import Select from './Select'

// Uzmana sor: stüdyonun kendi modeli yayın/mağaza sorularını kurallar, eşikler, Apple bilgi tabanı,
// öğrettiklerin ve oyunun son raporuyla cevaplar (birkaç dakika). Uzmana öğret: her ret ya da tecrübe
// bir ders olur; her build raporunda hatırlatılır ve sorulara cevap verirken kullanılır.

type Chat = { id: string; q: string; a: string; ai: boolean; gameId: string | null; by: string; at: string }
type Lesson = { id: string; text: string; platform: 'android' | 'ios' | 'all'; by: string; at: string }

const demoChat = { items: [{ id: '1', q: 'Salgın için Play hedef API kaç olmalı?', a: 'Şu an Google Play en az API 36 istiyor.\n\n1. Unity › Player Settings › Other Settings › Target API Level\'ı "Automatic (highest installed)" yap.\n2. Unity Hub\'dan Android SDK\'yı güncelle.\n3. Build\'i yeniden alıp Yayın Uzmanı\'na bırak; kontrol ederim.', ai: true, gameId: 'salgin', by: 'demo', at: new Date().toISOString() }] }
const demoLessons = { items: [{ id: 'l1', text: 'Play, oyun içi satın alma ürünlerinde ekran görüntüsü olmadığı için güncellemeyi reddetti. Her IAP ürününe görsel ekle.', platform: 'android' as const, by: 'demo', at: new Date().toISOString() }] }
const SUGGEST = ['Salgın neden reddedildi, ne yapmalıyım?', 'Yeni bir oyunu Play\'e ilk kez nasıl yüklerim?', 'Veri güvenliği formunu nasıl doldururum?', 'Mağaza sayfamı nasıl daha çok indirilir yaparım?']

export default function AskExpert() {
  const { toast } = useStore()
  const { me } = usePeople()
  const { games } = useData()
  const [chat, reloadChat] = useSettingRow<{ items: Chat[] }>('expert_chat', demoChat)
  const [lessons, reloadLessons] = useSettingRow<{ items: Lesson[] }>('expert_lessons', demoLessons)
  const [queue, reloadQueue] = useSettingRow<{ items: QueueItem[] }>('expert_queue', { items: [] })
  const [q, setQ] = useState('')
  const [gameId, setGameId] = useState('')
  const [lesson, setLesson] = useState('')
  const [platform, setPlatform] = useState<Lesson['platform']>('all')
  const waiting = (queue?.items ?? []).filter((i) => i.kind === 'ask')

  useEffect(() => {
    if (!waiting.length || isDemo) return
    const t = setInterval(() => (reloadQueue(), reloadChat()), 15000)
    return () => clearInterval(t)
  }, [waiting.length, reloadQueue, reloadChat])

  async function ask(text = q) {
    if (!text.trim()) return
    if (isDemo) return toast('Demo modda çalışmaz', 'info')
    const { error, started } = await enqueue({ kind: 'ask', gameId, text: text.trim(), by: me.email })
    if (error) return toast('Sorulamadı: ' + error, 'warn')
    setQ('')
    await reloadQueue()
    toast(started ? 'Uzman düşünüyor; birkaç dakikada cevap gelir, telefonuna da haber veririm.' : 'Sıraya alındı; uzman en geç 15 dakikada cevaplar.')
  }

  async function saveLessons(items: Lesson[]) {
    if (isDemo) return toast('Demo modda kaydedilmez', 'info')
    const { error } = await supabase!.from('app_settings').upsert({ key: 'expert_lessons', value: { items }, updated_at: new Date().toISOString() } as never)
    if (error) return toast('Kaydedilemedi: ' + error.message, 'warn')
    await reloadLessons()
  }
  async function teach() {
    if (!lesson.trim()) return
    await saveLessons([{ id: crypto.randomUUID(), text: lesson.trim(), platform, by: me.email, at: new Date().toISOString() }, ...(lessons?.items ?? [])])
    setLesson('')
    toast('Öğrendi: bundan sonra her build raporunda hatırlatır, sorularda dikkate alır')
  }

  return (
    <div className="ask-grid">
      <section className="card ask-chat">
        <div className="card-title flex" style={{ gap: 8 }}><BookOpen size={15} /> Uzmana sor</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>Yayın, Play/App Store kuralları, retler, mağaza sayfası… Kendi modelin cevaplar; bildiği kurallara, öğrettiklerine ve oyunun son raporuna bakar.</div>

        <form className="ask-form" onSubmit={(e) => (e.preventDefault(), ask())}>
          <textarea className="input" rows={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sorunu yaz… ör. Salgın'ı oyunculara açmadan önce neye bakmalıyım?" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask() }} />
          <div className="flex between wrap" style={{ gap: 8 }}>
            <Select className="select" style={{ width: 'auto' }} value={gameId} onChange={(e) => setGameId(e.target.value)} aria-label="Hangi oyun">
              <option value="">Genel soru</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <button type="submit" className="btn btn-primary" disabled={!q.trim()}><Send size={13} /> Sor</button>
          </div>
        </form>
        <div className="ask-suggest">
          {SUGGEST.map((s) => <button key={s} type="button" onClick={() => setQ(s)}>{s}</button>)}
        </div>

        {waiting.map((w) => (
          <div key={w.id} className="ask-item pending">
            <div className="ask-q">{w.text}</div>
            <div className="ask-a muted"><Loader2 size={13} className="spin" /> Uzman düşünüyor…</div>
          </div>
        ))}
        {(chat?.items ?? []).map((c) => (
          <div key={c.id} className="ask-item">
            <div className="ask-q">{c.q}<span className="muted"> · {c.gameId ? games.find((g) => g.id === c.gameId)?.name ?? c.gameId : 'genel'} · {trDateTime(c.at)}</span></div>
            <div className="ask-a"><span className="avatar ai sm">AI</span><p>{c.a}</p></div>
          </div>
        ))}
        {!chat?.items?.length && !waiting.length && <div className="muted small">Henüz soru yok. Yukarıdan bir şey sor ya da örneklerden birine tıkla.</div>}
      </section>

      <section className="card ask-teach">
        <div className="card-title flex" style={{ gap: 8 }}><GraduationCap size={15} /> Uzmana öğret</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>Bir ret aldın, bir şey öğrendin mi? Buraya yaz. Uzman bunu her build'de hatırlatır ve sorulara cevap verirken kullanır. Geliştire geliştire büyür.</div>
        <textarea className="input" rows={3} value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="ör. Apple 4.3 ile reddetti: aynı şablondan iki oyun vardı. Her oyunun ikonu ve adı belirgin farklı olmalı." />
        <div className="flex between wrap" style={{ gap: 8, marginTop: 8 }}>
          <div className="seg">
            {(['all', 'android', 'ios'] as const).map((p) => <button key={p} type="button" className={platform === p ? 'on' : ''} onClick={() => setPlatform(p)}>{p === 'all' ? 'Hepsi' : p === 'android' ? 'Android' : 'iOS'}</button>)}
          </div>
          <button type="button" className="btn btn-green" disabled={!lesson.trim()} onClick={teach}><GraduationCap size={13} /> Öğret</button>
        </div>
        <div className="lesson-list">
          {(lessons?.items ?? []).map((l) => (
            <div key={l.id} className="lesson">
              <span className={`plat ${l.platform === 'ios' ? 'ios' : 'android'}`}>{l.platform === 'all' ? 'Hepsi' : l.platform === 'ios' ? 'iOS' : 'Android'}</span>
              <span className="grow">{l.text}</span>
              <button type="button" className="icon-btn" aria-label="Dersi sil" title="Sil" onClick={() => saveLessons((lessons?.items ?? []).filter((x) => x.id !== l.id))}><Trash2 size={13} /></button>
            </div>
          ))}
          {!lessons?.items?.length && <div className="muted small">Henüz ders yok.</div>}
        </div>
        <div className="muted" style={{ fontSize: 10, marginTop: 10 }}>Uzmanın zaten bildikleri: Android'de 11, iOS'ta 10 kontrol, Apple'ın 17 ret kuralı, Google/Apple'ın güncel API/SDK eşikleri.</div>
      </section>
    </div>
  )
}
