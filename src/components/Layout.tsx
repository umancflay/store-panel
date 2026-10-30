import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home, Radar, Bot, KanbanSquare, Network, Users, Workflow, NotebookPen, CalendarDays, Wallet, Megaphone,
  BellRing, Gamepad2, MessageSquareText, LayoutDashboard, FolderOpen, Settings, RefreshCw, LogOut, Menu, X, CheckCircle2, AlertTriangle, Info, ChevronDown, Search, Rocket, Clapperboard,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { usePeople } from '../lib/data'
import { refreshPush } from '../lib/push'
import CommandPalette from './CommandPalette'
import { Brand, initials } from './ui'
import { usePresenceTracker } from '../lib/presence'

// Menü grupları: günlük bakış, ekip ve mağaza/gelir. Benzer sayfalar tek menü öğesinde sekme olarak durur.
type Page = { to: string; label: string; hint: string; icon: typeof Home }
type NavItem = Page & { tabs?: Page[] }
const tab = (to: string, label: string, hint: string, icon: typeof Home): Page => ({ to, label, hint, icon })
export const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Günlük',
    items: [
      { to: '/', label: 'Ana sayfa', hint: 'Günün özeti', icon: Home },
      {
        to: '/komuta', label: 'Komuta', hint: 'Sinyaller ve uyarılar', icon: Radar,
        tabs: [tab('/komuta', 'Sinyaller', 'Oyunlar ve sinyaller', Radar), tab('/uyarilar', 'Uyarılar', 'Politika ve hatalar', BellRing)],
      },
      { to: '/asistan', label: 'Asistan', hint: 'Yapay zekaya sor', icon: Bot },
    ],
  },
  {
    title: 'Ekip',
    items: [
      {
        to: '/calisma', label: 'Çalışma', hint: 'Pano, görevler, takvim', icon: LayoutDashboard,
        tabs: [
          tab('/calisma', 'Bugün', 'Ekip panosu', LayoutDashboard),
          tab('/gorevler', 'Görevler', 'İş panosu', KanbanSquare),
          tab('/ortak', 'Ortak plan', 'Birlikte çalış', Users),
          tab('/takvim', 'Takvim', 'Tarihler', CalendarDays),
        ],
      },
      {
        to: '/plan', label: 'Plan', hint: 'Yol haritası ve kurallar', icon: Network,
        tabs: [tab('/plan', 'Yol haritası', 'Çalışma sırası', Network), tab('/otomasyon', 'Otomasyon', 'Kurallar', Workflow)],
      },
      {
        to: '/notlar', label: 'Belgeler', hint: 'Notlar ve dosyalar', icon: NotebookPen,
        tabs: [tab('/notlar', 'Notlar', 'Dokümanlar', NotebookPen), tab('/dosyalar', 'Dosyalar', 'Ortak klasör', FolderOpen)],
      },
    ],
  },
  {
    title: 'Mağaza ve gelir',
    items: [
      {
        to: '/oyunlar', label: 'Oyunlar', hint: 'Mağazalar ve yorumlar', icon: Gamepad2,
        tabs: [tab('/oyunlar', 'Oyunlar', 'Mağazalar', Gamepad2), tab('/yorumlar', 'Yorumlar', 'Oyuncular', MessageSquareText)],
      },
      { to: '/gelir', label: 'Gelir', hint: 'AdMob ve satış', icon: Wallet },
      {
        to: '/reklamlar', label: 'Reklam', hint: 'Kampanyalar, trendler, stüdyo', icon: Megaphone,
        tabs: [tab('/reklamlar', 'Pano', 'Kampanyalar ve trendler', Megaphone), tab('/studyo', 'Stüdyo', 'Reklam videosu hazırla', Clapperboard)],
      },
      { to: '/yayin', label: 'Yayın Uzmanı', hint: 'Build, test, yayın', icon: Rocket },
      { to: '/ayarlar', label: 'Ayarlar', hint: 'Profil ve bağlantılar', icon: Settings },
    ],
  },
]
// Arama ve "kim nerede" için tüm sayfalar (sekmeler dahil)
export const allPages: Page[] = navGroups.flatMap((g) => g.items.flatMap((i) => i.tabs ?? [i]))
const links = navGroups.flatMap((g) => g.items)
const pathsOf = (n: NavItem) => (n.tabs ?? [n]).map((t) => t.to)
const mobileMain = ['/', '/gelir', '/reklamlar', '/yayin']

export default function Layout() {
  const { signOut } = useAuth()
  const { alerts, toasts, triggerUpdate, updating } = useStore()
  const { me } = usePeople()
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [cmd, setCmd] = useState(false)
  const loc = useLocation()
  const menuRef = useRef<HTMLDivElement>(null)
  usePresenceTracker(me.email, loc.pathname)

  // Hızlı arama: Ctrl+K (Mac'te Cmd+K)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmd((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
  const current = links.find((n) => pathsOf(n).some(isActive))
  const on = (n: NavItem) => n === current

  return (
    <div className="page">
      <div className="streak s1" />
      <div className="streak s2" />
      <div className="glow-pool" />
      <div className="aurora a1" />
      <div className="aurora a2" />

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
                        <Link key={n.to} to={n.to} className={`menu-item ${on(n) ? 'active' : ''}`}>
                          <span className="menu-ico"><n.icon size={16} /></span>
                          <span className="menu-txt">
                            <b>{n.label}</b>
                            <small>{n.hint}</small>
                          </span>
                          {n.to === '/komuta' && critical > 0 && <span className="menu-badge">{critical}</span>}
                        </Link>
                      ))}
                    </div>
                  ))}
                </nav>
              )}
            </div>

            <div className="top-right">
              <button type="button" className="icon-btn" onClick={() => setCmd(true)} title="Hızlı arama (Ctrl+K)" aria-label="Hızlı arama">
                <Search size={15} />
              </button>
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

          <CommandPalette open={cmd} onClose={() => setCmd(false)} />
          <div className="shell">
          {/* Geniş ekranda her zaman görünen sol menü: sayfalar ve açık sayfanın sekmeleri */}
          <nav className="sidenav" aria-label="Sol menü">
            {navGroups.map((g) => (
              <div key={g.title} className="side-group">
                <span className="menu-title">{g.title}</span>
                {g.items.map((n) => (
                  <div key={n.to}>
                    <Link to={n.to} className={`side-item ${on(n) ? 'active' : ''}`}>
                      <span className="side-ico"><n.icon size={15} /></span>
                      <span className="grow">{n.label}</span>
                      {n.to === '/komuta' && critical > 0 && <span className="menu-badge">{critical}</span>}
                    </Link>
                    {on(n) && n.tabs && (
                      <div className="side-sub">
                        {n.tabs.map((t) => <Link key={t.to} to={t.to} className={isActive(t.to) ? 'on' : ''}>{t.label}</Link>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <button type="button" className="side-search" onClick={() => setCmd(true)}><Search size={13} /> Ara <kbd>Ctrl K</kbd></button>
          </nav>
          <main className="main">
            {current?.tabs && (
              <nav className="seg hub-tabs" aria-label={current.label}>
                {current.tabs.map((t) => (
                  <Link key={t.to} to={t.to} className={isActive(t.to) ? 'on' : ''}>
                    <t.icon size={13} /> {t.label}
                    {t.to === '/uyarilar' && critical > 0 && <span className="menu-badge">{critical}</span>}
                  </Link>
                ))}
              </nav>
            )}
            <PageGuard key={loc.pathname}>
              <Outlet />
            </PageGuard>
          </main>
          </div>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Alt menü">
        {links.filter((n) => mobileMain.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={on(n) ? 'active' : ''}>
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
                  <Link key={n.to} to={n.to} className={`sheet-tile ${on(n) ? 'on' : ''}`}>
                    <span className="menu-ico"><n.icon size={17} /></span>
                    <b>{n.label}</b>
                    <small>{n.to === '/komuta' && critical > 0 ? `${critical} kritik` : n.hint}</small>
                  </Link>
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
