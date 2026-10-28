import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home, Radar, Bot, KanbanSquare, Network, Users, Workflow, NotebookPen, CalendarDays, Wallet, Megaphone,
  BellRing, Gamepad2, MessageSquareText, LayoutDashboard, FolderOpen, Settings, RefreshCw, LogOut, Menu, X, CheckCircle2, AlertTriangle, Info, ChevronDown,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { usePeople } from '../lib/data'
import { refreshPush } from '../lib/push'
import { Brand, initials } from './ui'
import { usePresenceTracker } from '../lib/presence'

// Menü grupları: günlük bakış, çalışma ve mağaza/gelir sayfaları
type NavItem = { to: string; label: string; hint: string; icon: typeof Home }
export const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Günlük',
    items: [
      { to: '/', label: 'Ana sayfa', hint: 'Günün özeti', icon: Home },
      { to: '/komuta', label: 'Komuta', hint: 'Oyunlar ve sinyaller', icon: Radar },
      { to: '/asistan', label: 'Asistan', hint: 'Yapay zekaya sor', icon: Bot },
      { to: '/uyarilar', label: 'Uyarılar', hint: 'Politika ve hatalar', icon: BellRing },
    ],
  },
  {
    title: 'Çalışma',
    items: [
      { to: '/calisma', label: 'Çalışma alanı', hint: 'Ekip panosu', icon: LayoutDashboard },
      { to: '/gorevler', label: 'Görevler', hint: 'İş panosu', icon: KanbanSquare },
      { to: '/plan', label: 'Plan', hint: 'Çalışma sırası', icon: Network },
      { to: '/ortak', label: 'Ortak plan', hint: 'Birlikte çalış', icon: Users },
      { to: '/otomasyon', label: 'Otomasyon', hint: 'Kurallar', icon: Workflow },
      { to: '/notlar', label: 'Notlar', hint: 'Dokümanlar', icon: NotebookPen },
      { to: '/dosyalar', label: 'Dosyalar', hint: 'Ortak klasör', icon: FolderOpen },
      { to: '/takvim', label: 'Takvim', hint: 'Tarihler', icon: CalendarDays },
    ],
  },
  {
    title: 'Mağaza ve gelir',
    items: [
      { to: '/oyunlar', label: 'Oyunlar', hint: 'Mağazalar', icon: Gamepad2 },
      { to: '/gelir', label: 'Gelir', hint: 'AdMob ve satış', icon: Wallet },
      { to: '/reklamlar', label: 'Reklam', hint: 'Kampanyalar', icon: Megaphone },
      { to: '/yorumlar', label: 'Yorumlar', hint: 'Oyuncular', icon: MessageSquareText },
      { to: '/ayarlar', label: 'Ayarlar', hint: 'Profil ve bağlantılar', icon: Settings },
    ],
  },
]
const links = navGroups.flatMap((g) => g.items)
const mobileMain = ['/', '/calisma', '/gorevler', '/gelir']

export default function Layout() {
  const { signOut } = useAuth()
  const { alerts, toasts, triggerUpdate, updating } = useStore()
  const { me } = usePeople()
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState(false)
  const loc = useLocation()
  const menuRef = useRef<HTMLDivElement>(null)
  usePresenceTracker(me.email, loc.pathname)

  // Telefon bildirim kaydını her açılışta tazele (izin verilmişse)
  useEffect(() => {
    refreshPush()
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    setMenu(false)
    setSheet(false)
  }, [loc.pathname])

  // Menü dışına tıklayınca kapan
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
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
            <Link to="/" aria-label="Ana sayfa">
              <Brand />
            </Link>

            <div className="menu-wrap" ref={menuRef}>
              <button type="button" className="menu-btn" aria-expanded={menu} aria-label="Menüyü aç" onClick={() => setMenu(!menu)}>
                {current ? <current.icon size={15} /> : <Menu size={15} />}
                {current?.label ?? 'Menü'}
                <ChevronDown size={14} className={`chev ${menu ? 'open' : ''}`} />
              </button>
              {menu && (
                <nav className="menu-pop" aria-label="Ana menü">
                  {navGroups.map((g) => (
                    <div key={g.title} className="menu-group">
                      <span className="menu-title">{g.title}</span>
                      {g.items.map((n) => (
                        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}>
                          <span className="menu-ico"><n.icon size={16} /></span>
                          <span className="menu-txt">
                            <b>{n.label}</b>
                            <small>{n.hint}</small>
                          </span>
                          {n.to === '/uyarilar' && critical > 0 && <span className="menu-badge">{critical}</span>}
                        </NavLink>
                      ))}
                    </div>
                  ))}
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
            <Brand />
            <button type="button" className="icon-btn" onClick={() => setSheet(false)} aria-label="Menüyü kapat"><X size={18} /></button>
          </div>
          {navGroups.map((g) => (
            <div key={g.title} className="sheet-group">
              <span className="menu-title">{g.title}</span>
              <div className="sheet-grid">
                {g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `sheet-tile ${isActive ? 'on' : ''}`}>
                    <span className="menu-ico"><n.icon size={17} /></span>
                    <b>{n.label}</b>
                    <small>{n.to === '/uyarilar' && critical > 0 ? `${critical} kritik` : n.hint}</small>
                  </NavLink>
                ))}
              </div>
            </div>
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
