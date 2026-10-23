// GitHub Actions'ta çalışan veri toplama betiği.
// Anahtarlar ortam değişkeninden gelir (GitHub Secrets). Koda asla yazılmaz.
//
// 1. aşama: sadece "çalıştım" kaydı düşer. Sonraki aşamalarda buraya
// AdMob, Play, App Store, Gmail ve Claude adımları eklenecek.

const job = process.argv[2] || 'manual'
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.log('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil; iş atlandı.')
  process.exit(0)
}

async function db(path, method, body) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      // Eski tip (JWT) service_role anahtarı Authorization ister; yeni sb_secret_ anahtarı apikey yeter
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

const [run] = await db('sync_runs', 'POST', { job, status: 'running' })
console.log(`İş başladı: ${job} (#${run.id})`)

try {
  // TODO 2. aşama: AdMob
  // TODO 3. aşama: Google Play, App Store Connect
  // TODO 4. aşama: Gmail politika mailleri + Claude analizi
  // TODO 5. aşama: reklam planları
  await db(`sync_runs?id=eq.${run.id}`, 'PATCH', { status: 'success', finished_at: new Date().toISOString(), message: '1. aşama: henüz bağlı kaynak yok' })
  console.log('Bitti.')
} catch (err) {
  await db(`sync_runs?id=eq.${run.id}`, 'PATCH', { status: 'failed', finished_at: new Date().toISOString(), message: String(err).slice(0, 500) })
  throw err
}
