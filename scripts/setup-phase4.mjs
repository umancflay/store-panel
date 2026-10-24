// 4. aşama kurulum yardımcısı (Windows). Kendi bilgisayarında çalıştır:
//
//   node scripts/setup-phase4.mjs
//
// Bildirim anahtarlarını (VAPID) üretir ve her birini sırayla panoya kopyalar.
// Sen sadece GitHub'daki ilgili secret sayfasına Ctrl+V yapıp kaydedersin.
// Anahtarlar ekrana yazılmaz, hiçbir dosyaya kaydedilmez.

import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import readline from 'node:readline/promises'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const copy = (text) => execSync('clip', { input: text })
const secrets = 'https://github.com/umancflay/store-panel/settings/secrets/actions'

const ecdh = crypto.createECDH('prime256v1')
ecdh.generateKeys()
const pub = ecdh.getPublicKey().toString('base64url')
const priv = ecdh.getPrivateKey().toString('base64url')

const steps = [
  ['VAPID_PUBLIC_KEY', pub],
  ['VITE_VAPID_PUBLIC_KEY', pub],
  ['VAPID_PRIVATE_KEY', priv],
]

console.log('\nBildirim anahtarları üretildi. Üç secret sırayla panoya kopyalanacak.')
console.log(`GitHub secret sayfası: ${secrets}\n`)
for (const [i, [name, value]] of steps.entries()) {
  copy(value)
  console.log(`${i + 1}/3  ${name} panoya kopyalandı.`)
  console.log(`     GitHub'da ${name} sayfasında değer kutusuna Ctrl+V yap ve kaydet.`)
  await rl.question('     Bitince Enter\'a bas… ')
}
copy('')
console.log('\nTamam. Pano temizlendi. Bildirim anahtarları hazır.\n')
rl.close()
