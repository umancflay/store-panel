import { useEffect, useState, type FormEvent } from 'react'
import { Gamepad2, ShieldCheck, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase, isDemo } from '../lib/supabase'

// Giriş ekranı: e-posta + şifre → (ilk seferde) iki adımlı doğrulama kurulumu → 6 haneli kod.
// Yeni hesap açma yok; hesapları Supabase panelinden admin açar.
export default function Login() {
  const { stage, email: userEmail, refresh, signOut, demoSignIn } = useAuth()

  return (
    <div className="auth-page">
      <div className="auth-art">
        <div className="brand-mark" style={{ width: 72, height: 72, borderRadius: 22 }}><Gamepad2 size={36} /></div>
        <h2>STORE PANEL</h2>
        <p>Oyunların, mağazaların ve reklamların tek ekranda.</p>
      </div>
      <div className="auth-form">
        <div className="auth-box fade-in" key={stage}>
          {stage === 'signedOut' && <PasswordStep demoSignIn={demoSignIn} />}
          {stage === 'enroll' && <EnrollStep onDone={refresh} onCancel={signOut} />}
          {stage === 'verify' && <VerifyStep onDone={refresh} onCancel={signOut} />}
          {stage === 'denied' && (
            <>
              <h1>Erişim yok</h1>
              <p className="card-sub"><b>{userEmail}</b> bu panelin admin listesinde değil.</p>
              <button className="btn btn-block" onClick={signOut}>Başka hesapla giriş yap</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PasswordStep({ demoSignIn }: { demoSignIn: (e: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (isDemo) return demoSignIn(email || 'demo@storepanel')
    setBusy(true)
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı.' : error.message)
  }

  return (
    <form onSubmit={submit}>
      <h1>Hoş geldin</h1>
      <p className="card-sub">Devam etmek için e-posta ve şifrenle giriş yap.</p>
      {isDemo && (
        <div className="sample-banner" style={{ marginBottom: 20 }}>
          Demo mod: Supabase bağlı değil. Herhangi bir bilgiyle girip örnek verileri görebilirsin.
        </div>
      )}
      <div className="field">
        <label htmlFor="email">E-posta</label>
        <div className="gradient-border">
          <input id="email" className="input" type="email" autoComplete="username" placeholder="ornek@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} required={!isDemo} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="password">Şifre</label>
        <div className="gradient-border">
          <input id="password" className="input" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required={!isDemo} />
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy && <Loader2 size={16} className="spin" />} GİRİŞ YAP
      </button>
      <p className="muted small" style={{ textAlign: 'center', marginTop: 18 }}>Yeni hesap açılamaz. Hesaplar yönetici tarafından eklenir.</p>
    </form>
  )
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="code">Doğrulama kodu</label>
      <div className="gradient-border">
        <input id="code" className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} autoFocus required />
      </div>
    </div>
  )
}

// İlk girişte: Google Authenticator / Authy gibi bir uygulamayla QR kodu okut
function EnrollStep({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      // Yarım kalmış eski kurulumları temizle
      const { data: list } = await supabase!.auth.mfa.listFactors()
      for (const f of list?.all ?? []) if (f.status === 'unverified') await supabase!.auth.mfa.unenroll({ factorId: f.id })
      const { data, error } = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Store Panel ' + Date.now() })
      if (error) return setError(error.message)
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    })()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!factor) return
    setBusy(true)
    const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    setBusy(false)
    if (error) return setError('Kod hatalı, tekrar dene.')
    onDone()
  }

  return (
    <form onSubmit={submit}>
      <h1 className="flex"><ShieldCheck color="var(--primary)" /> İki adımlı doğrulama</h1>
      <p className="card-sub">Telefonundaki doğrulama uygulamasıyla (Google Authenticator, Authy…) bu QR kodu okut, sonra uygulamadaki 6 haneli kodu yaz.</p>
      {factor ? (
        <>
          <div className="qr"><img src={factor.qr} alt="QR kod" /></div>
          <div className="secret">Elle girmek için: {factor.secret}</div>
        </>
      ) : (
        !error && <div className="empty"><Loader2 className="spin" /></div>
      )}
      <CodeInput value={code} onChange={setCode} />
      {error && <div className="error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy || !factor}>ETKİNLEŞTİR</button>
      <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={onCancel}>Vazgeç</button>
    </form>
  )
}

function VerifyStep({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { data } = await supabase!.auth.mfa.listFactors()
    const factor = data?.totp[0]
    if (!factor) {
      setBusy(false)
      return setError('Doğrulama yöntemi bulunamadı.')
    }
    const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    setBusy(false)
    if (error) return setError('Kod hatalı veya süresi geçmiş.')
    onDone()
  }

  return (
    <form onSubmit={submit}>
      <h1 className="flex"><ShieldCheck color="var(--primary)" /> Doğrulama</h1>
      <p className="card-sub">Doğrulama uygulamandaki 6 haneli kodu gir.</p>
      <CodeInput value={code} onChange={setCode} />
      {error && <div className="error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>DOĞRULA</button>
      <button type="button" className="btn btn-block" style={{ marginTop: 10 }} onClick={onCancel}>Çıkış yap</button>
    </form>
  )
}
