// Asistan işi (10 dakikada bir): bildirim kuyruğunu boşaltır, bekleyen soruları ve panelden istenen
// haftalık iş planını ve Claude'a atanan görevleri Claude'a yaptırır. Ucuz başlar: "check" modu Claude'a iş var mı diye bakar; yoksa Claude hiç kurulmaz.
//   node scripts/assistant.mjs check  → bildirimleri gönderir, GITHUB_OUTPUT'a has=true|false yazar
//   node scripts/assistant.mjs        → soruları cevaplar, istendiyse iş planını hazırlar

import fs from 'node:fs'
import { dbReady } from './db.mjs'
import { aiReady, hasPendingQuestions, runAi } from './ai.mjs'
import { flushOutbox, notifyPeople } from './push.mjs'
import { runWorkPlan, workPlanRequested } from './workplan.mjs'
import { hasAssistantTasks, runAssistantTasks } from './assistanttasks.mjs'
import { markTrendsStarted, runAdTrends, trendsDue } from './adtrends.mjs'
import { runStudio, studioDue } from './studio.mjs'
import { profilesDue, runProfiles } from './gameprofile.mjs'
import { guidesDue, runGuides } from './designguide.mjs'

if (!dbReady) {
  console.log('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil; iş atlandı.')
  process.exit(0)
}

// Reklam trendleri ayrı adımda (ayrı iş) çalışır: uzun sürer, sohbet cevaplarını bekletmesin
if (process.argv[2] === 'trends-check') {
  const due = aiReady && (await trendsDue())
  if (due) await markTrendsStarted()
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `has=${due}
`)
  console.log(due ? 'Reklam trendleri araştırılacak' : 'Reklam trendleri güncel')
  process.exit(0)
}
// Reklam Stüdyosu: fikir yazma ve video birleştirme (ffmpeg) ayrı işte
if (process.argv[2] === 'studio-check') {
  const due = (await studioDue()) || (await profilesDue()) || (await guidesDue())
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `has=${due}
`)
  console.log(due ? 'Stüdyoda iş var' : 'Stüdyoda iş yok')
  process.exit(0)
}
if (process.argv[2] === 'studio') {
  await runProfiles()
  await runGuides()
  await runStudio()
  process.exit(0)
}
if (process.argv[2] === 'trends') {
  await runAdTrends()
  process.exit(0)
}

if (process.argv[2] === 'check') {
  await flushOutbox()
  const has = aiReady && ((await hasPendingQuestions()) || (await workPlanRequested()) || (await hasAssistantTasks()))
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
// Claude'a atanan görevler: taslak hazırlanır, görev açana geri atanır (atama tetikleyicisi bildirim kuyruğuna yazar)
if (await hasAssistantTasks()) {
  await runAssistantTasks()
  await flushOutbox()
}
