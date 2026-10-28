// Asistan işi (10 dakikada bir): bildirim kuyruğunu boşaltır, bekleyen soruları ve panelden istenen
// haftalık iş planını Claude'a yaptırır. Ucuz başlar: "check" modu Claude'a iş var mı diye bakar; yoksa Claude hiç kurulmaz.
//   node scripts/assistant.mjs check  → bildirimleri gönderir, GITHUB_OUTPUT'a has=true|false yazar
//   node scripts/assistant.mjs        → soruları cevaplar, istendiyse iş planını hazırlar

import fs from 'node:fs'
import { dbReady } from './db.mjs'
import { aiReady, hasPendingQuestions, runAi } from './ai.mjs'
import { flushOutbox, notifyPeople } from './push.mjs'
import { runWorkPlan, workPlanRequested } from './workplan.mjs'

if (!dbReady) {
  console.log('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil; iş atlandı.')
  process.exit(0)
}

if (process.argv[2] === 'check') {
  await flushOutbox()
  const has = aiReady && ((await hasPendingQuestions()) || (await workPlanRequested()))
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `has=${has}\n`)
  console.log(has ? 'Claude için iş var' : 'Claude için iş yok')
  process.exit(0)
}

if (await hasPendingQuestions()) {
  const answered = await runAi({ questionsOnly: true })
  for (const q of answered) {
    await notifyPeople(q.asked_by ? [q.asked_by] : [], {
      title: 'Asistan cevapladı',
      body: `${q.question}`.replace(/\s+/g, ' ').slice(0, 60) + ' → ' + q.answer.replace(/\s+/g, ' ').slice(0, 100),
      url: './#/asistan',
    })
  }
}
if (await workPlanRequested()) await runWorkPlan()
