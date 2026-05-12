import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { PinLockPage } from './pages/PinLockPage'
import { ChatPage } from './pages/ChatPage'
import { DashboardPage } from './pages/DashboardPage'
import { WorkoutPage } from './pages/WorkoutPage'
import { Layout } from './components/Layout'
import './style.css'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/pin" element={<PinLockPage />} />
          <Route element={<Layout />}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/" element={<DashboardPage />} />
            <Route path="/workout" element={<WorkoutPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}