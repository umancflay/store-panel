// Play Store'daki herkese açık oyun sayfasından ikon, toplam indirme ve puanı okur.
// Giriş/anahtar gerekmez. Oyun henüz yayında değilse sayfa yoktur, null döner.

export async function playStorePage(pkg) {
  const res = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=en&gl=US`)
  if (!res.ok) return null
  const html = await res.text()

  const icon = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null
  // Sayfa verisinde: ["1,000+", 1000, 1534, "1K+"] → tam indirme sayısı 1534
  const inst = html.match(/\["([\d,]+\+)",(\d+),(\d+),"([^"]+)"\]/)
  // Yıldız dağılımı: "123 reviews for star rating 5" → ortalama puan
  const stars = [...html.matchAll(/aria-label="([\d,]+) reviews? for star rating (\d)"/g)].map((m) => [Number(m[2]), Number(m[1].replace(/,/g, ''))])
  const count = stars.reduce((a, [, n]) => a + n, 0)

  return {
    icon: icon ? icon.replace(/=s\d+.*$|=w\d+.*$/, '') + '=s256' : null,
    installs: inst ? Number(inst[3]) : null,
    installsLabel: inst ? inst[4] : null,
    rating: count ? +(stars.reduce((a, [s, n]) => a + s * n, 0) / count).toFixed(2) : null,
    ratingsCount: count || null,
  }
}
