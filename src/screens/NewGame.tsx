import { useEffect, useState } from 'react'
import { useGameStore } from '../store/game'
import type { PlayerId } from '../engine/types'
import { PLAYERS } from '../engine/types'
import { fetchPeople, upsertPerson, importFromGames, type Person } from '../supabase/people'
import { fetchGames } from '../supabase/sync'
import { supabase } from '../supabase/client'

interface Props {
  onCancel?: () => void
  onCreated?: () => void
}

export function NewGame({ onCancel, onCreated }: Props = {}) {
  const newGame = useGameStore((s) => s.newGame)
  const [selectedIds, setSelectedIds] = useState<Record<PlayerId, string>>({ A: '', B: '', C: '' })
  const [poolLimit, setPoolLimit] = useState(21)
  const [firstHand, setFirstHand] = useState<PlayerId>('A')
  const [people, setPeople] = useState<Person[]>([])
  const [showAddFor, setShowAddFor] = useState<PlayerId | null>(null)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [isCloud, setIsCloud] = useState(false)

  // Загрузка справочника + автоимпорт из существующих партий если пусто
  useEffect(() => {
    ;(async () => {
      const user = (await supabase.auth.getUser()).data.user
      setIsCloud(!!user)
      if (!user) {
        setLoading(false)
        return
      }
      let list = await fetchPeople()
      if (list.length === 0) {
        // Первый заход — вытаскиваем имена из уже сыгранных партий
        const games = await fetchGames()
        if (games.length > 0) {
          await importFromGames(games.map((g) => ({ players: g.game.players })))
          list = await fetchPeople()
        }
      }
      setPeople(list)
      setLoading(false)
    })()
  }, [])

  const selectedName = (p: PlayerId): string =>
    people.find((pers) => pers.id === selectedIds[p])?.name ?? ''

  const otherSelected = (p: PlayerId): string[] =>
    PLAYERS.filter((x) => x !== p)
      .map((x) => selectedIds[x])
      .filter(Boolean)

  const canStart = PLAYERS.every((p) => !!selectedIds[p])

  const handleStart = () => {
    if (!canStart) return
    newGame({
      players: {
        A: selectedName('A'),
        B: selectedName('B'),
        C: selectedName('C'),
      },
      poolLimit,
      firstHand,
    })
    onCreated?.()
  }

  const handleAddNew = async () => {
    if (!newName.trim() || !showAddFor) return
    const person = await upsertPerson(newName)
    if (person) {
      setPeople((prev) =>
        prev.some((p) => p.id === person.id) ? prev : [...prev, person].sort((a, b) => a.name.localeCompare(b.name)),
      )
      setSelectedIds({ ...selectedIds, [showAddFor]: person.id })
      setNewName('')
      setShowAddFor(null)
    }
  }

  // Гостевой режим (без облака) — по-старому, поля ввода
  if (!isCloud && !loading) {
    return (
      <GuestNewGame
        newGame={newGame}
        onCancel={onCancel}
        onCreated={onCreated}
        poolLimit={poolLimit}
        setPoolLimit={setPoolLimit}
        firstHand={firstHand}
        setFirstHand={setFirstHand}
      />
    )
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Загрузка...</div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Людочка</h1>
        <p className="text-slate-400 text-center mb-8">Питер · 3 игрока</p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-slate-300 mb-3">
              Игроки (по часовой стрелке за столом)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {PLAYERS.map((p, idx) => {
                const excluded = otherSelected(p)
                const available = people.filter((pers) => !excluded.includes(pers.id))
                return (
                  <div key={p}>
                    <div className="text-xs text-slate-500 mb-1">Место {idx + 1}</div>
                    <select
                      value={selectedIds[p]}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setShowAddFor(p)
                          setNewName('')
                        } else {
                          setSelectedIds({ ...selectedIds, [p]: e.target.value })
                        }
                      }}
                      className="w-full px-3 py-3 bg-slate-900 border border-slate-700 rounded-lg text-base focus:outline-none focus:border-yellow-500"
                    >
                      <option value="">— выбрать —</option>
                      {available.map((pers) => (
                        <option key={pers.id} value={pers.id}>
                          {pers.name}
                        </option>
                      ))}
                      <option value="__new__">+ Новый игрок</option>
                    </select>
                  </div>
                )
              })}
            </div>
            {people.length === 0 && (
              <div className="text-xs text-slate-500 mt-2">
                В справочнике пока никого нет — добавь игроков через «+ Новый игрок»
              </div>
            )}
          </div>

          {/* Диалог добавления нового игрока */}
          {showAddFor && (
            <div className="bg-slate-900 border border-yellow-500/30 rounded-lg p-4 space-y-2">
              <div className="text-sm text-slate-300">Новый игрок на место {PLAYERS.indexOf(showAddFor) + 1}</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNew()}
                  placeholder="Имя игрока"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-yellow-500"
                />
                <button
                  onClick={handleAddNew}
                  disabled={!newName.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 rounded-lg font-semibold"
                >
                  Добавить
                </button>
                <button
                  onClick={() => {
                    setShowAddFor(null)
                    setNewName('')
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

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
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-3">Кто на первой руке в первой сдаче</label>
            <div className="grid grid-cols-3 gap-2">
              {PLAYERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setFirstHand(p)}
                  disabled={!selectedIds[p]}
                  className={`py-3 rounded-lg font-semibold transition ${
                    firstHand === p
                      ? 'bg-yellow-500 text-slate-900'
                      : 'bg-slate-900 border border-slate-700 hover:border-slate-500 disabled:opacity-40'
                  }`}
                >
                  {selectedName(p) || `Игрок ${PLAYERS.indexOf(p) + 1}`}
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

// Гостевой режим — старая версия с обычными полями ввода
function GuestNewGame({
  newGame,
  onCancel,
  onCreated,
  poolLimit,
  setPoolLimit,
  firstHand,
  setFirstHand,
}: {
  newGame: ReturnType<typeof useGameStore.getState>['newGame']
  onCancel?: () => void
  onCreated?: () => void
  poolLimit: number
  setPoolLimit: (n: number) => void
  firstHand: PlayerId
  setFirstHand: (p: PlayerId) => void
}) {
  const [names, setNames] = useState<Record<PlayerId, string>>({ A: '', B: '', C: '' })
  const canStart = PLAYERS.every((p) => names[p].trim().length > 0)

  const handleStart = () => {
    if (!canStart) return
    newGame({
      players: { A: names.A.trim(), B: names.B.trim(), C: names.C.trim() },
      poolLimit,
      firstHand,
    })
    onCreated?.()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Людочка</h1>
        <p className="text-slate-400 text-center mb-8">Гостевой режим (без синхронизации)</p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-slate-300 mb-3">Имена игроков</label>
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
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-3">Кто на первой руке</label>
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
              <button onClick={onCancel} className="px-6 py-4 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-lg">
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
