// Supabase'e GitHub Actions'tan yazmak için küçük yardımcı.
// Service role anahtarı RLS'i atlar; sadece Actions'ta, GitHub Secrets'tan gelir.

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

export const dbReady = Boolean(url && key)

export async function db(path, method = 'GET', body, prefer = 'return=representation') {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      // Eski tip (JWT) service_role anahtarı Authorization ister; yeni sb_secret_ anahtarı apikey yeter
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Büyük listeleri 1000'lik parçalar halinde "varsa güncelle, yoksa ekle"
export async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 1000) {
    await db(`${table}?on_conflict=${onConflict}`, 'POST', rows.slice(i, i + 1000), 'resolution=merge-duplicates,return=minimal')
  }
}

export async function setConnection(source, status, message) {
  await upsert('connections', [{ source, status, message, last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }], 'source')
}
