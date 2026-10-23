import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home, Radar, Bot, KanbanSquare, Network, Users, Workflow, NotebookPen, CalendarDays, Wallet, Megaphone,
  BellRing, Gamepad2, MessageSquareText, Settings, RefreshCw, LogOut, Menu, X, CheckCircle2, AlertTriangle, Info,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { usePeople } from '../lib/data'
import { initials } from './ui'

// Menü: tasarımdaki 11 sayfa + panelin mağaza sayfaları
export const navItems = [
  { to: '/', label: 'Ana sayfa', hint: 'Özet', icon: Home },
  { to: '/komuta', label: 'Komuta', hint: 'Sinyal akışı', icon: Radar },
  { to: '/asistan', label: 'Asistan', hint: 'Yapay zeka', icon: Bot },
  { to: '/gorevler', label: 'Görevler', hint: 'Pano', icon: KanbanSquare },
  { to: '/plan', label: 'Plan', hint: 'Çalışma sırası', icon: Network },
  { to: '/ortak', label: 'Ortak plan', hint: 'Birlikte çalış', icon: Users },
  { to: '/otomasyon', label: 'Otomasyon', hint: 'Kurallar', icon: Workflow },
  { to: '/notlar', label: 'Notlar', hint: 'Dokümanlar', icon: NotebookPen },
  { to: '/takvim', label: 'Takvim', hint: 'Yayınlar', icon: CalendarDays },
  { to: '/gelir', label: 'Gelir', hint: 'AdMob', icon: Wallet },
  { to: '/reklamlar', label: 'Reklam', hint: 'Kampanyalar', icon: Megaphone },
  { sep: true },
  { to: '/uyarilar', label: 'Uyarılar', hint: 'Politika', icon: BellRing },
  { to: '/oyunlar', label: 'Oyunlar', hint: 'Mağazalar', icon: Gamepad2 },
  { to: '/yorumlar', label: 'Yorumlar', hint: 'Oyuncular', icon: MessageSquareText },
  { to: '/ayarlar', label: 'Ayarlar', hint: 'Bağlantılar', icon: Settings },
] as const

type NavItem = { to: string; label: string; hint: string; icon: typeof Home }
const links = navItems.filter((n): n is (typeof navItems)[number] & NavItem => !('sep' in n))
const mobileMain = ['/', '/komuta', '/gorevler', '/gelir']

export default function Layout() {
  const { signOut } = useAuth()
  const { alerts, toasts, triggerUpdate, updating } = useStore()
  const { me } = usePeople()
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState(false)
  const loc = useLocation()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    setMenu(false)
    setSheet(false)
  }, [loc.pathname])

  // Menü dışına tıklayınca kapan
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  const critical = alerts.filter((a) => a.level === 'critical' && a.status === 'open').length
  const isActive = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to))
  const current = links.find((n) => isActive(n.to))

  return (
    <div className="page">
      <div className="streak s1" />
      <div className="streak s2" />
      <div className="glow-pool" />

      <div className="frame">
        <div className="frame-inner">
          <header className="topbar">
            <Link to="/" className="logo">
              <span className="logo-mark">P</span>
              PIXEL GAME
            </Link>

            <div className="menu-wrap" ref={menuRef}>
              <button type="button" className="menu-btn" aria-expanded={menu} aria-label="Menüyü aç" onClick={() => setMenu(!menu)}>
                <Menu size={16} />
                {current?.label ?? 'Menü'}
              </button>
              {menu && (
                <nav className="menu-pop" aria-label="Ana menü">
                  {navItems.map((n, i) =>
                    'sep' in n ? (
                      <div key={'sep' + i} className="menu-sep" />
                    ) : (
                      <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}>
                        <span className="menu-dot" />
                        {n.label}
                        {n.to === '/uyarilar' && critical > 0 ? <span className="menu-badge">{critical}</span> : <span className="menu-hint">{n.hint}</span>}
                      </NavLink>
                    ),
                  )}
                </nav>
              )}
            </div>

            <div className="top-right">
              <button type="button" className="icon-btn" onClick={triggerUpdate} disabled={updating} title="Şimdi güncelle" aria-label="Şimdi güncelle">
                <RefreshCw size={15} className={updating ? 'spin' : ''} />
              </button>
              <div className="user-pill">
                <span className="avatar">{initials(me.name)}</span>
                <span className="user-meta">
                  <b>{me.name}</b>
                  <span>{me.role}</span>
                </span>
              </div>
              <button type="button" className="icon-btn hide-m" onClick={signOut} title="Çıkış yap" aria-label="Çıkış yap">
                <LogOut size={15} />
              </button>
            </div>
          </header>

          <main className="main">
            <PageGuard key={loc.pathname}>
              <Outlet />
            </PageGuard>
          </main>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Alt menü">
        {links.filter((n) => mobileMain.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="bn-icon"><n.icon size={18} /></span>
            {n.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setSheet(true)} className={mobileMain.includes(current?.to ?? '/') ? '' : 'active'} aria-label="Tüm menü">
          <span className="bn-icon"><Menu size={18} /></span>
          Menü
          {critical > 0 && <span className="menu-badge">{critical}</span>}
        </button>
      </nav>

      {sheet && (
        <nav className="sheet" aria-label="Ana menü">
          <div className="flex between" style={{ paddingBottom: 14 }}>
            <span className="logo"><span className="logo-mark">P</span>PIXEL GAME</span>
            <button type="button" className="icon-btn" onClick={() => setSheet(false)} aria-label="Menüyü kapat"><X size={18} /></button>
          </div>
          {links.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `sheet-link ${isActive ? 'on' : ''}`}>
              {n.label}
              <small>{n.to === '/uyarilar' && critical > 0 ? `${critical} kritik` : n.hint}</small>
            </NavLink>
          ))}
          <button type="button" className="sheet-link" onClick={signOut}>
            Çıkış yap <small><LogOut size={14} /></small>
          </button>
        </nav>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.tone === 'ok' && <CheckCircle2 size={17} color="var(--green)" />}
            {t.tone === 'warn' && <AlertTriangle size={17} color="var(--orange)" />}
            {t.tone === 'info' && <Info size={17} color="var(--silver)" />}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// Bir sayfada hata olursa tüm panel kararmasın; sadece o sayfada mesaj göster
class PageGuard extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card empty">
        Bu sayfa açılırken bir hata oldu: {this.state.error}
        <br />
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => location.reload()}>Sayfayı yenile</button>
      </div>
    )
  }
}
