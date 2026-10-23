// Basit uyarı kuralları: toplanan veriye bakıp sorun varsa "alerts" tablosuna yazar.
// Google'ın "kötü davranış" eşikleri: çökme %1,09, ANR %0,47 (son 28 gün ortalaması).
// Aynı sorun için ayda bir uyarı açılır; çözüldü işaretlenen uyarı o ay tekrar açılmaz.

import { db, upsert } from './db.mjs'

const LIMITS = { crash_rate: 1.09, anr_rate: 0.47 }

export async function applyRules() {
  const since = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)
  const rows = await db(`store_daily?platform=eq.android&date=gte.${since}&select=game_id,crash_rate,anr_rate`)
  const games = await db('games?select=id,name,android_package')
  const month = new Date().toISOString().slice(0, 7)

  const byGame = new Map()
  for (const r of rows) {
    const g = byGame.get(r.game_id) ?? { crash_rate: [], anr_rate: [] }
    if (r.crash_rate != null) g.crash_rate.push(Number(r.crash_rate))
    if (r.anr_rate != null) g.anr_rate.push(Number(r.anr_rate))
    byGame.set(r.game_id, g)
  }

  const alerts = []
  for (const [gameId, v] of byGame) {
    const game = games.find((g) => g.id === gameId)
    const url = game?.android_package ? `https://play.google.com/console/developers/app/vitals/overview?package=${game.android_package}` : 'https://play.google.com/console'
    for (const metric of ['crash_rate', 'anr_rate']) {
      const list = v[metric]
      if (!list.length) continue
      const avg = list.reduce((a, b) => a + b, 0) / list.length
      if (avg <= LIMITS[metric]) continue
      const crash = metric === 'crash_rate'
      alerts.push({
        external_id: `${metric}-${gameId}-${month}`,
        level: 'critical',
        source: 'play',
        game_id: gameId,
        title: `${game?.name ?? gameId}: ${crash ? 'çökme' : 'ANR'} oranı Google eşiğinin üstünde (%${avg.toFixed(2).replace('.', ',')})`,
        body: `Son 28 günde ortalama ${crash ? 'çökme' : 'ANR'} oranı %${LIMITS[metric].toString().replace('.', ',')} eşiğini aştı. Bu devam ederse Google Play oyunun görünürlüğünü düşürür ve mağaza sayfasında uyarı gösterebilir.`,
        how_to_fix: (crash
          ? [
              'Play Console › Android vitals › Çökmeler ve ANR\'ler bölümüne gir, en çok kullanıcıyı etkileyen çökmeyi aç.',
              'Yığın izinde (stack trace) hangi sınıfın geçtiğine bak; hangi cihaz ve Android sürümlerinde olduğunu not al.',
              'Düzeltmeyi yapıp yeni bir sürümü önce dahili test kanalına, sonra üretime gönder.',
              'Unity: Project Settings › Player › Android › Other Settings\'te Scripting Backend IL2CPP ve Target Architectures ARM64 açık olsun.',
              'Unity: Çökme Unity sınıfındaysa Unity sürümünü güncel LTS\'e yükselt; yerel (native) çökmelerde symbols.zip dosyasını Play Console\'a yükle ki satır numaraları görünsün.',
            ]
          : [
              'Play Console › Android vitals › Çökmeler ve ANR\'ler bölümünde ANR listesini aç.',
              'ANR çoğunlukla ana iş parçacığında uzun süren işlerden olur: dosya okuma, ağ isteği, büyük sahne yükleme.',
              'Düzeltmeyi yapıp yeni sürüm gönder.',
              'Unity: Sahneleri SceneManager.LoadSceneAsync ile yükle; büyük dosya ve ağ işlerini coroutine ya da async içine taşı.',
              'Unity: Reklam SDK\'sını (Google Mobile Ads) son sürüme güncelle; eski sürümler açılışta ANR yapabiliyor.',
            ]
        ).join('\n'),
        console_url: url,
      })
    }
  }
  if (alerts.length) await upsert('alerts', alerts, 'external_id')
  console.log(`Uyarı kuralları: ${alerts.length} uyarı`)
}
