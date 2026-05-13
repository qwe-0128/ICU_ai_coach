import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../context/AuthContext'
import { useEffect } from 'react'

export function Layout() {
  const { isAuthenticated, isLoading, logout } = useAuthContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/pin', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-bg flex flex-col text-text">
      {/* Top Bar */}
      <header className="bg-surface border-b border-surface-light px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="text-lg font-bold">🚴 骑行AI教练</h1>
          <button
            onClick={logout}
            className="text-sm text-text-muted hover:text-accent transition-colors"
          >
            锁定
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20 pt-4 px-4 max-w-2xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-surface-light safe-area-bottom">
        <div className="flex justify-around items-center max-w-2xl mx-auto h-16">
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              `flex flex-col items-center text-xs gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`
            }
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            教练对话
          </NavLink>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center text-xs gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`
            }
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            数据面板
          </NavLink>
          <NavLink
            to="/workout"
            className={({ isActive }) =>
              `flex flex-col items-center text-xs gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`
            }
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            课程编辑
          </NavLink>
        </div>
      </nav>
    </div>
  )
}