// Google "refresh token" üretici. Bunu kendi bilgisayarında BİR KEZ çalıştırırsın.
//
//   node scripts/google-token.mjs
//
// Senden Google Cloud'daki OAuth istemci ID'sini ve gizli anahtarını ister,
// tarayıcıda Google izin ekranını açar, sonunda refresh token'ı ekrana yazar.
// O değeri GitHub Secrets'a GOOGLE_REFRESH_TOKEN olarak gir. Başka hiçbir yere yapıştırma.
//
// İzinler: AdMob raporlarını okuma + Gmail'i okuma (4. aşama, politika mailleri).
// Gmail izni sadece okumadır: mail silemez, gönderemez, etiket değiştiremez.
// 2. aşamada token ürettiysen 4. aşama için bu betiği bir kez daha çalıştır ve yeni token'ı gir.

import http from 'node:http'
import { createInterface } from 'node:readline/promises'
import { exec } from 'node:child_process'

const SCOPES = [
  'https://www.googleapis.com/auth/admob.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
]

const rl = createInterface({ input: process.stdin, output: process.stdout })
const clientId = (process.env.GOOGLE_CLIENT_ID || (await rl.question('OAuth Client ID: '))).trim()
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || (await rl.question('OAuth Client Secret: '))).trim()
rl.close()

const server = http.createServer()
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const redirectUri = `http://127.0.0.1:${server.address().port}`

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })

console.log('\nTarayıcıda Google izin ekranı açılıyor. Açılmazsa bu adresi kopyalayıp tarayıcına yapıştır:\n')
console.log(authUrl + '\n')
const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open'
exec(`${opener} "${authUrl}"`)

const code = await new Promise((resolve, reject) => {
  server.on('request', (req, res) => {
    const params = new URL(req.url, redirectUri).searchParams
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    if (params.get('code')) {
      res.end('<h2>Tamam! Bu sekmeyi kapatıp terminale dönebilirsin.</h2>')
      resolve(params.get('code'))
    } else {
      res.end('<h2>İzin verilmedi.</h2>')
      reject(new Error(params.get('error') || 'izin verilmedi'))
    }
  })
})
server.close()

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
})
const json = await res.json()
if (!json.refresh_token) {
  console.error('Refresh token alınamadı:', json)
  process.exit(1)
}

// Windows'ta token'ı panoya da kopyala: GitHub'daki secret kutusuna Ctrl+V yeter
let copied = false
if (process.platform === 'win32') {
  try {
    ;(await import('node:child_process')).execSync('clip', { input: json.refresh_token })
    copied = true
  } catch {
    /* pano yoksa sadece ekrana yaz */
  }
}
console.log('\n✅ Başarılı! Aşağıdaki değeri GitHub Secrets\'a GOOGLE_REFRESH_TOKEN adıyla gir' + (copied ? ' (panoya kopyalandı, Ctrl+V yeter)' : '') + ':\n')
console.log(json.refresh_token + '\n')
