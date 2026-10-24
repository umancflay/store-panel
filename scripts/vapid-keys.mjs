// Telefon bildirimleri için VAPID anahtar çifti üretir. Kendi bilgisayarında BİR KEZ çalıştır:
//
//   node scripts/vapid-keys.mjs
//
// Çıkan iki değeri GitHub Secrets'a gir (README › 4. aşama). Anahtarı değiştirirsen
// telefonlardaki bildirim izni geçersiz olur; panelden bildirimi bir kez daha açman gerekir.

import crypto from 'node:crypto'

const ecdh = crypto.createECDH('prime256v1')
ecdh.generateKeys()

console.log('\nGitHub Secrets\'a şu değerleri gir:\n')
console.log('VAPID_PUBLIC_KEY ve VITE_VAPID_PUBLIC_KEY (ikisine de aynı değer):')
console.log(ecdh.getPublicKey().toString('base64url') + '\n')
console.log('VAPID_PRIVATE_KEY (gizli! başka hiçbir yere yapıştırma):')
console.log(ecdh.getPrivateKey().toString('base64url') + '\n')
