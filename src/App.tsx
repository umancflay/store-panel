import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { StoreProvider } from './lib/store'
import { DataProvider } from './lib/data'
import Layout from './components/Layout'
import Login from './pages/Login'
import Welcome from './pages/Welcome'
import Komuta from './pages/Komuta'
import Tasks from './pages/Tasks'
import Notes from './pages/Notes'
import Calendar from './pages/Calendar'
import Plan from './pages/Plan'
import Shared from './pages/Shared'
import Automations from './pages/Automations'
import Alerts from './pages/Alerts'
import { GameDetail, GamesList } from './pages/Games'
import Reviews from './pages/Reviews'
import Revenue from './pages/Revenue'
import Ads from './pages/Ads'
import Assistant from './pages/Assistant'
import Settings from './pages/Settings'
import Workspace from './pages/Workspace'
import Files from './pages/Files'
import ReleasePage from './pages/Release'

function Gate() {
  const { stage } = useAuth()
  if (stage === 'loading') return <div className="empty" style={{ paddingTop: '40vh' }}><Loader2 className="spin" /></div>
  if (stage !== 'ready') return <Login />
  return (
    <DataProvider>
      <StoreProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Welcome />} />
            <Route path="komuta" element={<Komuta />} />
            <Route path="calisma" element={<Workspace />} />
            <Route path="dosyalar" element={<Files />} />
            <Route path="gorevler" element={<Tasks />} />
            <Route path="plan" element={<Plan />} />
            <Route path="ortak" element={<Shared />} />
            <Route path="otomasyon" element={<Automations />} />
            <Route path="notlar" element={<Notes />} />
            <Route path="takvim" element={<Calendar />} />
            <Route path="uyarilar" element={<Alerts />} />
            <Route path="oyunlar" element={<GamesList />} />
            <Route path="oyunlar/:id" element={<GameDetail />} />
            <Route path="yorumlar" element={<Reviews />} />
            <Route path="gelir" element={<Revenue />} />
            <Route path="reklamlar" element={<Ads />} />
            <Route path="asistan" element={<Assistant />} />
            <Route path="surum" element={<ReleasePage />} />
            <Route path="ayarlar" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </StoreProvider>
    </DataProvider>
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
