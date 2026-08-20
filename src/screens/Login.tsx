import { useState } from 'react'
import { signInWithCode, createCollectionWithCode, AuthError } from '../supabase/auth'

const API_URL = 'https://pulka-api-178-154-204-13.sslip.io'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.2a5F_ptyl3Cs2az7K8NF-KhCc5xi8f74nBfZkYm_Xao'

async function testConnection(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: ANON_KEY },
    })
    return `✓ Сервер отвечает: HTTP ${res.status}`
  } catch (err: any) {
    return `✗ Нет связи с сервером (${err?.message ?? err}). Обычно это интернет: попробуй мобильный вместо Wi-Fi или наоборот.`
  }
}

interface Props {
  onSkip: () => void
}

type Mode = 'signin' | 'create'

export function Login({ onSkip }: Props) {
  const [mode, setMode] = useState<Mode>('signin')
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diag, setDiag] = useState<string | null>(null)

  const runDiag = async () => {
    setDiag('Проверяю...')
    setDiag(await testConnection())
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') {
        await signInWithCode(code)
      } else {
        if (
          !confirm(
            `Создать НОВУЮ пустую коллекцию под словом «${code.trim()}»?\n\n` +
              'Старые партии в ней не появятся — они лежат под своим словом.\n' +
              'Если слово уже существует, просто войдёшь в него.',
          )
        ) {
          setBusy(false)
          return
        }
        await createCollectionWithCode(code)
      }
    } catch (err: any) {
      setError(err instanceof AuthError ? err.message : (err?.message ?? 'Ошибка входа'))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Людочка</h1>
        <p className="text-slate-400 text-center mb-8 text-sm">
          {mode === 'signin'
            ? 'Введи своё кодовое слово. Одно и то же слово на всех устройствах открывает одни и те же партии.'
            : 'Новая коллекция — это чистый лист: свой список игроков, своя статистика.'}
        </p>

        {mode === 'create' && (
          <div className="mb-4 text-sm text-yellow-200 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            Создавай новую коллекцию, только если раньше ничего не записывал. Уже сыгранные партии
            сюда НЕ переедут.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Кодовое слово</label>
            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={mode === 'signin' ? 'Твоё слово' : 'Придумай слово'}
                required
                className="w-full px-4 py-3 pr-14 bg-slate-900 border border-slate-700 rounded-lg text-lg focus:outline-none focus:border-yellow-500"
              />
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm text-slate-400 hover:text-white"
                tabIndex={-1}
                title={showCode ? 'Скрыть' : 'Показать'}
              >
                {showCode ? '🙈' : '👁'}
              </button>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Регистр и пробелы по краям не важны: «Людочка» и «людочка » — одно и то же слово.
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !code.trim()}
            className={`w-full py-4 rounded-lg font-bold text-lg disabled:bg-slate-700 disabled:text-slate-500 ${
              mode === 'signin' ? 'bg-green-600 hover:bg-green-500' : 'bg-yellow-600 hover:bg-yellow-500'
            }`}
          >
            {busy ? 'Секунду...' : mode === 'signin' ? 'Войти' : 'Создать новую коллекцию'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-700 text-center space-y-3">
          {mode === 'signin' ? (
            <button
              onClick={() => switchMode('create')}
              type="button"
              className="text-sm text-slate-400 hover:text-slate-200 underline"
            >
              У меня ещё нет коллекции — создать новую
            </button>
          ) : (
            <button
              onClick={() => switchMode('signin')}
              type="button"
              className="text-sm text-slate-400 hover:text-slate-200 underline"
            >
              ← Назад ко входу
            </button>
          )}

          <div>
            <button
              onClick={runDiag}
              type="button"
              className="text-sm text-slate-500 hover:text-slate-300 underline"
            >
              Проверить связь с сервером
            </button>
          </div>
          {diag && (
            <div
              className={`text-xs rounded-lg p-2 ${diag.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}
            >
              {diag}
            </div>
          )}
          <div>
            <button onClick={onSkip} className="text-sm text-slate-500 hover:text-slate-300">
              Играть без входа (запишется только на этом устройстве)
            </button>
            <div className="text-xs text-slate-600 mt-1">
              Партию потом можно будет загрузить в облако — список партий предложит сам
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
