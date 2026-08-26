import { useEffect, useState } from 'react'
import { fetchGamesResult, deleteGame, uploadGame } from '../supabase/sync'
import { supabase } from '../supabase/client'
import { useGameStore } from '../store/game'
import {
  listOrphans,
  dropOrphan,
  dropSynced,
  isMissingFromCloud,
  type Orphan,
} from '../store/orphans'
import { importFromGames } from '../supabase/people'
import { getCodeHint, clearCodeHint } from '../supabase/auth'
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
  const [orphans, setOrphans] = useState<Orphan[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // id партии → сколько сдач лежит в облаке (для подписи «здесь 10, в облаке 5»)
  const [cloudDeals, setCloudDeals] = useState<Map<string, number>>(new Map())
  const loadGame = useGameStore((s) => s.loadGame)
  const codeHint = getCodeHint()

  // Партии, которых в облаке нет ВООБЩЕ или которые лежат там в урезанном виде:
  // играли без входа, либо связь оборвалась посреди партии и часть сдач не уехала.
  // Сверяем по числу сдач — id совпадает и у неполной облачной копии.
  const collectOrphans = (cloudDeals: Map<string, number>): Orphan[] => {
    dropSynced(cloudDeals)
    const missing = (id: string, deals: number) => isMissingFromCloud(deals, cloudDeals.get(id))
    const found = listOrphans().filter((o) => missing(o.id, o.game.deals.length))
    const { game, gameId } = useGameStore.getState()
    if (
      gameId &&
      game &&
      game.deals.length > 0 &&
      missing(gameId, game.deals.length) &&
      !found.some((o) => o.id === gameId)
    ) {
      found.push({ id: gameId, game, savedAt: game.createdAt })
    }
    return found.sort((a, b) => b.savedAt - a.savedAt)
  }

  const refresh = async () => {
    setLoading(true)
    const res = await fetchGamesResult()
    setGames(res.items)
    // Считаем «потеряшки» только когда облако реально ответило
    if (res.ok) {
      const cloudDeals = new Map(res.items.map((g) => [g.id, g.game.deals.length]))
      setCloudDeals(cloudDeals)
      setOrphans(collectOrphans(cloudDeals))
    }
    setLoading(false)
  }

  // Загрузить локальную партию в облако + завести её игроков в справочник.
  // Из запаса убираем ТОЛЬКО после подтверждённой записи — иначе неудачная
  // загрузка стирала единственную копию партии.
  const handleUploadOrphan = async (o: Orphan) => {
    setBusyId(o.id)
    setUploadError(null)
    try {
      await importFromGames([{ players: o.game.players }])
      const result = await uploadGame(o.id, o.game)
      if (result === 'ok') {
        dropOrphan(o.id)
        await refresh()
      } else {
        setUploadError(
          result === 'guest'
            ? 'Не получилось: вы не вошли в коллекцию. Партия осталась на устройстве.'
            : 'Не получилось записать в облако — нет связи с сервером. Партия осталась на устройстве, попробуйте ещё раз позже.',
        )
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleDropOrphan = (o: Orphan) => {
    if (!confirm('Удалить эту локальную партию без сохранения? Восстановить будет нельзя.')) return
    dropOrphan(o.id)
    // Если это текущая открытая партия — её мало убрать из запаса, иначе она
    // вернётся в список при следующем обновлении.
    if (useGameStore.getState().gameId === o.id) useGameStore.getState().discardGame()
    setOrphans((prev) => prev.filter((x) => x.id !== o.id))
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
    clearCodeHint()
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
              <div className="text-sm text-green-400 mt-1 flex items-center gap-1 flex-wrap">
                <span>●</span>
                <span>Синхронизировано с облаком</span>
                {codeHint && (
                  <span className="text-slate-400">
                    · коллекция «<span className="text-slate-200">{codeHint}</span>»
                  </span>
                )}
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

        {orphans.length > 0 && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/40 rounded-2xl p-5">
            <div className="text-lg font-bold text-yellow-300 mb-1">
              Есть партии только на этом устройстве
            </div>
            <div className="text-sm text-yellow-100/70 mb-4">
              Они записались, когда не было входа или связи. В облаке их нет совсем или есть не
              все сдачи — нажми «Загрузить в облако».
            </div>
            {uploadError && (
              <div className="mb-4 px-4 py-3 bg-red-500/15 border border-red-500/40 rounded-xl text-sm text-red-200">
                {uploadError}
              </div>
            )}
            <div className="space-y-3">
              {orphans.map((o) => (
                <div
                  key={o.id}
                  className="bg-slate-800 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div>
                    <div className="font-bold">{PLAYERS.map((p) => o.game.players[p]).join(' · ')}</div>
                    <div className="text-sm text-slate-400">
                      Пуля до {o.game.poolLimit} · сдач: {o.game.deals.length} ·{' '}
                      {new Date(o.game.createdAt).toLocaleString('ru')}
                    </div>
                    {cloudDeals.has(o.id) && (
                      <div className="text-sm text-yellow-300 mt-1">
                        В облаке только {cloudDeals.get(o.id)} — не хватает{' '}
                        {o.game.deals.length - (cloudDeals.get(o.id) ?? 0)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUploadOrphan(o)}
                      disabled={busyId === o.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 rounded-lg font-semibold"
                    >
                      {busyId === o.id ? 'Загружаю...' : 'Загрузить в облако'}
                    </button>
                    <button
                      onClick={() => handleDropOrphan(o)}
                      className="px-3 py-2 bg-slate-700 hover:bg-red-600 rounded-lg text-sm"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
