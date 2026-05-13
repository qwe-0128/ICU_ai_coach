import { useState, useEffect, useCallback } from 'react'

const PIN_KEY = 'icu_pin_session'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Check if PIN session exists and validate on mount
  useEffect(() => {
    const stored = localStorage.getItem(PIN_KEY)
    if (!stored) {
      setIsLoading(false)
      return
    }

    // Validate stored token with lightweight call
    let cancelled = false
    const validate = async () => {
      try {
        const resp = await fetch('/api/pin-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-pin-token': stored },
          body: JSON.stringify({ action: 'validate' }),
        })
        if (!resp.ok) {
          localStorage.removeItem(PIN_KEY)
          if (!cancelled) setIsAuthenticated(false)
        } else {
          if (!cancelled) setIsAuthenticated(true)
        }
      } catch {
        // Network error, keep existing state
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    validate()

    // Listen for pin-required events from API
    const handler = () => {
      setIsAuthenticated(false)
      localStorage.removeItem(PIN_KEY)
    }
    window.addEventListener('pin-required', handler)
    return () => {
      cancelled = true
      window.removeEventListener('pin-required', handler)
    }
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