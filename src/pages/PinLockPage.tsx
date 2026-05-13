import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../context/AuthContext'

export function PinLockPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { verifyPin, isAuthenticated } = useAuthContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async () => {
    if (pin.length < 4) return
    const ok = await verifyPin(pin)
    if (!ok) {
      setError(true)
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6">
      <div className={`${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-text mb-1">骑行AI教练</h1>
          <p className="text-text-muted text-sm">输入PIN码解锁</p>
        </div>

        <div className="bg-surface border border-surface-light rounded-2xl p-6 w-72 mx-auto">
          <input
            ref={inputRef}
            type="password"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false) }}
            onKeyDown={handleKeyDown}
            maxLength={10}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="PIN码"
            className={`w-full text-center text-2xl tracking-[0.5em] py-3 px-4 rounded-xl border bg-bg text-text outline-none focus:ring-2 focus:ring-primary ${
              error ? 'border-danger focus:ring-danger' : 'border-surface-light'
            }`}
            autoComplete="off"
          />

          {error && (
            <p className="text-danger text-xs text-center mt-3">PIN码错误，请重试</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={pin.length < 4}
            className="w-full mt-4 py-3 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary-dark disabled:bg-surface-light disabled:text-text-muted disabled:cursor-not-allowed transition-colors"
          >
            解锁
          </button>
        </div>

        <p className="text-text-muted text-xs text-center mt-6">
          您的数据仅存储在本地浏览器中
        </p>
      </div>
    </div>
  )
}