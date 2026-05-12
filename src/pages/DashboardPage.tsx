import { useState, useEffect, useCallback } from 'react'
import { getDashboardData, syncData } from '../lib/api'
import type { DashboardData, SyncResult } from '../lib/api'

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setError('')
      const result = await getDashboardData()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSync = async (full = false) => {
    setSyncing(true)
    setSyncMsg('同步中...')
    try {
      const result: SyncResult = await syncData(full)
      setSyncMsg(
        `同步完成: 新增${result.new_activities}项活动, 更新${result.weeks_updated}周数据`
      )
      fetchData() // Refresh after sync
    } catch (err) {
      setSyncMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-red-500 text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          重试
        </button>
      </div>
    )
  }

  const profile = data?.profile || {}
  const recent14d = data?.recent_14d || []
  const weekly42d = data?.weekly_42d || []
  const goals = data?.goals || []
  const lastSync = data?.last_sync || ''

  // Compute stats
  const totalDuration = recent14d.reduce(
    (sum, a: Record<string, unknown>) =>
      sum + Number((a as Record<string, unknown>).moving_time || 0) / 3600,
    0
  )
  const totalDistance = recent14d.reduce(
    (sum, a: Record<string, unknown>) =>
      sum + Number((a as Record<string, unknown>).distance || 0) / 1000,
    0
  )
  const avgHR = recent14d.length > 0
    ? recent14d.reduce(
        (sum, a: Record<string, unknown>) =>
          sum + Number((a as Record<string, unknown>).average_heartrate || 0),
        0
      ) / recent14d.length
    : 0

  return (
    <div className="space-y-6">
      {/* Sync Controls */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-900">数据同步</h2>
          <div className="flex gap-2">
            <button
              onClick={() => handleSync(false)}
              disabled={syncing}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
            >
              {syncing ? '同步中...' : '增量同步'}
            </button>
            <button
              onClick={() => handleSync(true)}
              disabled={syncing}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:bg-gray-100 transition-colors"
            >
              全量同步
            </button>
          </div>
        </div>
        {syncMsg && (
          <p className={`text-xs ${syncMsg.startsWith('同步失败') ? 'text-red-500' : 'text-green-600'}`}>
            {syncMsg}
          </p>
        )}
        {lastSync && (
          <p className="text-xs text-gray-400 mt-1">
            上次同步: {new Date(lastSync).toLocaleString('zh-CN')}
          </p>
        )}
      </div>

      {/* Profile Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">近2周骑行时间</p>
          <p className="text-2xl font-bold text-gray-900">{totalDuration.toFixed(1)}h</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">近2周骑行距离</p>
          <p className="text-2xl font-bold text-gray-900">{totalDistance.toFixed(0)}km</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">平均心率</p>
          <p className="text-2xl font-bold text-gray-900">
            {avgHR > 0 ? `${avgHR.toFixed(0)}bpm` : '-'}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">2周活动数</p>
          <p className="text-2xl font-bold text-gray-900">{recent14d.length}</p>
        </div>
      </div>

      {/* Weekly Summary Chart (simple text list) */}
      {weekly42d.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">近6周训练量</h3>
          <div className="space-y-2">
            {weekly42d.map((week: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-center gap-3 text-xs text-gray-600">
                <span className="w-20 truncate">
                  {String(week.week_start || '').slice(0, 10)}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, (Number(week.tss || 0) / 800) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-12 text-right">
                  TSS {String(week.tss || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">训练目标</h3>
          <div className="space-y-2">
            {goals.map((goal: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {String(goal.type || '')}: {String(goal.target || '')}{String(goal.unit || '')}
                </span>
                <span className="text-gray-400 text-xs">
                  {String(goal.progress || 0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile && Object.keys(profile).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">运动员档案</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(profile).slice(0, 6).map(([key, value]) => (
              <div key={key} className="text-gray-600">
                <span className="text-gray-400">{key}: </span>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}