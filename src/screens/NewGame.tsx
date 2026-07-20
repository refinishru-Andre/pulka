import { useState } from 'react'
import { useGameStore } from '../store/game'
import type { PlayerId } from '../engine/types'
import { PLAYERS } from '../engine/types'

interface Props {
  onCancel?: () => void
  onCreated?: () => void
}

export function NewGame({ onCancel, onCreated }: Props = {}) {
  const newGame = useGameStore((s) => s.newGame)
  const [names, setNames] = useState<Record<PlayerId, string>>({ A: '', B: '', C: '' })
  const [poolLimit, setPoolLimit] = useState(21)
  const [firstHand, setFirstHand] = useState<PlayerId>('A')

  const canStart = PLAYERS.every((p) => names[p].trim().length > 0)

  const handleStart = () => {
    if (!canStart) return
    newGame({
      players: {
        A: names.A.trim(),
        B: names.B.trim(),
        C: names.C.trim(),
      },
      poolLimit,
      firstHand,
    })
    onCreated?.()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Людочка</h1>
        <p className="text-slate-400 text-center mb-8">Питер / ленинградка · 3 игрока</p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-slate-300 mb-3">
              Имена игроков (по часовой стрелке за столом)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {PLAYERS.map((p, idx) => (
                <div key={p}>
                  <div className="text-xs text-slate-500 mb-1">Место {idx + 1}</div>
                  <input
                    type="text"
                    value={names[p]}
                    onChange={(e) => setNames({ ...names, [p]: e.target.value })}
                    placeholder={`Игрок ${idx + 1}`}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-lg focus:outline-none focus:border-yellow-500"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-3">Размер пули</label>
            <div className="grid grid-cols-4 gap-2">
              {[10, 11, 20, 21].map((n) => (
                <button
                  key={n}
                  onClick={() => setPoolLimit(n)}
                  className={`py-3 rounded-lg font-semibold text-lg transition ${
                    poolLimit === n
                      ? 'bg-yellow-500 text-slate-900'
                      : 'bg-slate-900 border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <input
                type="number"
                value={poolLimit}
                onChange={(e) => setPoolLimit(Math.max(1, parseInt(e.target.value) || 21))}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-center"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-3">Кто на первой руке в первой сдаче</label>
            <div className="grid grid-cols-3 gap-2">
              {PLAYERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setFirstHand(p)}
                  disabled={!names[p].trim()}
                  className={`py-3 rounded-lg font-semibold transition ${
                    firstHand === p
                      ? 'bg-yellow-500 text-slate-900'
                      : 'bg-slate-900 border border-slate-700 hover:border-slate-500 disabled:opacity-40'
                  }`}
                >
                  {names[p].trim() || `Игрок ${PLAYERS.indexOf(p) + 1}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-6 py-4 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-lg"
              >
                Отмена
              </button>
            )}
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="flex-1 py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-xl transition"
            >
              Начать игру
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
