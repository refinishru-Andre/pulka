import { useState } from 'react'
import { supabase } from '../supabase/client'

interface Props {
  onSkip: () => void
}

export function Login({ onSkip }: Props) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setError(null)
    try {
      const redirectTo = window.location.origin + window.location.pathname
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      })
      if (err) throw err
      setSent(true)
    } catch (err: any) {
      setError(err.message ?? 'Ошибка отправки')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Пулька</h1>
        <p className="text-slate-400 text-center mb-8">
          Вход через email — партии синхронизируются между устройствами
        </p>

        {sent ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-5 text-center">
              <div className="text-lg font-semibold text-green-400 mb-2">Письмо отправлено</div>
              <div className="text-sm text-slate-300">
                Открой почту <b>{email}</b> и щёлкни ссылку в письме. После этого вернёшься сюда уже
                залогиненным.
              </div>
            </div>
            <button
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
            >
              Отправить на другой email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-lg focus:outline-none focus:border-yellow-500"
              />
            </div>
            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-lg"
            >
              {sending ? 'Отправка...' : 'Получить ссылку на email'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-6 border-t border-slate-700 text-center">
          <button
            onClick={onSkip}
            className="text-sm text-slate-500 hover:text-slate-300"
          >
            Играть без аккаунта (только на этом устройстве)
          </button>
        </div>
      </div>
    </div>
  )
}
