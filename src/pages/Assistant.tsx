import { Bot, Send, Sparkles } from 'lucide-react'

// İskelet sayfa. İleride verilerin hakkında soru sorabileceğin sohbet ekranı olacak.
const examples = ['Bu hafta en çok gelir getiren oyun hangisi?', 'Taşınma Kaosu neden çöküyor?', 'Hangi ülkede eCPM düştü?']

export default function Assistant() {
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 520 }}>
      <div className="card-head">
        <div className="flex">
          <span className="icon-box"><Bot size={20} /></span>
          <div>
            <div className="card-title">AI Asistan</div>
            <div className="card-sub">Yakında: verilerin hakkında Claude'a soru sorabileceksin.</div>
          </div>
        </div>
        <span className="badge b-warning">Yapım aşamasında</span>
      </div>
      <div className="chat">
        <div className="msg ai"><span className="ai-tag" style={{ marginBottom: 8 }}><Sparkles size={12} /> Claude</span><br />Merhaba! Yakında oyunlarının gelirini, yorumlarını ve uyarılarını buradan bana sorabileceksin. Örneğin:</div>
        <div className="flex wrap" style={{ gap: 8 }}>
          {examples.map((e) => <span key={e} className="badge b-primary" style={{ padding: '7px 12px' }}>{e}</span>)}
        </div>
        <div className="chat-input">
          <input className="input" placeholder="Bu özellik henüz hazır değil" disabled />
          <button className="btn btn-primary" disabled aria-label="Gönder"><Send size={14} /></button>
        </div>
      </div>
    </section>
  )
}
