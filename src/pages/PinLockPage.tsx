import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../context/AuthContext'

export function PinLockPage() {
  const { setPin, verifyPin, error } = useAuthContext()
  const [pin, setLocalPin] = useState('')
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async () => {
    if (pin.length < 4 || isSubmitting) return
    setIsSubmitting(true)

    try {
      if (isFirstTime) {
        const ok = await setPin(pin)
        if (ok) navigate('/', { replace: true })
      } else {
        const ok = await verifyPin(pin)
        if (ok) navigate('/', { replace: true })
        // If not ok, check if it's first time
        if (!ok) {
          try {
            const ok2 = await setPin(pin)
            if (ok2) {
              setIsFirstTime(false)
              navigate('/', { replace: true })
            }
          } catch {
            // Ignore
          }
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🚴</div>
          <h1 className="text-xl font-bold text-gray-900">骑行AI教练</h1>
          <p className="text-sm text-gray-500 mt-2">
            {isFirstTime ? '首次使用，请设置4-8位PIN码' : '请输入PIN码解锁'}
          </p>
        </div>

        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '')
            setLocalPin(val)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder="输入PIN码"
          className="w-full px-4 py-3 text-center text-2xl tracking-widest border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
          autoFocus
        />

        {error && (
          <p className="text-red-500 text-sm text-center mt-3">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={pin.length < 4 || isSubmitting}
          className="w-full mt-6 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? '验证中...' : '解锁'}
        </button>
      </div>
    </div>
  )
}