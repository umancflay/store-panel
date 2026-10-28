import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, CornerDownLeft, Gamepad2, ListTodo, NotebookPen, Plus, Search } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { logActivity } from '../lib/files'
import { demoNotes, demoTasks } from '../data/demo'
import { taskCode } from '../lib/types'
import { navGroups } from './Layout'
import { GameLogo } from './ui'
import { triggerWorkflow } from '../lib/trigger'

// Hızlı arama (Ctrl+K ya da üstteki büyüteç): sayfalar, oyunlar, görevler, notlar.
// Yazdığın şeyle doğrudan "yeni görev aç" ya da "Claude'a sor" da yapılır.

interface Item {
  key: string
  group: string
  label: string
  sub?: string
  icon: React.ReactNode
  run: () => void | Promise<void>
}

const norm = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { games } = useData()
  const { me } = usePeople()
  const { toast } = useStore()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [tasks, setTasks] = useState<{ id: number; title: string; status: string }[]>([])
  const [notes, setNotes] = useState<{ id: number; title: string; folder: string }[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  // Açılınca görev ve not başlıklarını tazele
  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(0)
    setTimeout(() => input.current?.focus(), 10)
    if (isDemo) {
      setTasks(demoTasks)
      setNotes(demoNotes)
      return
    }
    supabase!.from('tasks').select('id,title,status').neq('status', 'done').order('created_at', { ascending: false }).limit(200).then(({ data }) => setTasks(data ?? []))
    supabase!.from('notes').select('id,title,folder').order('updated_at', { ascending: false }).limit(200).then(({ data }) => setNotes(data ?? []))
  }, [open])

  const go = (to: string) => () => {
    onClose()
    nav(to)
  }

  const items = useMemo<Item[]>(() => {
    const text = q.trim()
    const words = norm(text).split(/\s+/).filter(Boolean)
    const hit = (...fields: (string | undefined)[]) => words.every((w) => fields.some((f) => f && norm(f).includes(w)))
    const out: Item[] = []

    for (const n of navGroups.flatMap((g) => g.items)) {
      if (!words.length || hit(n.label, n.hint)) out.push({ key: 'p' + n.to, group: 'Sayfalar', label: n.label, sub: n.hint, icon: <n.icon size={15} />, run: go(n.to) })
    }
    if (words.length) {
      for (const g of games) if (hit(g.name, g.genre)) out.push({ key: 'g' + g.id, group: 'Oyunlar', label: g.name, sub: g.genre, icon: <GameLogo id={g.id} size={20} />, run: go('/oyunlar/' + g.id) })
      for (const t of tasks) if (hit(t.title, taskCode(t.id))) out.push({ key: 't' + t.id, group: 'Görevler', label: t.title, sub: taskCode(t.id), icon: <ListTodo size={15} />, run: go(`/gorevler?id=${t.id}`) })
      for (const n of notes) if (hit(n.title, n.folder)) out.push({ key: 'n' + n.id, group: 'Notlar', label: n.title, sub: n.folder, icon: <NotebookPen size={15} />, run: go(`/notlar?id=${n.id}`) })
    }
    if (text) {
      out.push({
        key: 'new-task', group: 'Yap', label: `Yeni görev: "${text}"`, sub: 'Sana atanır', icon: <Plus size={15} />,
        run: async () => {
          onClose()
          if (isDemo) return toast('Demo modda kaydedilmez', 'info')
          const { data, error } = await supabase!.from('tasks').insert({
            title: text, status: 'open', level: 'medium', assignee: me.email, created_by: me.email, tags: [], subtasks: [],
            history: [{ what: 'Hızlı aramadan eklendi', at: new Date().toISOString() }],
          } as never).select('id').single()
          if (error) return toast('Eklenemedi: ' + error.message, 'warn')
          const id = (data as { id: number }).id
          logActivity(me.email, `${taskCode(id)} ${text} görevini açtı`, `/gorevler?id=${id}`).catch(() => {})
          toast('Görev eklendi')
        },
      })
      out.push({
        key: 'ask', group: 'Yap', label: `Claude'a sor: "${text}"`, sub: 'Cevap 10-15 dakikada, telefonuna bildirim', icon: <Bot size={15} />,
        run: async () => {
          onClose()
          if (!isDemo) {
            const { error } = await supabase!.from('assistant_questions').insert({ question: text, status: 'pending', asked_by: me.email } as never)
            if (error) return toast('Sorulamadı: ' + error.message, 'warn')
            triggerWorkflow('assistant.yml')
          }
          nav('/asistan')
        },
      })
    }
    return out.slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, games, tasks, notes, me.email])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, items.length - 1)))
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
    else if (e.key === 'Enter' && items[active]) (e.preventDefault(), items[active].run())
  }

  let lastGroup = ''
  return (
    <div className="cmdk-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-label="Hızlı arama" onKeyDown={onKey}>
        <div className="cmdk-input">
          <Search size={16} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sayfa, oyun, görev ara… ya da yaz ve görev aç / Claude'a sor" aria-label="Ara" />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-list" ref={list} role="listbox">
          {items.length === 0 && <div className="empty" style={{ padding: 20 }}>Bir şey bulunamadı.</div>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.key}>
                {head && <div className="cmdk-group">{head === 'Oyunlar' ? <><Gamepad2 size={11} /> {head}</> : head}</div>}
                <div
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  className="cmdk-item"
                  onMouseMove={() => setActive(i)}
                  onClick={() => it.run()}
                >
                  <span className="cmdk-icon">{it.icon}</span>
                  <span className="grow">{it.label}{it.sub && <span className="muted"> · {it.sub}</span>}</span>
                  {i === active && <CornerDownLeft size={13} className="muted" />}
                </div>
              </div>
            )
          })}
        </div>
        <div className="cmdk-foot muted">↑ ↓ seç · Enter aç · Ctrl+K her yerden açar</div>
      </div>
    </div>
  )
}
