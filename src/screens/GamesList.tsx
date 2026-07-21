import { useEffect, useState } from 'react'
import { fetchGames, deleteGame } from '../supabase/sync'
import { supabase } from '../supabase/client'
import { useGameStore } from '../store/game'
import { settle } from '../engine'
import type { GameState } from '../engine/types'
import { PLAYERS } from '../engine/types'

interface CloudGameItem {
  id: string
  game: GameState
  finished: boolean
}

interface Props {
  onOpenGame: () => void
  onNewGame: () => void
  onOpenStats: () => void
}

export function GamesList({ onOpenGame, onNewGame, onOpenStats }: Props) {
  const [games, setGames] = useState<CloudGameItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncOk, setSyncOk] = useState(false)
  const loadGame = useGameStore((s) => s.loadGame)

  const refresh = async () => {
    setLoading(true)
    const list = await fetchGames()
    setGames(list)
    setLoading(false)
  }

  useEffect(() => {
    ;(async () => {
      const user = (await supabase.auth.getUser()).data.user
      setSyncOk(!!user)
      await refresh()
    })()
    // Автообновление каждые 15 сек — на случай если игра идёт на другом устройстве
    const interval = window.setInterval(refresh, 15000)
    return () => window.clearInterval(interval)
  }, [])

  const handleOpen = (item: CloudGameItem) => {
    loadGame(item.id, item.game)
    onOpenGame()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить эту партию?')) return
    await deleteGame(id)
    setGames((prev) => prev.filter((g) => g.id !== id))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Мои партии</h1>
            {syncOk && (
              <div className="text-sm text-green-400 mt-1 flex items-center gap-1">
                <span>●</span>
                <span>Синхронизировано с облаком</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={refresh}
              disabled={loading}
              className="px-5 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-base"
              title="Обновить список партий"
            >
              {loading ? '...' : '↻'}
            </button>
            <button
              onClick={onOpenStats}
              className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
            >
              📊 Статистика
            </button>
            <button
              onClick={onNewGame}
              className="px-5 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold"
            >
              + Новая партия
            </button>
            {syncOk && (
              <button
                onClick={handleLogout}
                className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
              >
                Выйти
              </button>
            )}
          </div>
        </div>

        {loading && <div className="text-center text-slate-400 py-10">Загрузка...</div>}

        {!loading && games.length === 0 && (
          <div className="bg-slate-800 rounded-2xl p-10 text-center">
            <div className="text-lg text-slate-300 mb-2">Пока нет ни одной партии</div>
            <div className="text-sm text-slate-500">Нажми «Новая партия» чтобы начать</div>
          </div>
        )}

        {!loading && games.length > 0 && (
          <div className="space-y-3">
            {games.map((item) => {
              const g = item.game
              const settlement = settle(g)
              return (
                <div
                  key={item.id}
                  className="bg-slate-800 rounded-2xl p-5 hover:bg-slate-750 transition"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold">
                          {PLAYERS.map((p) => g.players[p]).join(' · ')}
                        </span>
                        {item.finished ? (
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                            Окончена
                          </span>
                        ) : (
                          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
                            В процессе
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        Пуля до {g.poolLimit} · сдач: {g.deals.length} ·{' '}
                        {new Date(g.createdAt).toLocaleString('ru')}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpen(item)}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
                      >
                        Открыть
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-2 bg-slate-700 hover:bg-red-600 rounded-lg text-sm"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {PLAYERS.map((p) => (
                      <div key={p} className="bg-slate-900 rounded-lg px-3 py-2 text-center">
                        <div className="text-xs text-slate-500 truncate">{g.players[p]}</div>
                        <div
                          className={`text-xl font-bold ${
                            settlement.net[p] > 0
                              ? 'text-green-400'
                              : settlement.net[p] < 0
                                ? 'text-red-400'
                                : 'text-slate-400'
                          }`}
                        >
                          {settlement.net[p] > 0 ? '+' : ''}
                          {settlement.net[p]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
