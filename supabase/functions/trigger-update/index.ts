// "Şimdi güncelle" butonu bu fonksiyonu çağırır.
// Fonksiyon önce çağıranın admin olduğunu (MFA dahil) kontrol eder,
// sonra GitHub Actions'taki veri toplama işini başlatır.
// GitHub token'ı sadece Supabase secrets'ta durur (GH_DISPATCH_TOKEN).
import { createClient } from 'npm:@supabase/supabase-js@2'

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

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/collect-data.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'store-panel',
    },
    body: JSON.stringify({ ref: 'main', inputs: { job: 'manual' } }),
  })

  if (!res.ok) return json({ error: `GitHub hatası: ${res.status}` }, 502)
  return json({ ok: true })
})
