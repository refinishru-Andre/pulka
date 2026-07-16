import { useState } from 'react'
import { loginWithCode } from '../supabase/auth'

interface Props {
  onSkip: () => void
}

export function Login({ onSkip }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      await loginWithCode(code)
      // onAuthStateChange в App подхватит новую сессию
    } catch (err: any) {
      setError(err?.message ?? 'Ошибка входа')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Пулька</h1>
        <p className="text-slate-400 text-center mb-8 text-sm">
          Введи кодовое слово. Одно и то же слово на всех устройствах даёт доступ к одним и тем же партиям.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Кодовое слово</label>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              placeholder="Придумай или введи своё"
              required
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-lg focus:outline-none focus:border-yellow-500"
            />
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

        <div className="mt-6 pt-6 border-t border-slate-700 text-center">
          <button onClick={onSkip} className="text-sm text-slate-500 hover:text-slate-300">
            Играть без синхронизации (только на этом устройстве)
          </button>
        </div>
      </div>
    </div>
  )
}
