// Meta (Facebook) Reklam verilerini çeken ve Supabase'e işleyen modül.
// GitHub Secrets: META_ACCESS_TOKEN ve META_AD_ACCOUNT_ID

import { db, setConnection } from './db.mjs'

export const metaReady = Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID)

export async function collectMeta({ light = false } = {}) {
  const accessToken = process.env.META_ACCESS_TOKEN
  const adAccountId = process.env.META_AD_ACCOUNT_ID

  if (!metaReady) {
    console.log('Meta: META_ACCESS_TOKEN veya META_AD_ACCOUNT_ID tanımlı değil, atlandı.')
    return
  }

  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=campaign_name,spend,impressions,clicks,cpc,ctr&date_preset=last_7d&access_token=${accessToken}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.error) {
      throw new Error(data.error.message || 'Meta API hatası')
    }

    const rows = data.data || []
    console.log(`Meta: ${rows.length} kampanya verisi çekildi.`)

    await setConnection('meta', 'connected', `${rows.length} kampanya güncellendi`)
  } catch (err) {
    console.error('Meta veri çekme hatası:', err.message)
    await setConnection('meta', 'error', String(err.message).slice(0, 300))
    throw err
  }
}
