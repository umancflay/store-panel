import { useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { useRows, trDateTime } from '../lib/rows'
import { logActivity } from '../lib/files'
import type { Comment } from '../lib/types'
import { initials } from './ui'

// Görev ya da notun altındaki konuşma; ortağın yazdığı canlı düşer
export default function Comments({ taskId, noteId, label }: { taskId?: number; noteId?: number; label: string }) {
  const filter: [string, number] = taskId ? ['task_id', taskId] : ['note_id', noteId!]
  const all = useRows<Comment>('comments', [], { order: 'created_at', filter })
  const rows = all.rows.filter((c) => (taskId ? c.task_id === taskId : c.note_id === noteId)).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const { me, nameOf } = usePeople()
  const { toast } = useStore()
  const [text, setText] = useState('')

  async function send() {
    const body = text.trim()
    if (!body) return
    setText('')
    try {
      await all.insert({ body, author: me.email, task_id: taskId ?? null, note_id: noteId ?? null, created_at: new Date().toISOString() })
      logActivity(me.email, `“${label}” için yorum yazdı: ${body.slice(0, 80)}`, taskId ? `/gorevler?id=${taskId}` : `/notlar?id=${noteId}`).catch(() => {})
    } catch (e) {
      setText(body)
      toast('Gönderilemedi: ' + (e as Error).message, 'warn')
    }
  }

  return (
    <div>
      <div className="card-sub flex" style={{ gap: 6, marginBottom: 8 }}>
        <MessageCircle size={12} /> Yorumlar {rows.length > 0 && <span className="chip">{rows.length}</span>}
      </div>
      <div className="cmts">
        {rows.map((c) => (
          <div key={c.id} className={`cmt ${c.author === me.email ? 'mine' : ''}`}>
            <span className="avatar sm">{initials(nameOf(c.author))}</span>
            <div className="cmt-body">
              <div className="cmt-head">
                <b>{nameOf(c.author)}</b>
                <span>{trDateTime(c.created_at)}</span>
                {c.author === me.email && (
                  <button type="button" className="linkish" aria-label="Yorumu sil" onClick={() => all.remove(c.id).catch((e) => toast('Silinemedi: ' + e.message, 'warn'))}><X size={10} /></button>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>
          </div>
        ))}
      </div>
      <form className="flex" style={{ gap: 6, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); send() }}>
        <textarea
          className="textarea"
          rows={1}
          style={{ minHeight: 34, fontSize: 12 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Yorum yaz (Enter gönderir)"
          aria-label="Yorum"
        />
        <button className="btn sm" type="submit" disabled={!text.trim()} aria-label="Gönder"><Send size={12} /></button>
      </form>
    </div>
  )
}
