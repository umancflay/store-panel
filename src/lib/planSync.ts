import { today } from './rows'
import type { PlanNode } from './types'

// Bir plan adımı bitince: tüm bağımlılıkları biten bekleyen adımları başlatır.
// Hem Plan sayfası hem Görevler sayfası (plana bağlı görev bitince) kullanır.
export async function finishNode(nodes: PlanNode[], id: number, update: (id: number, p: Partial<PlanNode>) => Promise<void>) {
  const node = nodes.find((n) => n.id === id)
  if (!node) return []
  if (node.status !== 'done') await update(id, { status: 'done' })
  const all = nodes.map((x) => (x.id === id ? { ...x, status: 'done' as const } : x))
  const ready = all.filter(
    (x) => x.plan_id === node.plan_id && x.status === 'wait' && x.depends_on.includes(id) && x.depends_on.every((d) => all.find((y) => y.id === d)?.status === 'done'),
  )
  for (const r of ready) await update(r.id, { status: 'active', start_date: today() })
  return ready.map((r) => r.title)
}
