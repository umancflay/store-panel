// SADECE DEMO MOD için örnek görev/not/plan verileri (Supabase bağlı değilken).
// Gerçek modda bu dosya kullanılmaz; panel yalnızca veritabanındaki gerçek kayıtları gösterir.

import type { AssistantQuestion, Automation, CalEvent, Decision, Message, Note, Person, Plan, PlanNode, Task } from '../lib/types'
import { addDays, today } from '../lib/rows'

const t = today()
const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString()
export const DEMO_ME = 'umut@studio.com'
export const DEMO_PARTNER = 'ortak@studio.com'

export const demoPeople: Person[] = [
  { email: DEMO_ME, name: 'Umut', role: 'Stüdyo sahibi' },
  { email: DEMO_PARTNER, name: 'Ortak', role: 'Sanat ve tasarım' },
]

const task = (id: number, p: Partial<Task>): Task => ({
  id, title: '', status: 'open', level: 'medium', game_id: null, assignee: DEMO_ME, due_date: null, tags: [], subtasks: [], notes: null,
  advice: null, source: null, plan_node_id: null, history: [], created_by: DEMO_ME, created_at: ago(3), ...p,
})

export const demoTasks: Task[] = [
  task(104, { title: 'Veri güvenliği formunu SDK’larla eşle', level: 'critical', game_id: 'salgin', due_date: addDays(t, 12), tags: ['Politika'],
    subtasks: [{ title: 'Formu aç', done: false }, { title: 'Reklam kimliğini işaretle', done: false }],
    advice: 'Play Console › Uygulama içeriği › Veri güvenliği bölümünde "Cihaz veya diğer kimlikler" maddesini işaretle.', history: [{ what: 'Play mailinden oluşturuldu', at: ago(2) }] }),
  task(108, { title: 'Hedef API seviyesini güncelle', level: 'low', due_date: addDays(t, 45), tags: ['Unity'], subtasks: [{ title: 'Salgın', done: false }, { title: 'Taşınma Kaosu', done: false }, { title: 'Dropshipping', done: false }] }),
  task(101, { title: '1.0.4 açılış çökmesini düzelt', status: 'doing', level: 'critical', game_id: 'tasinma-kaosu', due_date: t, tags: ['Hata'],
    subtasks: [{ title: 'Hatayı tekrarla', done: true }, { title: 'Kayıt okuma kodunu düzelt', done: false }, { title: '1.0.5 yükle', done: false }],
    advice: 'Çökmeler ilk sahne yüklenirken oluyor. 1.0.3’e göre değişen kayıt dosyası okuma kodunu kontrol et.', history: [{ what: 'Otomasyon açtı (çökme > %2)', at: ago(3) }] }),
  task(105, { title: 'TR için ikinci reklam ağı ekle', status: 'doing', game_id: 'salgin', due_date: addDays(t, 7), tags: ['AdMob'], assignee: DEMO_PARTNER }),
  task(99, { title: 'Mağaza ekran görüntülerini yenile', status: 'done', level: 'low', game_id: 'dropshipping', tags: ['Mağaza'] }),
]

export const demoNotes: Note[] = [
  { id: 1, title: 'Salgın 1.1 tasarım dokümanı', folder: 'Salgın', tag: 'Plan', created_by: DEMO_ME, created_at: ago(1), updated_at: ago(1),
    body: '[x] Yeni bölüm: Salgın koğuşu\n- Karantina odası, 3 yeni hasta tipi\n- Hasta yoğunluğu 7. günde artar\n[ ] Hastane genişletme\n- İkinci kat açılıyor (seviye 12)\n- Kayıt dosyası uyumluluğunu test et\n[ ] Mağaza ve reklam\n- 6 yeni ekran görüntüsü' },
  { id: 2, title: 'Taşınma Kaosu 1.0.5 yama notları', folder: 'Taşınma Kaosu', tag: 'Acil', created_by: DEMO_ME, created_at: ago(1), updated_at: ago(1),
    body: '[x] Düzeltmeler\n- Açılışta oluşan çökme giderildi\n[ ] İyileştirmeler\n- Yükleme süresi kısaldı' },
  { id: 3, title: 'Yeni oyun fikirleri', folder: 'Fikirler', tag: 'Fikir', created_by: DEMO_PARTNER, created_at: ago(20), updated_at: ago(20),
    body: '[ ] Kafe yönetimi\n- Salgın’ın sistemlerini yeniden kullan\n[ ] Kargo şirketi tycoon' },
]

export const demoPlans: Plan[] = [
  { id: 1, name: 'Salgın 1.1', target_date: addDays(t, 38), game_id: 'salgin' },
  { id: 2, name: 'Taşınma Kaosu 1.0.5', target_date: addDays(t, 3), game_id: 'tasinma-kaosu' },
]

const node = (id: number, p: Partial<PlanNode>): PlanNode => ({ id, plan_id: 1, title: '', sub: null, status: 'wait', assignee: DEMO_ME, start_date: t, duration_days: 2, depends_on: [], ...p })
export const demoNodes: PlanNode[] = [
  node(1, { title: 'Yeni bölüm tasarımı', sub: 'Tasarım dokümanı', status: 'done', start_date: addDays(t, -6), duration_days: 3 }),
  node(2, { title: '12 yeni oda sanatı', sub: 'Sanat', status: 'active', assignee: DEMO_PARTNER, start_date: addDays(t, -4), duration_days: 8 }),
  node(3, { title: 'Hastane genişletme kodu', sub: 'Unity · kod', status: 'active', start_date: addDays(t, -3), duration_days: 6, depends_on: [1] }),
  node(4, { title: 'Mağaza görselleri', sub: 'Ekran görüntüsü + video', assignee: DEMO_PARTNER, start_date: addDays(t, 5), duration_days: 4, depends_on: [2] }),
  node(5, { title: 'Reklam kreatifleri', sub: '3 video', assignee: 'assistant', start_date: addDays(t, 9), duration_days: 3, depends_on: [4] }),
  node(6, { title: 'İç test', sub: '20 test oyuncusu', start_date: addDays(t, 8), duration_days: 4, depends_on: [3] }),
  node(7, { title: 'Yayın', sub: 'Play + App Store', start_date: addDays(t, 14), duration_days: 1, depends_on: [5, 6] }),
  node(8, { plan_id: 2, title: 'Çökmeyi düzelt', status: 'active', start_date: addDays(t, -1), duration_days: 2 }),
  node(9, { plan_id: 2, title: 'Yama notu', assignee: 'assistant', start_date: addDays(t, 1), duration_days: 1, depends_on: [8] }),
]

export const demoEvents: CalEvent[] = [
  { id: 1, date: addDays(t, 5), title: 'Cadılar Bayramı etkinliği', kind: 'event', game_id: 'salgin', note: null },
  { id: 2, date: addDays(t, -4), title: 'TR test kampanyası', kind: 'ad', game_id: 'salgin', note: null },
]

export const demoAutomations: Automation[] = [
  { id: 1, name: 'Çökme oranı Google eşiğini aşarsa', enabled: true, trigger: 'crash_rate', threshold: 1.09, actions: ['task', 'notify'], runs: 12, last_run_at: ago(1) },
  { id: 2, name: 'App Store sürümü reddedilirse', enabled: true, trigger: 'rejected', threshold: null, actions: ['task', 'notify'], runs: 3, last_run_at: ago(5) },
  { id: 3, name: 'Mağaza puanı 4,0 altına düşerse', enabled: true, trigger: 'rating', threshold: 4, actions: ['task'], runs: 1, last_run_at: ago(9) },
  { id: 4, name: 'Fill rate %85 altına düşerse', enabled: false, trigger: 'fill_rate', threshold: 85, actions: ['summary'], runs: 0, last_run_at: null },
]

export const demoMessages: Message[] = [
  { id: 1, channel: 'plan', author: DEMO_PARTNER, text: 'Oda sanatlarının 9’u bitti, kalan 3 tanesi pazartesi.', created_at: ago(0.2) },
  { id: 2, channel: 'plan', author: DEMO_ME, text: 'Süper. Mağaza görsellerine geçmeden önce asansör sahnesine bakar mısın?', created_at: ago(0.15) },
]

export const demoDecisions: Decision[] = [
  { id: 1, question: 'Salgın 1.1’de reklamsız sürüm ($2,99) de çıksın mı?', votes: { [DEMO_ME]: 'yes', [DEMO_PARTNER]: 'thinking' }, status: 'open', created_by: DEMO_ME, created_at: ago(1) },
]

export const demoQuestions: AssistantQuestion[] = []
