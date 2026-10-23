import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BellRing, Gamepad2, MessageSquareText, Wallet, Megaphone, Bot, Settings,
  RefreshCw, LogOut, Menu, CheckCircle2, AlertTriangle, Info, BookOpen,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { isDemo } from '../lib/supabase'

export const navItems = [
  { to: '/', label: 'Genel Bakış', icon: LayoutDashboard },
  { to: '/uyarilar', label: 'Uyarılar', icon: BellRing },
  { to: '/oyunlar', label: 'Oyunlar', icon: Gamepad2 },
  { to: '/yorumlar', label: 'Yorumlar', icon: MessageSquareText },
  { to: '/gelir', label: 'Gelir ve AdMob', icon: Wallet },
  { to: '/reklamlar', label: 'Reklamlar', icon: Megaphone },
  { to: '/asistan', label: 'AI Asistan', icon: Bot },
  { to: '/ayarlar', label: 'Ayarlar', icon: Settings },
]

const mobileMain = ['/', '/uyarilar', '/oyunlar', '/gelir']

export default function Layout() {
  const { email, signOut } = useAuth()
  const { alerts, toasts, triggerUpdate, updating } = useStore()
  const [sheet, setSheet] = useState(false)
  const loc = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    setSheet(false)
  }, [loc.pathname])

  const critical = alerts.filter((a) => a.level === 'critical' && a.status === 'open').length
  const current = navItems.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))

  const badge = (to: string) => (to === '/uyarilar' && critical > 0 ? <span className="nav-badge">{critical}</span> : null)

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Gamepad2 size={17} /></span>
          STORE PANEL
        </div>
        <div className="divider" />
        {navItems.map((n, i) => (
          <div key={n.to}>
            {i === 6 && <div className="nav-label">ARAÇLAR</div>}
            <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon"><n.icon size={16} /></span>
              {n.label}
              {badge(n.to)}
            </NavLink>
          </div>
        ))}

        <div className="help-card">
          <div className="icon-box"><BookOpen size={17} /></div>
          <b>Kurulum rehberi</b>
          <span>Adım adım anlatım README dosyasında.</span>
          <a className="btn" href={import.meta.env.VITE_REPO_URL || 'https://github.com'} target="_blank" rel="noreferrer">REHBERİ AÇ</a>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="crumbs">Panel / <b>{current?.label ?? 'Oyun'}</b></div>
            <h1>{current?.label ?? 'Oyun detayı'}</h1>
          </div>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={triggerUpdate} disabled={updating}>
            <RefreshCw size={14} className={updating ? 'spin' : ''} />
            Şimdi güncelle
          </button>
          <div className="user-pill">
            <span className="avatar">{(email ?? '?')[0].toUpperCase()}</span>
            <span className="email">{email}{isDemo && ' (demo)'}</span>
            <button className="btn" onClick={signOut} title="Çıkış yap" aria-label="Çıkış yap"><LogOut size={14} /></button>
          </div>
        </header>

        <Outlet />
      </main>

      <nav className="bottom-nav">
        {navItems.filter((n) => mobileMain.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="bn-icon"><n.icon size={18} /></span>
            {n.label.split(' ')[0]}
            {badge(n.to)}
          </NavLink>
        ))}
        <button onClick={() => setSheet(true)} className={mobileMain.includes(current?.to ?? '/') ? '' : 'active'}>
          <span className="bn-icon"><Menu size={18} /></span>
          Daha fazla
        </button>
      </nav>

      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="sheet">
            <div className="sheet-grip" />
            {navItems.filter((n) => !mobileMain.includes(n.to)).map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setSheet(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="nav-icon"><n.icon size={16} /></span>
                {n.label}
              </NavLink>
            ))}
            <button className="nav-item" style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer' }} onClick={signOut}>
              <span className="nav-icon"><LogOut size={16} /></span>
              Çıkış yap
            </button>
          </div>
        </>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.tone === 'ok' && <CheckCircle2 size={18} color="var(--green)" />}
            {t.tone === 'warn' && <AlertTriangle size={18} color="var(--orange)" />}
            {t.tone === 'info' && <Info size={18} color="var(--cyan)" />}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
