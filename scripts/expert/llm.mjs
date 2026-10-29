// Stüdyonun kendi açık kaynak dil modeli (Ollama, GitHub Actions'ta). Claude'a bağlı değildir.
// Görevi dar: kural raporunu sade, sıcak bir Türkçe özete çevirmek. Kararları kurallar verir, model vermez.
// Çıktı doğrulanır; uydurma sayı içeriyorsa ya da engelleyici sorunu atlıyorsa kullanılmaz (null → kural raporu gösterilir).

const URL_ = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
export const MODEL = process.env.EXPERT_MODEL || 'qwen2.5:7b-instruct'

const SYSTEM = [
  'Sen bir mobil oyun stüdyosunun yayın uzmanısın. Kullanıcı kod bilmiyor; Türkçe, kısa ve adım adım konuş.',
  'Sadece sana verilen bulguları kullan. Yeni sorun, sayı, tarih ya da politika maddesi uydurma.',
  'Önce sonucu tek cümleyle söyle (yüklenebilir mi), sonra en fazla 8 maddede ne yapması gerektiğini sırala; engelleyici sorunlar önce.',
].join(' ')

const norm = (s) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
const numbers = (s) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')))

// Engelleyici her bulgunun başlığındaki ilk anlamlı kelime geçmeli; girdide olmayan sayı olmamalı
export function validatePolish(out, findings, source = '') {
  if (typeof out !== 'string' || out.length < 80 || out.length > 2500) return false
  const text = norm(out)
  for (const f of findings.filter((x) => x.severity === 'block')) {
    const word = norm(f.title).split(/[^a-z0-9]+/).find((w) => w.length >= 4)
    if (word && !text.includes(word)) return false
  }
  const known = numbers(source + ' ' + findings.map((f) => `${f.title} ${f.detail} ${f.fix.join(' ')}`).join(' '))
  for (const n of numbers(out)) if (!known.has(n)) return false
  return true
}

export async function polish(report, findings, { fetchImpl = fetch, timeoutMs = 480000 } = {}) {
  const prompt = [
    'Kural raporu:',
    report.text,
    '',
    'Bulgular (JSON):',
    JSON.stringify(findings.map(({ severity, title, detail, fix }) => ({ severity, title, detail, fix }))),
    '',
    'Bu raporu kullanıcıya sade bir özet olarak yaz.',
  ].join('\n')
  let timer
  try {
    const res = await Promise.race([
      fetchImpl(`${URL_}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, system: SYSTEM, prompt, stream: false, options: { temperature: 0.2, num_ctx: 8192 } }),
      }),
      new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('zaman aşımı')), timeoutMs))),
    ])
    if (!res.ok) return null
    const out = String((await res.json()).response ?? '').trim()
    return validatePolish(out, findings, report.text) ? out : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
