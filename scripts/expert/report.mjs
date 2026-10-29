// Kural bulgularından Türkçe, sade rapor. Kendi model yoksa ya da çıktısı güvenilmezse bu metin aynen kullanılır.

const LABEL = { block: 'Engelleyici', warn: 'Uyarı', info: 'Bilgi' }

export function buildReport(findings, meta) {
  const counts = { block: 0, warn: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  const verdict = counts.block ? 'blocked' : counts.warn ? 'warnings' : 'clean'
  const head = `${meta.gameName} ${meta.versionName} (${meta.versionCode})`
  const first =
    verdict === 'blocked'
      ? `${head} · Yüklenemez: ${counts.block} engelleyici sorun`
      : verdict === 'warnings'
        ? `${head} · Yüklenebilir, ama ${counts.warn} uyarı var`
        : `${head} · Sorun bulunmadı, yüklemeye hazır`

  const lines = [first]
  findings.forEach((f, i) => {
    lines.push('', `${i + 1}. [${LABEL[f.severity]}] ${f.title}`, `   ${f.detail}`)
    f.fix.forEach((s) => lines.push(`   → ${s}`))
  })
  if (verdict === 'blocked') lines.push('', 'Önce engelleyici sorunları düzelt, build\'i yeniden al ve buraya tekrar bırak.')
  return { verdict, counts, text: lines.join('\n') }
}
