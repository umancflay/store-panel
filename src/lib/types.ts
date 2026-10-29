// Panel özelliklerinin veritabanı satır tipleri (supabase/features.sql ile aynı)

export type TaskStatus = 'open' | 'doing' | 'done'
export type TaskLevel = 'critical' | 'medium' | 'low'

export interface Task {
  id: number
  title: string
  status: TaskStatus
  level: TaskLevel
  game_id: string | null
  assignee: string | null
  due_date: string | null
  tags: string[]
  subtasks: { title: string; done: boolean }[]
  notes: string | null
  advice: string | null
  source: string | null
  plan_node_id: number | null
  history: { what: string; at: string }[]
  created_by: string | null
  created_at: string
  updated_at?: string
}

export interface Note {
  id: number
  title: string
  folder: string
  tag: string | null
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FileRow {
  id: number
  name: string
  path: string
  size: number
  mime: string | null
  parts: number // 50 MB üstü dosyalar parçalı saklanır
  folder: string
  game_id: string | null
  task_id: number | null
  note_id: number | null
  uploaded_by: string | null
  created_at: string
}

export interface Comment {
  id: number
  task_id: number | null
  note_id: number | null
  body: string
  author: string | null
  created_at: string
}

export interface Activity {
  id: number
  who: string | null
  what: string
  link: string | null
  created_at: string
}

export interface Plan {
  id: number
  name: string
  target_date: string | null
  game_id: string | null
  created_at?: string
}

export type NodeStatus = 'wait' | 'active' | 'done'

export interface PlanNode {
  id: number
  plan_id: number
  title: string
  sub: string | null
  status: NodeStatus
  assignee: string | null
  start_date: string | null
  duration_days: number
  depends_on: number[]
}

export type EventKind = 'deadline' | 'release' | 'event' | 'ad'

export interface CalEvent {
  id: number
  date: string
  title: string
  kind: EventKind
  game_id: string | null
  note: string | null
}

export type Trigger = 'crash_rate' | 'anr_rate' | 'rating' | 'fill_rate' | 'policy_mail' | 'rejected' | 'bad_review' | 'weekly_report'

export interface Automation {
  id: number
  name: string
  enabled: boolean
  trigger: Trigger
  threshold: number | null
  actions: string[]
  runs: number
  last_run_at: string | null
}

export interface Message {
  id: number
  channel: string
  author: string
  text: string
  created_at: string
}

export interface Decision {
  id: number
  question: string
  votes: Record<string, 'yes' | 'no' | 'thinking'>
  status: 'open' | 'closed'
  created_by: string | null
  created_at: string
}

export interface AssistantQuestion {
  id: number
  question: string
  answer: string | null
  status: 'pending' | 'answered' | 'failed'
  asked_by: string | null
  created_at: string
}

export interface Person {
  email: string
  name: string
  role: string
}

export const ASSISTANT = 'assistant'
export const levelLabel: Record<TaskLevel, string> = { critical: 'Kritik', medium: 'Orta', low: 'Düşük' }
export const statusLabel: Record<TaskStatus, string> = { open: 'Açık', doing: 'Devam ediyor', done: 'Bitti' }
export const eventColor: Record<EventKind, string> = { deadline: '#FF7A55', release: '#8FD3AE', event: '#D9D9D9', ad: '#E8C07A' }
export const eventLabel: Record<EventKind, string> = { deadline: 'Son tarih', release: 'Sürüm', event: 'Etkinlik', ad: 'Reklam' }
export const taskCode = (id: number) => 'PG-' + String(id % 10000).padStart(4, '0')

// Claude'un haftalık iş bölümü önerisi (supabase/phase9-team.sql)
export interface WorkSuggestion {
  id: number
  kind: 'new_task' | 'assign'
  task_id: number | null
  title: string
  game_id: string | null
  level: TaskLevel
  assignee: string | null
  due_date: string | null
  why: string | null
  status: 'pending' | 'accepted' | 'dismissed'
  created_at: string
  decided_by?: string | null
  decided_at?: string | null
}

export interface WorkPlan {
  week_summary: string
  focus: { email: string; summary: string }[]
}

// Sürüm çıkarma yardımcısı (supabase/phase10-releases.sql)
export type ReleaseStatus = 'prep' | 'review' | 'live'
export interface ReleaseCheck {
  id: string
  group: string
  title: string
  done: boolean
}
export interface Release {
  id: number
  game_id: string | null
  platform: 'android' | 'ios' | 'both'
  version: string
  status: ReleaseStatus
  target_date: string | null
  changes: string | null
  checklist: ReleaseCheck[]
  task_id: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Yayın Uzmanı (supabase/phase11-expert.sql)
export type BuildStatus = 'uploaded' | 'inspecting' | 'blocked' | 'ready' | 'internal' | 'awaiting_approval' | 'publishing' | 'live' | 'failed'
export interface Finding {
  id: string
  severity: 'block' | 'warn' | 'info'
  title: string
  detail: string
  fix: string[]
  policy?: string
}
export interface StoreBuild {
  id: number
  game_id: string | null
  platform: 'android' | 'ios'
  file_id: number | null
  file_name: string | null
  package_name: string | null
  version_code: number | null
  version_name: string | null
  status: BuildStatus
  report: {
    verdict: 'blocked' | 'warnings' | 'clean'
    counts: { block: number; warn: number; info: number }
    findings: Finding[]
    text: string
    aiSummary?: boolean
    build?: { kind: string; targetSdk: number; minSdk: number; abis: string[]; sizeMb: number; hits: string[] }
  } | null
  summary: string | null
  error: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface ExpertAction {
  id: number
  build_id: number
  kind: 'publish_production' | 'increase_rollout' | 'halt'
  params: { userFraction?: number }
  status: 'pending' | 'approved' | 'rejected' | 'done' | 'failed'
  result: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}
export type DataSafety = Partial<Record<'ads' | 'ad_id' | 'device_id' | 'analytics' | 'crash_logs' | 'location' | 'personal', boolean>>
