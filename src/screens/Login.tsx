import { useState } from 'react'
import { loginWithCode } from '../supabase/auth'

const API_URL = 'https://pulka-api-178-154-204-13.sslip.io'

async function testConnection(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.2a5F_ptyl3Cs2az7K8NF-KhCc5xi8f74nBfZkYm_Xao',
      },
    })
    return `✓ Сервер отвечает: HTTP ${res.status}`
  } catch (err: any) {
    return `✗ Не удалось соединиться: ${err?.message ?? err}. Причина: провайдер/VPN/расширение блокирует домен pulka-api-178-154-204-13.sslip.io.`
  }
}

interface Props {
  onSkip: () => void
}

export function Login({ onSkip }: Props) {
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diag, setDiag] = useState<string | null>(null)

  const runDiag = async () => {
    setDiag('Проверяю...')
    const result = await testConnection()
    setDiag(result)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      await loginWithCode(code)
    } catch (err: any) {
      const msg = err?.message ?? 'Ошибка входа'
      // Понятное описание типовых ошибок
      let hint = ''
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        hint =
          ' — не удалось связаться с сервером. Проверь интернет; если работает — обнови страницу (Ctrl+Shift+R).'
      } else if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
        hint = ' — неверное кодовое слово (или под ним ещё нет партий)'
      }
      setError(msg + hint)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Людочка</h1>
        <p className="text-slate-400 text-center mb-8 text-sm">
          Введи кодовое слово. Одно и то же слово на всех устройствах даёт доступ к одним и тем же партиям.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Кодовое слово</label>
            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                placeholder="Придумай или введи своё"
                required
                className="w-full px-4 py-3 pr-14 bg-slate-900 border border-slate-700 rounded-lg text-lg focus:outline-none focus:border-yellow-500"
              />
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm text-slate-400 hover:text-white"
                tabIndex={-1}
              >
                {showCode ? '🙈' : '👁'}
              </button>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Если вводишь впервые — под этим словом создастся новая коллекция игр. Если такое слово уже
              использовано (тобой или кем-то ещё) — увидишь общие партии.
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-lg"
          >
            {busy ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-700 text-center space-y-3">
          <button
            onClick={runDiag}
            type="button"
            className="text-sm text-slate-400 hover:text-slate-200 underline"
          >
            Проверить связь с сервером
          </button>
          {diag && (
            <div
              className={`text-xs rounded-lg p-2 ${diag.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}
            >
              {diag}
            </div>
          )}
          <div>
            <button onClick={onSkip} className="text-sm text-slate-500 hover:text-slate-300">
              Играть без синхронизации (только на этом устройстве)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
