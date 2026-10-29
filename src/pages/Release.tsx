import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Check, ChevronDown, Package, Plus, Rocket, Trash2 } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, today, trDate } from '../lib/rows'
import { logActivity } from '../lib/files'
import { demoReleases, demoTasks } from '../data/demo'
import { ASSISTANT, taskCode, type Release, type ReleaseCheck, type ReleaseStatus, type Task } from '../lib/types'
import { platformLabel } from '../lib/format'
import { GameLogo, Modal, Seg } from '../components/ui'
import Select from '../components/Select'
import { triggerWorkflow } from '../lib/trigger'

// Sürüm çıkarma yardımcısı: her yeni sürüm için mağaza kontrol listesi, durum ve Claude'a yazdırılan sürüm notları.
// Hiçbir şey mağazaya gönderilmez; liste sizin işaretlemeniz içindir.

const statusLabel: Record<ReleaseStatus, string> = { prep: 'Hazırlık', review: 'İncelemede', live: 'Yayında' }

// Kontrol listesi şablonu: Unity mobil oyun için Play / App Store adımları
function template(platform: Release['platform']): ReleaseCheck[] {
  const android = platform !== 'ios'
  const ios = platform !== 'android'
  const rows: [string, string, boolean][] = [
    ['Build', 'Sürüm numarası ve build numarası artırıldı', true],
    ['Build', 'Hedef API seviyesi Google\'ın istediği seviyede', android],
    ['Build', 'İmzalı AAB alındı (Play)', android],
    ['Build', 'Xcode arşivi yüklendi, TestFlight\'ta görünüyor', ios],
    ['Build', 'En az iki gerçek cihazda baştan sona oynandı', true],
    ['Build', 'Kayıt dosyası eski sürümden sorunsuz açılıyor', true],
    ['Reklam', 'Test reklam kimlikleri kapalı, gerçek reklam birimleri açık', true],
    ['Reklam', 'app-ads.txt güncel', true],
    ['Mağaza', 'Sürüm notları ("Yenilikler") yazıldı', true],
    ['Mağaza', 'Ekran görüntüleri ve tanıtım görseli güncel', true],
    ['Mağaza', 'Veri güvenliği formu yeni SDK\'larla uyumlu', android],
    ['Mağaza', 'App Privacy (gizlilik etiketleri) güncel', ios],
    ['Mağaza', 'İçerik derecelendirmesi değişmediyse dokunulmadı, değiştiyse yenilendi', true],
    ['Yayın', 'Önce kademeli yayın (%10-20) seçildi', android],
    ['Yayın', 'İlk 48 saat çökme oranı ve yorumlar takip edildi', true],
  ]
  return rows.filter((r) => r[2]).map(([group, title], i) => ({ id: `c${i}`, group, title, done: false }))
}

export default function ReleasePage() {
  const { games, builds } = useData()
  const { me, nameOf } = usePeople()
  const { toast } = useStore()
  const rel = useRows<Release>('releases', demoReleases, { order: 'created_at', ascending: false })
  const tasks = useRows<Task>('tasks', demoTasks)
  const [open, setOpen] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ game_id: games[0]?.id ?? '', platform: 'android' as Release['platform'], version: '', target_date: '', changes: '' })
  const [sure, setSure] = useState<number | null>(null)

  const list = rel.rows.map((r) => ({ ...r, checklist: r.checklist?.length ? r.checklist : template(r.platform) }))
  const active = list.filter((r) => r.status !== 'live')
  const done = list.filter((r) => r.status === 'live')
  const shown = open ?? active[0]?.id ?? null

  async function save(r: Release, patch: Partial<Release>) {
    try {
      await rel.update(r.id, { ...patch, updated_at: new Date().toISOString() })
    } catch (err) {
      toast('Kaydedilemedi: ' + (err as Error).message, 'warn')
    }
  }

  async function create() {
    if (!draft.game_id || !draft.version.trim()) return toast('Oyun ve sürüm numarası gerekli', 'warn')
    try {
      const row = await rel.insert({
        game_id: draft.game_id, platform: draft.platform, version: draft.version.trim(), status: 'prep',
        target_date: draft.target_date || null, changes: draft.changes.trim() || null, checklist: template(draft.platform),
        task_id: null, created_by: me.email, updated_at: new Date().toISOString(),
      })
      logActivity(me.email, `${games.find((g) => g.id === row.game_id)?.name ?? ''} ${row.version} sürüm hazırlığını başlattı`, '/surum').catch(() => {})
      setAdding(false)
      setOpen(row.id)
      setDraft({ ...draft, version: '', target_date: '', changes: '' })
      toast('Sürüm eklendi; kontrol listesi hazır')
    } catch (err) {
      toast('Eklenemedi: ' + (err as Error).message, 'warn')
    }
  }

  // Claude'a görev: "Yenilikler" metnini oyuncuların dillerinde yazsın (Asistan işi 10 dk içinde yapar)
  async function askNotes(r: Release) {
    if (!r.changes?.trim()) return toast('Önce "Bu sürümde ne değişti" kısmını doldur', 'warn')
    const game = games.find((g) => g.id === r.game_id)?.name ?? 'Oyun'
    try {
      const t = await tasks.insert({
        title: `${game} ${r.version} sürüm notları`,
        status: 'open', level: 'medium', game_id: r.game_id, assignee: ASSISTANT, created_by: me.email, tags: ['Sürüm'], subtasks: [],
        notes: `Bu sürümde değişenler:\n${r.changes}\n\nİstenen: ${platformLabel(r.platform === 'ios' ? 'ios' : 'android')}${r.platform === 'both' ? ' ve iOS' : ''} mağazası için "Yenilikler" metni, her dil için en fazla 500 karakter. Türkçe ve İngilizce mutlaka; oyuncuların en çok konuştuğu diğer dilleri de ekle. Oyuncuya hitap eden, kısa ve heyecanlı olsun.`,
        history: [{ what: 'Sürüm yardımcısından Claude\'a verildi', at: new Date().toISOString() }],
      })
      await save(r, { task_id: t.id })
      triggerWorkflow('assistant.yml')
      toast('Claude yazıyor; 10-15 dakika içinde görevde, telefonuna bildirim gelir', 'info')
    } catch (err) {
      toast('Verilemedi: ' + (err as Error).message, 'warn')
    }
  }

  async function remove(r: Release) {
    if (sure !== r.id) return setSure(r.id)
    try {
      await rel.remove(r.id)
      setSure(null)
      toast('Sürüm silindi', 'info')
    } catch (err) {
      toast('Silinemedi: ' + (err as Error).message, 'warn')
    }
  }

  const card = (r: Release) => {
    const g = games.find((x) => x.id === r.game_id)
    const total = r.checklist.length
    const ok = r.checklist.filter((c) => c.done).length
    const pctDone = total ? Math.round((ok / total) * 100) : 0
    const isOpen = shown === r.id
    const groups = [...new Set(r.checklist.map((c) => c.group))]
    const store = builds.filter((b) => b.gameId === r.game_id && (r.platform === 'both' || b.platform === r.platform))
    const notesTask = r.task_id ? tasks.rows.find((t) => t.id === r.task_id) : null
    const notesReady = notesTask && notesTask.assignee !== ASSISTANT
    const late = r.target_date && r.target_date < today() && r.status === 'prep'

    return (
      <section key={r.id} className={`card release${isOpen ? ' open' : ''}`}>
        <button type="button" className="release-head" onClick={() => setOpen(isOpen ? -1 : r.id)} aria-expanded={isOpen}>
          {r.game_id && <GameLogo id={r.game_id} size={40} />}
          <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
            <div className="card-title">{g?.name ?? 'Oyun'} <span className="muted">v{r.version}</span></div>
            <div className="card-sub">
              {r.platform === 'both' ? 'Android ve iOS' : platformLabel(r.platform)}
              {r.target_date && <> · <span style={{ color: late ? 'var(--orange)' : undefined }}>hedef {trDate(r.target_date)}{late ? ' (geçti)' : ''}</span></>}
              {store.map((b) => <span key={b.platform}> · mağazada v{b.version} {b.status}</span>)}
            </div>
          </div>
          <div className="release-progress" title={`${ok}/${total} tamam`}>
            <svg viewBox="0 0 36 36" aria-hidden>
              <circle cx="18" cy="18" r="15.5" className="rp-bg" />
              <circle cx="18" cy="18" r="15.5" className="rp-fg" strokeDasharray={`${pctDone * 0.974} 100`} />
            </svg>
            <span>%{pctDone}</span>
          </div>
          <span className={`badge ${r.status === 'live' ? 'b-ok' : r.status === 'review' ? 'b-warning' : 'b-muted'}`}>{statusLabel[r.status]}</span>
          <ChevronDown size={16} className="release-chev" aria-hidden />
        </button>

        {isOpen && (
          <div className="release-body">
            <div>
              {groups.map((gr) => (
                <div key={gr} className="release-group">
                  <div className="muted small" style={{ marginBottom: 4 }}>{gr}</div>
                  {r.checklist.filter((c) => c.group === gr).map((c) => (
                    <label key={c.id} className={`check-row${c.done ? ' done' : ''}`}>
                      <input
                        type="checkbox"
                        checked={c.done}
                        onChange={() => save(r, { checklist: r.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}
                      />
                      <span className="check-box" aria-hidden><Check size={11} /></span>
                      <span>{c.title}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="release-side">
              <div className="field">
                <label>Durum</label>
                <Seg value={r.status} onChange={(v) => save(r, { status: v })} options={[{ value: 'prep', label: 'Hazırlık' }, { value: 'review', label: 'İncelemede' }, { value: 'live', label: 'Yayında' }]} />
              </div>
              <div className="field">
                <label htmlFor={`ch-${r.id}`}>Bu sürümde ne değişti</label>
                <textarea
                  id={`ch-${r.id}`}
                  className="textarea"
                  rows={5}
                  defaultValue={r.changes ?? ''}
                  placeholder="Yeni bölüm, düzeltilen hatalar, yeni özellikler… (kısa maddeler yeter)"
                  onBlur={(e) => e.target.value !== (r.changes ?? '') && save(r, { changes: e.target.value })}
                />
              </div>
              <div className="release-claude">
                <div className="flex" style={{ gap: 8 }}><span className="avatar ai sm">AI</span><b className="small">Sürüm notları</b></div>
                {!notesTask ? (
                  <>
                    <p className="muted small">Claude değişikliklerden "Yenilikler" metnini oyuncularınızın en çok konuştuğu dillerde yazar.</p>
                    <button type="button" className="btn sm btn-green" onClick={() => askNotes(r)}><Bot size={13} /> Claude'a yazdır</button>
                  </>
                ) : (
                  <p className="small" style={{ margin: 0 }}>
                    {notesReady ? '✓ Hazır. ' : 'Claude yazıyor… '}
                    <Link to={`/gorevler?id=${notesTask.id}`} className="up">{taskCode(notesTask.id)} görevini aç</Link>
                  </p>
                )}
              </div>
              <div className="flex between" style={{ marginTop: 12 }}>
                <span className="muted" style={{ fontSize: 11 }}>{nameOf(r.created_by)} başlattı</span>
                <button type="button" className={`btn sm ${sure === r.id ? 'btn-red' : 'btn-ghost'}`} onClick={() => remove(r)} onBlur={() => setSure(null)}>
                  <Trash2 size={12} /> {sure === r.id ? 'Emin misin? Sil' : 'Sil'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="flex between wrap" style={{ gap: 14 }}>
        <p className="muted small" style={{ maxWidth: 640 }}>Her sürüm için mağaza kontrol listesi. Adımları işaretle, sürüm notlarını Claude'a yazdır. Hiçbir şey mağazaya kendiliğinden gönderilmez.</p>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> Yeni sürüm</button>
      </div>

      {list.length === 0 && (
        <div className="card empty" style={{ padding: 28 }}>
          <Rocket size={28} style={{ opacity: 0.5, marginBottom: 8 }} />
          <div>Henüz sürüm yok. "Yeni sürüm"e bas: oyunu ve sürüm numarasını seç, kontrol listesi kendiliğinden gelir.</div>
        </div>
      )}
      {active.map(card)}
      {done.length > 0 && (
        <>
          <div className="muted small flex" style={{ gap: 6, marginTop: 6 }}><Package size={13} /> Yayınlananlar</div>
          {done.map(card)}
        </>
      )}

      {adding && (
        <Modal title="Yeni sürüm" onClose={() => setAdding(false)}>
          <div className="field">
            <label htmlFor="r-game">Oyun</label>
            <Select id="r-game" className="select" value={draft.game_id} onChange={(e) => setDraft({ ...draft, game_id: e.target.value })}>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div className="field">
            <label>Platform</label>
            <Seg value={draft.platform} onChange={(v) => setDraft({ ...draft, platform: v })} options={[{ value: 'android', label: 'Android' }, { value: 'ios', label: 'iOS' }, { value: 'both', label: 'İkisi' }]} />
          </div>
          <div className="grid g-2" style={{ gap: 10 }}>
            <div className="field">
              <label htmlFor="r-ver">Sürüm numarası</label>
              <input id="r-ver" className="input" value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} placeholder="ör. 1.1.0" />
            </div>
            <div className="field">
              <label htmlFor="r-date">Hedef tarih</label>
              <input id="r-date" type="date" className="input" value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="r-ch">Bu sürümde ne değişti (isteğe bağlı)</label>
            <textarea id="r-ch" className="textarea" rows={3} value={draft.changes} onChange={(e) => setDraft({ ...draft, changes: e.target.value })} placeholder="Yeni bölüm, düzeltilen hatalar…" />
          </div>
          <div className="flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Vazgeç</button>
            <button type="button" className="btn btn-primary" onClick={create} disabled={!draft.version.trim()}><Rocket size={14} /> Başlat</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
