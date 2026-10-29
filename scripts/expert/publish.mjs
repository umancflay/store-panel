// Google Play'e yükleme ve kademeli yayın (Play Developer Publishing API, mevcut hizmet hesabı).
// Dahili test kanalı onaysız; üretim ve yüzde değişiklikleri sadece panelde onaylanmış eylemlerle çağrılır.

import fs from 'node:fs'
import { saToken } from '../play.mjs'

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications'

// Play'in İngilizce hatalarını kullanıcının anlayacağı dile çevirir
export function playError(status, body) {
  const t = String(body)
  if (status === 404 || /package not found|no application was found/i.test(t))
    return 'Bu paket Play\'de yok: oyunun ilk sürümünü Play Console\'dan elle yüklemen gerekiyor, sonrakileri uzman yükler.'
  if (/version code.*(already been used|already used)/i.test(t))
    return 'Bu sürüm kodu daha önce kullanılmış: Unity › Player Settings › Bundle Version Code\'u artırıp build\'i yeniden al.'
  if (status === 403)
    return 'Hizmet hesabının yayınlama izni yok: Play Console › Kullanıcılar ve izinler\'de "test kanallarına / üretime yayınla" izinlerini ver.'
  if (/signature|signed with the wrong key|upload key/i.test(t))
    return 'Build yanlış anahtarla imzalanmış: Unity › Publishing Settings\'te Play\'e kayıtlı yükleme anahtarını (keystore) seç.'
  return `Play hatası (${status}): ${t.slice(0, 300)}`
}

function client(pkg, fetchImpl, tokenImpl) {
  return async (url, { method = 'GET', body, raw } = {}) => {
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${await tokenImpl()}`, 'Content-Type': raw ? 'application/octet-stream' : 'application/json' },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(playError(res.status, text))
    return text ? JSON.parse(text) : {}
  }
}

// Bir düzenleme (edit) açar, fn içinde değişiklikleri yapar, commit eder; hata olursa düzenlemeyi siler
async function withEdit(pkg, call, fn) {
  const edit = await call(`${API}/${pkg}/edits`, { method: 'POST', body: {} })
  try {
    const out = await fn(edit.id)
    await call(`${API}/${pkg}/edits/${edit.id}:commit`, { method: 'POST' })
    return out
  } catch (e) {
    await call(`${API}/${pkg}/edits/${edit.id}`, { method: 'DELETE' }).catch(() => {})
    throw e
  }
}

const release = (versionCode, userFraction, notes) => ({
  versionCodes: [String(versionCode)],
  ...(userFraction && userFraction < 1 ? { status: 'inProgress', userFraction } : { status: 'completed' }),
  ...(notes?.length ? { releaseNotes: notes } : {}),
})

// AAB (ya da APK) yükler ve kanala koyar. Üretimde userFraction (ör. 0.1) kademeli yayın demektir.
export async function uploadBundle({ pkg, filePath, track, userFraction, notes, fetchImpl = fetch, tokenImpl = saToken }) {
  const call = client(pkg, fetchImpl, tokenImpl)
  const kind = filePath.toLowerCase().endsWith('.apk') ? 'apks' : 'bundles'
  return withEdit(pkg, call, async (id) => {
    const up = await call(`${UPLOAD}/${pkg}/edits/${id}/${kind}?uploadType=media`, { method: 'POST', raw: fs.readFileSync(filePath) })
    const versionCode = Number(up.versionCode)
    await call(`${API}/${pkg}/edits/${id}/tracks/${track}`, {
      method: 'PUT',
      body: { track, releases: [release(versionCode, track === 'production' ? userFraction : undefined, notes)] },
    })
    return { versionCode }
  })
}

// Üretimdeki kademeli yayını büyütür (0.5, 1) ya da durdurur ('halt')
export async function setRollout({ pkg, versionCode, userFraction, fetchImpl = fetch, tokenImpl = saToken }) {
  const call = client(pkg, fetchImpl, tokenImpl)
  return withEdit(pkg, call, async (id) => {
    const track = await call(`${API}/${pkg}/edits/${id}/tracks/production`)
    const cur = (track.releases ?? []).find((r) => (r.versionCodes ?? []).includes(String(versionCode)))
    if (!cur) throw new Error(`Üretimde ${versionCode} sürüm kodlu bir yayın bulunamadı.`)
    const next =
      userFraction === 'halt'
        ? { versionCodes: cur.versionCodes, status: 'halted', ...(cur.userFraction ? { userFraction: cur.userFraction } : {}) }
        : release(versionCode, userFraction, cur.releaseNotes)
    await call(`${API}/${pkg}/edits/${id}/tracks/production`, { method: 'PUT', body: { track: 'production', releases: [next] } })
  })
}

// Dahili testteki sürümü üretime taşır (dosya yeniden yüklenmez; Play'de zaten var)
export async function promote({ pkg, versionCode, userFraction = 0.1, notes, fetchImpl = fetch, tokenImpl = saToken }) {
  const call = client(pkg, fetchImpl, tokenImpl)
  return withEdit(pkg, call, async (id) => {
    await call(`${API}/${pkg}/edits/${id}/tracks/production`, {
      method: 'PUT',
      body: { track: 'production', releases: [release(versionCode, userFraction, notes)] },
    })
  })
}
