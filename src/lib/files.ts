import { supabase, isDemo } from './supabase'
import type { FileRow } from './types'

// Dosyalar Supabase Storage'daki gizli "files" kovasında durur (supabase/phase5.sql).
// Sadece giriş yapmış admin (iki adımlı doğrulamayla) yükler ve açar; bağlantılar 1 saat geçerli.

export const MAX_FILE = 50 * 1024 * 1024 // ücretsiz planda dosya başına sınır

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
export async function uploadFile(file: File): Promise<Pick<FileRow, 'name' | 'path' | 'size' | 'mime'>> {
  if (file.size > MAX_FILE) throw new Error(`${file.name} 50 MB'tan büyük`)
  const meta = { name: file.name, size: file.size, mime: file.type || null }
  if (isDemo) return { ...meta, path: URL.createObjectURL(file) }
  // Türkçe karakter ve boşluk kovada sorun çıkarmasın: yol güvenli, asıl ad kayıtta
  const safe = file.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`
  const { error } = await supabase!.storage.from('files').upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(error.message)
  return { ...meta, path }
}

export async function fileUrls(paths: string[]): Promise<Record<string, string>> {
  if (isDemo || paths.length === 0) return Object.fromEntries(paths.map((p) => [p, p]))
  const { data } = await supabase!.storage.from('files').createSignedUrls(paths, 3600)
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl as string]))
}

export async function openFile(f: FileRow, download = false) {
  if (isDemo) return window.open(f.path, '_blank')
  const { data, error } = await supabase!.storage.from('files').createSignedUrl(f.path, 3600, download ? { download: f.name } : undefined)
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank')
}

export async function deleteStored(path: string) {
  if (isDemo) return
  const { error } = await supabase!.storage.from('files').remove([path])
  if (error) throw new Error(error.message)
}

// Ekip akışına bir satır (hata verirse işi durdurmaz)
export async function logActivity(who: string, what: string, link: string | null = null) {
  if (isDemo) return
  await supabase!.from('activity').insert({ who, what, link } as never)
}
