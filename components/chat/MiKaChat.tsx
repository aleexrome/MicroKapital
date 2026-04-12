'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send, Bot, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTED = [
  '¿Qué es un crédito Solidario?',
  '¿Cómo se calcula el pago semanal?',
  '¿Qué significa el score del cliente?',
  '¿Cuál es el flujo para aprobar un crédito?',
]

export function MiKaChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: '¡Hola! Soy **MiKa**, tu asistente de MicroKapital. Puedo ayudarte a entender cómo funciona la plataforma, qué significa cada término y cómo se calculan los créditos. ¿En qué te puedo ayudar?',
      }])
    }
  }, [open, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) throw new Error('Error en la respuesta')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setMessages([...newMessages, { role: 'assistant', content: full }])
      }
    } catch {
      setMessages([...newMessages, {
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu pregunta. Por favor intenta de nuevo.',
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Simple markdown: **bold** and line breaks
  function renderText(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      return part.split('\n').map((line, j, arr) => (
        <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
      ))
    })
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-8 z-50 flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white rounded-full px-4 py-3 shadow-lg transition-all hover:scale-105"
          style={{ boxShadow: '0 4px 20px rgba(249,115,22,0.5)' }}
          aria-label="Abrir MiKa"
        >
          <Bot className="h-5 w-5" />
          <span className="text-sm font-semibold">MiKa</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-5 right-8 z-50 flex flex-col w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-4rem)] rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: '#181727', border: '2px solid #f97316', boxShadow: '0 0 24px rgba(249,115,22,0.35), 0 8px 32px rgba(0,0,0,0.6)' }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ background: '#1E1B3A', borderBottom: '1px solid #252440' }}
          >
            <div className="bg-orange-500/20 rounded-full p-1.5">
              <Bot className="h-4 w-4 text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-white">MiKa</p>
              <p className="text-xs" style={{ color: '#A898FF' }}>Asistente de MicroKapital</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg transition-colors text-white/60 hover:text-white hover:bg-white/10"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'assistant' && (
                  <div
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                    style={{ background: '#252440' }}
                  >
                    <Bot className="h-3.5 w-3.5 text-orange-400" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'rounded-tr-sm text-white'
                      : 'rounded-tl-sm text-white'
                  )}
                  style={
                    msg.role === 'user'
                      ? { background: '#7B6FFF' }
                      : { background: '#252440', color: '#E6E4F8' }
                  }
                >
                  {msg.content
                    ? renderText(msg.content)
                    : <Loader2 className="h-3.5 w-3.5 animate-spin opacity-50" />}
                </div>
              </div>
            ))}

            {/* Suggestions (only at start) */}
            {messages.length === 1 && (
              <div className="space-y-1.5 pt-1">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="w-full text-left text-xs px-3 py-2 rounded-xl transition-colors"
                    style={{
                      border: '1px solid #3D3A6B',
                      background: '#252440',
                      color: '#C9BEFF',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#2E2A55' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#252440' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Typing dots */}
            {loading && messages[messages.length - 1]?.content === '' && (
              <div className="flex gap-2 justify-start">
                <div
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: '#252440' }}
                >
                  <Bot className="h-3.5 w-3.5 text-orange-400" />
                </div>
                <div className="rounded-2xl rounded-tl-sm px-3 py-2" style={{ background: '#252440' }}>
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0ms]" style={{ background: '#7B6FFF' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:150ms]" style={{ background: '#7B6FFF' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:300ms]" style={{ background: '#7B6FFF' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="shrink-0 px-3 py-3"
            style={{ borderTop: '1px solid #252440', background: '#111020' }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Escribe tu pregunta..."
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl px-3 py-2 text-sm focus:outline-none disabled:opacity-50 max-h-24 overflow-y-auto placeholder:text-white/30"
                style={{
                  minHeight: '38px',
                  background: '#252440',
                  border: '1px solid #3D3A6B',
                  color: '#E6E4F8',
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#7B6FFF' }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#6A5EE8' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#7B6FFF' }}
                aria-label="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] mt-1.5 text-center" style={{ color: '#5A567A' }}>
              MiKa puede cometer errores. Verifica información importante.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
