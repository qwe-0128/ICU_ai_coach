import { useState } from 'react'
import { previewWorkoutEdit, applyWorkoutEdit } from '../lib/api'
import type { WorkoutPreview } from '../lib/api'

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
      setApplyMsg(
        `✅ 课程已${preview.action === 'delete' ? '删除' : preview.action === 'create' ? '创建' : '更新'} (ID: ${result.workout_id})`
      )
      setPreview(null)
      setDescription('')
    } catch (err) {
      setApplyMsg(`❌ 应用失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">
          AI课程编辑
        </h2>
        <p className="text-xs text-gray-400 mb-3">
          描述你想要创建、修改或删除的训练课程。AI将自动生成课程预览，确认后应用到interval.icu。
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={'示例:\n创建周三的一个2小时耐力骑行，心率控制在Z2区\n或者: 删除明天的早间训练课程'}
          rows={4}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
        />
        <button
          onClick={handlePreview}
          disabled={!description.trim() || isLoading}
          className="mt-3 w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? '生成预览中...' : '生成课程预览'}
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              preview.action === 'create' ? 'bg-green-100 text-green-700' :
              preview.action === 'update' ? 'bg-blue-100 text-blue-700' :
              'bg-red-100 text-red-700'
            }`}>
              {preview.action === 'create' ? '新建' : preview.action === 'update' ? '更新' : '删除'}
            </span>
            <h3 className="font-semibold text-gray-900 text-sm">课程预览</h3>
          </div>
          <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{preview.summary}</p>
          {preview.workout_data && (
            <pre className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 overflow-x-auto max-h-48">
              {JSON.stringify(preview.workout_data, null, 2)}
            </pre>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleApply}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors"
            >
              应用到interval.icu
            </button>
            <button
              onClick={() => setPreview(null)}
              disabled={isLoading}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Status Message */}
      {applyMsg && (
        <div className={`px-4 py-3 rounded-xl text-sm ${
          applyMsg.startsWith('✅') ? 'bg-green-50 text-green-700' :
          applyMsg.startsWith('❌') ? 'bg-red-50 text-red-700' :
          'bg-gray-50 text-gray-600'
        }`}>
          {applyMsg}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="font-semibold text-gray-900 text-sm mb-2">使用说明</h3>
        <ul className="text-xs text-gray-500 space-y-1.5 list-disc list-inside">
          <li>描述训练课程：日期、类型、时长、强度区间、目标心率/功率</li>
          <li>AI将生成符合interval.icu格式的课程数据</li>
          <li>预览确认后才会实际应用到你的训练日历</li>
          <li>建议在对话中先讨论训练计划，再来这里执行</li>
        </ul>
      </div>
    </div>
  )
}