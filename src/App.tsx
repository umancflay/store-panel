import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { StoreProvider } from './lib/store'
import Layout from './components/Layout'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Alerts from './pages/Alerts'
import { GameDetail, GamesList } from './pages/Games'
import Reviews from './pages/Reviews'
import Revenue from './pages/Revenue'
import Ads from './pages/Ads'
import Assistant from './pages/Assistant'
import Settings from './pages/Settings'

function Gate() {
  const { stage } = useAuth()
  if (stage === 'loading') return <div className="empty" style={{ paddingTop: '40vh' }}><Loader2 className="spin" /></div>
  if (stage !== 'ready') return <Login />
  return (
    <StoreProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="uyarilar" element={<Alerts />} />
          <Route path="oyunlar" element={<GamesList />} />
          <Route path="oyunlar/:id" element={<GameDetail />} />
          <Route path="yorumlar" element={<Reviews />} />
          <Route path="gelir" element={<Revenue />} />
          <Route path="reklamlar" element={<Ads />} />
          <Route path="asistan" element={<Assistant />} />
          <Route path="ayarlar" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </StoreProvider>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </HashRouter>
  )
}
