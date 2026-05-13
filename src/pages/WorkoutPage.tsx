import { useState } from 'react'
import { previewWorkoutEdit, applyWorkoutEdit } from '../lib/api'
import type { WorkoutPreview } from '../lib/api'
import { Markdown } from '../components/Markdown'

export function WorkoutPage() {
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [preview, setPreview] = useState<WorkoutPreview | null>(null)
  const [applyMsg, setApplyMsg] = useState('')
  const [sessionId] = useState(() => localStorage.getItem('icu_chat_session') || '')

  const handlePreview = async () => {
    const text = description.trim()
    if (!text || isLoading) return
    setIsLoading(true)
    setPreview(null)
    setApplyMsg('')

    try {
      const result = await previewWorkoutEdit(text, sessionId)
      setPreview(result)
    } catch (err) {
      setApplyMsg(`错误: ${err instanceof Error ? err.message : '生成失败'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleApply = async () => {
    if (!preview) return
    setIsLoading(true)
    setApplyMsg('')
    try {
      const result = await applyWorkoutEdit(
        preview.workout_id || '',
        preview.workout_data || {},
        preview.action
      )
      setApplyMsg(`✅ 已推送到 interval.icu！课程 ID: ${result.workout_id}`)
      setPreview(null)
    } catch (err) {
      setApplyMsg(`错误: ${err instanceof Error ? err.message : '提交失败'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const actionLabel = (action: string) => {
    switch (action) {
      case 'create': return '🆕 新建课程'
      case 'update': return '✏️ 修改课程'
      case 'delete': return '🗑️ 删除课程'
      default: return action
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text mb-2">✏️ AI 课程编辑</h2>
        <p className="text-text-muted text-sm">
          描述你想要创建或修改的训练课程，AI 会生成预览并提供确认。
        </p>
      </div>

      {/* Input */}
      <div className="space-y-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例如：帮我做一个周末长途耐力训练，包含 L2 热身、L3 节奏、最后冲刺..."
          rows={4}
          disabled={isLoading}
          className="w-full px-4 py-3 bg-bg border border-surface-light rounded-xl text-text text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-text-muted resize-none disabled:opacity-50"
        />
        <button
          onClick={handlePreview}
          disabled={!description.trim() || isLoading}
          className="w-full py-3 bg-accent text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:bg-surface-light disabled:text-text-muted disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? '正在生成...' : '🔍 预览课程'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-surface border border-surface-light rounded-2xl p-8 flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-3 border-primary border-t-transparent rounded-full" />
          <p className="text-text-muted text-sm">AI 正在分析并生成训练课程...</p>
        </div>
      )}

      {/* Apply Msg */}
      {applyMsg && (
        <div className={`p-4 rounded-xl text-sm ${applyMsg.startsWith('错误') ? 'bg-red-500/10 border border-danger/30 text-danger' : 'bg-green-500/10 border border-success/30 text-success'}`}>
          {applyMsg}
        </div>
      )}

      {/* Preview */}
      {preview && !isLoading && (
        <div className="bg-surface border border-surface-light rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text">📋 课程预览</h3>
            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">
              {actionLabel(preview.action)}
            </span>
          </div>

          {preview.workout_id && (
            <div className="text-xs text-text-muted">
              目标课程 ID: <code className="bg-bg px-1.5 py-0.5 rounded text-primary">{preview.workout_id}</code>
            </div>
          )}

          {preview.workout_data && Object.keys(preview.workout_data).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                📦 课程数据
              </h4>
              <pre className="bg-bg rounded-lg p-3 text-xs text-text-muted overflow-x-auto max-h-64">
                {JSON.stringify(preview.workout_data, null, 2)}
              </pre>
            </div>
          )}

          {preview.summary && (
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">📝 AI 摘要</h4>
              <div className="text-text text-sm">
                <Markdown content={preview.summary} />
              </div>
            </div>
          )}

          <button
            onClick={handleApply}
            disabled={isLoading}
            className="w-full py-3 bg-success text-white rounded-xl text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ✅ 确认并推送到 interval.icu
          </button>
        </div>
      )}
    </div>
  )
}