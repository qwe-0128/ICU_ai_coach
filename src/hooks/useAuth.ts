import { useState, useEffect, useCallback } from 'react'

const PIN_KEY = 'icu_pin_session'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Check if PIN session exists on mount
  useEffect(() => {
    const stored = localStorage.getItem(PIN_KEY)
    if (stored) {
      setIsAuthenticated(true)
    }
    setIsLoading(false)

    // Listen for pin-required events from API
    const handler = () => {
      setIsAuthenticated(false)
      localStorage.removeItem(PIN_KEY)
    }
    window.addEventListener('pin-required', handler)
    return () => window.removeEventListener('pin-required', handler)
  }, [])

  const authenticate = useCallback(async (pin: string, _setPin: boolean, apiCall: (pin: string) => Promise<{ success: boolean; token: string }>) => {
    setError('')
    try {
      const result = await apiCall(pin)
      if (result.success && result.token) {
        localStorage.setItem(PIN_KEY, result.token)
        setIsAuthenticated(true)
        return true
      }
      return false
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      setError(msg)
      return false
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(PIN_KEY)
    setIsAuthenticated(false)
    setError('')
  }, [])

  return {
    isAuthenticated,
    isLoading,
    error,
    authenticate,
    logout,
    setError,
  }
}