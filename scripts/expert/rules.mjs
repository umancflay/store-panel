// Kural motoru: uzman/kurallar/android.mjs'deki kuralları build'e uygular, bulguları ciddiyete göre sıralar.

import fs from 'node:fs'
import androidRules from '../../uzman/kurallar/android.mjs'
import { sdkList } from './bundle.mjs'

const ESIK = JSON.parse(fs.readFileSync(new URL('../../uzman/esikler.json', import.meta.url), 'utf8'))
const ORDER = { block: 0, warn: 1, info: 2 }

// ctx = { build, prev, game, declared, today }; eşikler ve SDK listesi burada eklenir
export function runRules(ctx, rules = androidRules) {
  const full = { esik: ESIK, sdk: sdkList(), ...ctx }
  const out = []
  for (const r of rules) {
    let res
    try {
      res = r.check(full)
    } catch (e) {
      // Kural hatası raporu durdurmasın; bilgi olarak görünsün
      res = { severity: 'info', detail: `Kural çalıştırılamadı: ${e.message}` }
    }
    if (!res) continue
    out.push({ id: r.id, severity: res.severity ?? r.severity, title: r.title, detail: res.detail, fix: r.fix, ...(r.policy ? { policy: r.policy } : {}) })
  }
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
}
