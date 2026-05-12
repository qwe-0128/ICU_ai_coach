import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { verifyPin as apiVerifyPin, setPin as apiSetPin } from '../lib/api'

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  error: string
  verifyPin: (pin: string) => Promise<boolean>
  setPin: (pin: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()

  const verifyPin = async (pin: string) => {
    return auth.authenticate(pin, false, async (p) => {
      const result = await apiVerifyPin(p)
      return { success: result.success, token: result.token || '' }
    })
  }

  const setPin = async (pin: string) => {
    return auth.authenticate(pin, true, async (p) => {
      const result = await apiSetPin(p)
      return { success: result.success, token: '' }
    })
  }

  return (
    <AuthContext.Provider value={{
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
      error: auth.error,
      verifyPin,
      setPin,
      logout: auth.logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}