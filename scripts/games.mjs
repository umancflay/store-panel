// Mağaza/AdMob uygulamalarını paneldeki oyunlara bağlar.
// Önce kayıtlı ID'ye (AdMob app ID, Android paket adı, App Store ID) bakar,
// yoksa adı benzeyen oyunu bulup ID'yi kaydeder, o da yoksa yeni oyun ekler.
// Böylece elle eşleştirme gerekmez; Android ve iOS sürümleri aynı oyunda toplanır.

import { db, upsert } from './db.mjs'

// "Taşınma Kaosu" → "tasinmakaosu"
export const normalize = (s) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '')

// "Brick Gate iOS" ile "Brick Gate: Color Block Puzzle" aynı oyun: platform adını at, baş kısmı karşılaştır
const base = (s) => normalize(s.replace(/\b(ios|android)\b/gi, ''))

export async function gameLinker() {
  const games = await db('games?select=id,name,platforms,admob_app_ids,android_package,ios_app_id,active')

  return async function link({ name, platform, admobAppId, androidPackage, iosAppId }) {
    let game = games.find(
      (g) =>
        (admobAppId && (g.admob_app_ids ?? []).includes(admobAppId)) ||
        (androidPackage && g.android_package === androidPackage) ||
        (iosAppId && g.ios_app_id === iosAppId),
    )
    if (game) return game.id

    const n = normalize(name)
    const b = base(name)
    game =
      games.find((g) => normalize(g.name) === n) ??
      games.find((g) => b.length >= 4 && (base(g.name).startsWith(b) || b.startsWith(base(g.name))))

    const patch = {
      platforms: [...new Set([...(game?.platforms ?? []), platform])],
      active: true,
      ...(admobAppId ? { admob_app_ids: [...(game?.admob_app_ids ?? []), admobAppId] } : {}),
      ...(androidPackage ? { android_package: androidPackage } : {}),
      ...(iosAppId ? { ios_app_id: iosAppId } : {}),
    }

    if (game) {
      Object.assign(game, patch)
      await db(`games?id=eq.${encodeURIComponent(game.id)}`, 'PATCH', patch, 'return=minimal')
    } else {
      game = { id: base(name) || n || String(admobAppId ?? androidPackage ?? iosAppId).replace(/\W/g, ''), name, admob_app_ids: [], ...patch }
      await upsert('games', [game], 'id')
      games.push(game)
    }
    console.log(`Eşleşti: ${name} (${platform}) → ${game.id}`)
    return game.id
  }
}
