import { supabase, isDemo } from './supabase'
import type { FileRow } from './types'

// Dosyalar Supabase Storage'daki gizli "files" kovasında durur (supabase/phase5.sql).
// Sadece giriş yapmış admin (iki adımlı doğrulamayla) yükler ve açar; bağlantılar 1 saat geçerli.
// Ücretsiz planda tek nesne en çok 50 MB olabilir: büyük dosyalar 45 MB'lık parçalara bölünür
// ("yol.part0", "yol.part1" …), indirirken tarayıcıda birleştirilir.

export const MAX_FILE = 500 * 1024 * 1024
const PART = 45 * 1024 * 1024
const partPaths = (f: Pick<FileRow, 'path' | 'parts'>) => (f.parts > 1 ? Array.from({ length: f.parts }, (_, i) => `${f.path}.part${i}`) : [f.path])

export function fileSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'doc' | 'other'
export function fileKind(f: Pick<FileRow, 'name' | 'mime'>): FileKind {
  const m = f.mime ?? ''
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf') return 'pdf'
  if (['zip', 'rar', '7z', 'gz', 'unitypackage', 'apk', 'aab', 'ipa'].includes(ext)) return 'archive'
  if (['doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'ppt', 'pptx', 'json'].includes(ext)) return 'doc'
  return 'other'
}

// Kovaya yükler; kaydı çağıran yazar (useRows.insert) ki liste anında güncellensin
export async function uploadFile(file: File, onProgress?: (p: number) => void): Promise<Pick<FileRow, 'name' | 'path' | 'size' | 'mime' | 'parts'>> {
  if (file.size > MAX_FILE) throw new Error(`${file.name} 500 MB'tan büyük`)
  const parts = Math.max(1, Math.ceil(file.size / PART))
  const meta = { name: file.name, size: file.size, mime: file.type || null, parts }
  if (isDemo) return { ...meta, parts: 1, path: URL.createObjectURL(file) }
  // Türkçe karakter ve boşluk kovada sorun çıkarmasın: yol güvenli, asıl ad kayıtta
  const safe = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`
  for (const [i, p] of partPaths({ path, parts }).entries()) {
    const body = parts > 1 ? file.slice(i * PART, (i + 1) * PART) : file
    const { error } = await supabase!.storage.from('files').upload(p, body, { contentType: parts > 1 ? 'application/octet-stream' : file.type || undefined })
    if (error) {
      await supabase!.storage.from('files').remove(partPaths({ path, parts }).slice(0, i)).catch(() => {})
      throw new Error(error.message)
    }
    onProgress?.((i + 1) / parts)
  }
  return { ...meta, path }
}

export async function fileUrls(paths: string[]): Promise<Record<string, string>> {
  if (isDemo || paths.length === 0) return Object.fromEntries(paths.map((p) => [p, p]))
  const { data } = await supabase!.storage.from('files').createSignedUrls(paths, 3600)
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl as string]))
}

export async function openFile(f: FileRow, download = false) {
  if (isDemo) return window.open(f.path, '_blank')
  if (f.parts > 1) {
    // Parçaları indirip tek dosya olarak kaydet
    const { data, error } = await supabase!.storage.from('files').createSignedUrls(partPaths(f), 3600)
    if (error) throw new Error(error.message)
    const blobs = await Promise.all((data ?? []).map((d) => fetch(d.signedUrl as string).then((r) => r.blob())))
    const url = URL.createObjectURL(new Blob(blobs, { type: f.mime ?? 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  const { data, error } = await supabase!.storage.from('files').createSignedUrl(f.path, 3600, download ? { download: f.name } : undefined)
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank')
}

export async function deleteStored(f: Pick<FileRow, 'path' | 'parts'>) {
  if (isDemo) return
  const { error } = await supabase!.storage.from('files').remove(partPaths(f))
  if (error) throw new Error(error.message)
}

// Ekip akışına bir satır (hata verirse işi durdurmaz)
export async function logActivity(who: string, what: string, link: string | null = null) {
  if (isDemo) return
  await supabase!.from('activity').insert({ who, what, link } as never)
}
