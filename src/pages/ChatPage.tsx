import { useState, useRef, useEffect, useCallback } from 'react'
import { sendChat, clearChatHistory } from '../lib/api'
import type { ChatMessage } from '../lib/api'
import { Markdown } from '../components/Markdown'

interface UIMessage extends ChatMessage {
  id: string
  tokens?: string
}

export function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>(() => {
    try {
      const saved = localStorage.getItem('icu_chat_messages')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string>(() =>
    localStorage.getItem('icu_chat_session') || ''
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Save messages to localStorage
  useEffect(() => {
    localStorage.setItem('icu_chat_messages', JSON.stringify(messages.slice(-100)))
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: UIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const response = await sendChat(text, sessionId)
      if (response.session_id) {
        setSessionId(response.session_id)
        localStorage.setItem('icu_chat_session', response.session_id)
      }

      const aiMsg: UIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.reply,
        tokens: `Token: ${response.tokens_used} | 记忆: ${response.memories_retrieved}条`,
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch (err) {
      const errMsg: UIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 错误: ${err instanceof Error ? err.message : '请求失败'}`,
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [input, isLoading, sessionId])

  const getQuickActions = () => [
    '分析我近一周的训练状态',
    '我该休息还是继续训练？',
    '帮我制定下一周的训练计划',
  ]

  const handleClear = async () => {
    if (sessionId && confirm('确定要清除当前对话历史吗？')) {
      try {
        await clearChatHistory(sessionId)
      } catch { /* ignore */ }
    }
    setMessages([])
    setSessionId('')
    localStorage.removeItem('icu_chat_session')
    localStorage.removeItem('icu_chat_messages')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-12">
            <div className="text-5xl mb-3">🤖</div>
            <p className="text-sm">开始和你的AI教练对话吧</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {getQuickActions().map((action, i) => (
                <button
                  key={i}
                  onClick={() => setInput(action)}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-white border border-gray-100 text-gray-800 rounded-bl-md shadow-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                <Markdown content={msg.content} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              {msg.tokens && (
                <p className="text-[10px] text-gray-400 mt-1">{msg.tokens}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.1s]" />
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-gray-50 pt-2">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex items-end gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            发送
          </button>
        </form>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-gray-400 hover:text-red-500 mt-2 transition-colors"
          >
            清除对话
          </button>
        )}
      </div>
    </div>
  )
}