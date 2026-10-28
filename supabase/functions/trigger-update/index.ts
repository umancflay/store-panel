// "Şimdi güncelle" butonu, Asistan ve Yayın Uzmanı bu fonksiyonu çağırır.
// Fonksiyon önce çağıranın admin olduğunu (MFA dahil) kontrol eder,
// sonra GitHub Actions'taki istenen işi başlatır (gövde: { workflow }, varsayılan veri toplama).
// GitHub token'ı sadece Supabase secrets'ta durur (GH_DISPATCH_TOKEN).
import { createClient } from 'npm:@supabase/supabase-js@2'

// Sadece bu işler başlatılabilir; collect-data dışındakiler girdi almaz
const ALLOWED: Record<string, Record<string, string> | undefined> = {
  'collect-data.yml': { job: 'manual' },
  'assistant.yml': undefined,
  'expert.yml': undefined,
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: isAdmin, error } = await supabase.rpc('is_admin')
  if (error || !isAdmin) return json({ error: 'Yetkisiz' }, 403)

  const repo = Deno.env.get('GH_REPO') // ör. kullaniciadi/store-panel
  const token = Deno.env.get('GH_DISPATCH_TOKEN')
  if (!repo || !token) return json({ error: 'GH_REPO veya GH_DISPATCH_TOKEN ayarlanmamış' }, 500)

  const body = await req.json().catch(() => ({}))
  const workflow = typeof body?.workflow === 'string' ? body.workflow : 'collect-data.yml'
  if (!(workflow in ALLOWED)) return json({ error: 'Bilinmeyen iş' }, 400)
  const inputs = ALLOWED[workflow]

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'store-panel',
    },
    body: JSON.stringify({ ref: 'main', ...(inputs ? { inputs } : {}) }),
  })

  if (!res.ok) return json({ error: `GitHub hatası: ${res.status}` }, 502)
  return json({ ok: true })
})
