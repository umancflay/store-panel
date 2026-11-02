import { useCallback, useEffect, useState } from 'react'
import { supabase, isDemo } from './supabase'

// Görünüm: fotoğraf arka plan + buzlu cam kartlar ("glass") ya da klasik koyu tema.
// Seçim önce bu cihazda (localStorage) tutulur ki sayfa açılır açılmaz uygulansın; giriş yapılınca
// app_settings.ui_backgrounds › e-postana da yazılır, başka cihazda da aynı arka plan gelir.
// Hazır fotoğraflar Unsplash'ten (Lorem Picsum üzerinden; ücretsiz kullanım lisansı).

export type Background = { kind: 'none' } | { kind: 'preset'; id: string; dim: number } | { kind: 'custom'; url: string; dim: number }

const pic = (id: number, w = 1920, h = 1080) => `https://picsum.photos/id/${id}/${w}/${h}`
export const PRESETS = [
  { id: 'gunbatimi', name: 'Gün batımı', url: pic(110), thumb: pic(110, 320, 180) },
  { id: 'sis', name: 'Sisli dağlar', url: pic(177), thumb: pic(177, 320, 180) },
  { id: 'gol', name: 'Göl', url: pic(128), thumb: pic(128, 320, 180) },
  { id: 'col', name: 'Çöl akşamı', url: pic(184), thumb: pic(184, 320, 180) },
  { id: 'gece', name: 'Gece şehir', url: pic(122), thumb: pic(122, 320, 180) },
  { id: 'vadi', name: 'Puslu vadi', url: pic(11), thumb: pic(11, 320, 180) },
]
export const DEFAULT_BG: Background = { kind: 'preset', id: 'gunbatimi', dim: 0.4 }
const KEY = 'ui-bg'

export function readLocal(): Background {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v === 'object' && 'kind' in v ? v : DEFAULT_BG
  } catch {
    return DEFAULT_BG
  }
}

export function applyBackground(bg: Background) {
  const root = document.documentElement
  if (bg.kind === 'none') {
    root.classList.remove('glass')
    root.style.removeProperty('--bg-image')
    return
  }
  const url = bg.kind === 'preset' ? PRESETS.find((p) => p.id === bg.id)?.url ?? PRESETS[0].url : bg.url
  root.classList.add('glass')
  root.style.setProperty('--bg-image', `url("${url.replace(/"/g, '%22')}")`)
  root.style.setProperty('--bg-dim', String(Math.min(0.8, Math.max(0, bg.dim))))
}

// Yüklenen fotoğraf 1920 piksele küçültülüp JPEG'e çevrilir (cihazda ve ayarda az yer tutsun)
export async function compressImage(file: File, max = 1920): Promise<string> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

export function useBackground(email?: string) {
  const [bg, setBg] = useState<Background>(readLocal)

  // Başka cihazda seçilmiş arka plan varsa onu getir
  useEffect(() => {
    if (isDemo || !email) return
    supabase!.from('app_settings').select('value').eq('key', 'ui_backgrounds').maybeSingle().then(({ data }) => {
      const remote = (data as { value?: Record<string, Background> } | null)?.value?.[email.toLowerCase()]
      if (remote && JSON.stringify(remote) !== JSON.stringify(readLocal())) {
        try { localStorage.setItem(KEY, JSON.stringify(remote)) } catch { /* yer yok */ }
        applyBackground(remote)
        setBg(remote)
      }
    })
  }, [email])

  const save = useCallback(async (next: Background) => {
    setBg(next)
    applyBackground(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* fotoğraf çok büyükse sadece bu oturumda kalır */ }
    if (isDemo || !email) return
    const { data } = await supabase!.from('app_settings').select('value').eq('key', 'ui_backgrounds').maybeSingle()
    const all = (data as { value?: Record<string, Background> } | null)?.value ?? {}
    await supabase!.from('app_settings').upsert({ key: 'ui_backgrounds', value: { ...all, [email.toLowerCase()]: next }, updated_at: new Date().toISOString() } as never)
  }, [email])

  return [bg, save] as const
}
