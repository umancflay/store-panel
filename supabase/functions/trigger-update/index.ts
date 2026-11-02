// "Şimdi güncelle" butonu, Asistan ve Yayın Uzmanı bu fonksiyonu çağırır.
// Fonksiyon önce çağıranın admin olduğunu (MFA dahil) kontrol eder,
// sonra GitHub Actions'taki istenen işi başlatır (gövde: { workflow }, varsayılan veri toplama).
// GitHub token'ı sadece Supabase secrets'ta durur (GH_DISPATCH_TOKEN).
//
// Saatlik zamanlayıcı (supabase/phase13-hourly.sql, pg_cron): "x-cron-key" başlığıyla gelir. Anahtar veritabanında
// (app_settings.cron_key, sadece yöneticiler ve sunucu görür) durur; doğruysa ve son tetiklemeden 50 dakika geçtiyse
// veri toplama (hafif), Asistan ve Yayın Uzmanı işleri başlatılır. GitHub'ın kendi zamanlaması saatlerce gecikebiliyor.
import { createClient } from 'npm:@supabase/supabase-js@2'

// Sadece bu işler başlatılabilir; collect-data dışındakiler girdi almaz
const ALLOWED: Record<string, Record<string, string> | undefined> = {
  'collect-data.yml': { job: 'manual' },
  'assistant.yml': undefined,
  'expert.yml': undefined,
}
const CRON_JOBS: [string, Record<string, string> | undefined][] = [
  ['collect-data.yml', { job: 'policy_check' }],
  ['assistant.yml', undefined],
  ['expert.yml', undefined],
]
const CRON_GAP_MS = 50 * 60 * 1000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const repo = Deno.env.get('GH_REPO') // ör. kullaniciadi/store-panel
  const token = Deno.env.get('GH_DISPATCH_TOKEN')
  if (!repo || !token) return json({ error: 'GH_REPO veya GH_DISPATCH_TOKEN ayarlanmamış' }, 500)

  const dispatch = (workflow: string, inputs?: Record<string, string>) =>
    fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'store-panel',
      },
      body: JSON.stringify({ ref: 'main', ...(inputs ? { inputs } : {}) }),
    })

  // Saatlik zamanlayıcı
  const cronKey = req.headers.get('x-cron-key')
  if (cronKey) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: rows } = await admin.from('app_settings').select('key,value').in('key', ['cron_key', 'cron_tick'])
    const get = (k: string) => (rows ?? []).find((r) => r.key === k)?.value as Record<string, string> | undefined
    if (!get('cron_key')?.key || get('cron_key')!.key !== cronKey) return json({ error: 'Yetkisiz' }, 403)
    const last = get('cron_tick')?.at
    if (last && Date.now() - Date.parse(last) < CRON_GAP_MS) return json({ ok: true, skipped: 'erken' })
    await admin.from('app_settings').upsert({ key: 'cron_tick', value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() })
    const results = await Promise.all(CRON_JOBS.map(async ([w, i]) => [w, (await dispatch(w, i)).status]))
    return json({ ok: true, results })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: isAdmin, error } = await supabase.rpc('is_admin')
  if (error || !isAdmin) return json({ error: 'Yetkisiz' }, 403)

  const body = await req.json().catch(() => ({}))
  const workflow = typeof body?.workflow === 'string' ? body.workflow : 'collect-data.yml'
  if (!(workflow in ALLOWED)) return json({ error: 'Bilinmeyen iş' }, 400)

  const res = await dispatch(workflow, ALLOWED[workflow])
  if (!res.ok) return json({ error: `GitHub hatası: ${res.status}` }, 502)
  return json({ ok: true })
})
