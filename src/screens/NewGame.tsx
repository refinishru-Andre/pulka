import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../store/game'
import type { PlayerId, Seats } from '../engine/types'
import { ALL_PLAYERS } from '../engine/types'
import type { Rules } from '../engine/conventions'
import { PRESETS, HOME_RULES } from '../engine/conventions'
import { fetchPeople, upsertPerson, importFromGames, type Person } from '../supabase/people'
import { fetchGames } from '../supabase/sync'
import { supabase } from '../supabase/client'

interface Props {
  onCancel?: () => void
  onCreated?: () => void
}

const POOL_CHOICES: (number | null)[] = [10, 11, 20, 21, null]
const poolLabel = (n: number | null) => (n === null ? 'без предела' : String(n))

// ============================================================================
// Общие блоки настроек — одинаковы и в облачном режиме, и в гостевом
// ============================================================================

function SeatCountPicker({
  seatCount,
  setSeatCount,
}: {
  seatCount: 3 | 4
  setSeatCount: (n: 3 | 4) => void
}) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-3">Сколько игроков</label>
      <div className="grid grid-cols-2 gap-2">
        {([3, 4] as const).map((n) => (
          <button
            key={n}
            onClick={() => setSeatCount(n)}
            className={`py-3 rounded-lg font-semibold text-lg transition ${
              seatCount === n
                ? 'bg-yellow-500 text-slate-900'
                : 'bg-slate-900 border border-slate-700 hover:border-slate-500'
            }`}
          >
            {n === 3 ? 'Втроём' : 'Вчетвером'}
          </button>
        ))}
      </div>
      {seatCount === 4 && (
        <div className="text-xs text-slate-500 mt-2">
          Сдающий сдачу пропускает: играют трое, он вступает только на распасах.
        </div>
      )}
    </div>
  )
}

function RulesPicker({
  presetId,
  setPresetId,
}: {
  presetId: string
  setPresetId: (id: string) => void
}) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-3">
        Правила <span className="text-slate-500">— выбираются один раз, в игре не меняются</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((r) => (
          <button
            key={r.id}
            onClick={() => setPresetId(r.id)}
            className={`py-3 px-2 rounded-lg font-semibold transition ${
              presetId === r.id
                ? 'bg-yellow-500 text-slate-900'
                : 'bg-slate-900 border border-slate-700 hover:border-slate-500'
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// Коротко, чем выбранный набор отличается — чтобы за столом не гадать
function RulesSummary({ rules }: { rules: Rules }) {
  const lines: string[] = []
  lines.push(
    rules.vistStyle === 'gentleman'
      ? 'Вист джентльменский: если один пасовал, висты делятся поровну'
      : 'Вист жлобский: пасовавший не получает ничего',
  )
  lines.push(
    rules.raspasWriteEveryTrick
      ? 'Распасы: в гору за каждую свою взятку'
      : 'Распасы: у взявшего меньше всех взятки не пишутся',
  )
  lines.push(
    `Выход из распасов: минимум ${rules.minBidLadder.join('-')}${
      rules.minBidLadder.length > 1 ? ' и дальше так же' : ''
    }`,
  )
  if (rules.prikupBonus) lines.push('Есть премия за быстрые взятки в прикупе')
  if (!rules.allowGiveup) lines.push('Уход без трёх запрещён')
  if (!rules.misereBreaksRaspas) lines.push('Мизер распасы не гасит')
  if (rules.vistersDuty[10] > 0) lines.push('Десятерная вистуется')

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 space-y-1">
      {lines.map((l) => (
        <div key={l}>· {l}</div>
      ))}
    </div>
  )
}

function PoolLimitPicker({
  poolLimit,
  setPoolLimit,
}: {
  poolLimit: number | null
  setPoolLimit: (n: number | null) => void
}) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-3">Размер пули</label>
      <div className="grid grid-cols-5 gap-2">
        {POOL_CHOICES.map((n) => (
          <button
            key={String(n)}
            onClick={() => setPoolLimit(n)}
            className={`py-3 rounded-lg font-semibold transition ${
              n === null ? 'text-sm' : 'text-lg'
            } ${
              poolLimit === n
                ? 'bg-yellow-500 text-slate-900'
                : 'bg-slate-900 border border-slate-700 hover:border-slate-500'
            }`}
          >
            {poolLabel(n)}
          </button>
        ))}
      </div>
      {poolLimit === null && (
        <div className="text-xs text-slate-500 mt-2">
          Партия не закончится сама — играете сколько нужно и жмёте «Рассчитать партию».
        </div>
      )}
    </div>
  )
}

function FirstHandPicker({
  seats,
  firstHand,
  setFirstHand,
  nameOf,
}: {
  seats: Seats
  firstHand: PlayerId
  setFirstHand: (p: PlayerId) => void
  nameOf: (p: PlayerId) => string
}) {
  return (
    <div>
      <label className="block text-sm text-slate-300 mb-3">Кто на первой руке в первой сдаче</label>
      <div className={`grid gap-2 ${seats.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {seats.map((p, idx) => (
          <button
            key={p}
            onClick={() => setFirstHand(p)}
            disabled={!nameOf(p)}
            className={`py-3 px-1 rounded-lg font-semibold transition truncate ${
              firstHand === p
                ? 'bg-yellow-500 text-slate-900'
                : 'bg-slate-900 border border-slate-700 hover:border-slate-500 disabled:opacity-40'
            }`}
          >
            {nameOf(p) || `Игрок ${idx + 1}`}
          </button>
        ))}
      </div>
    </div>
  )
}

function StartButtons({
  canStart,
  onCancel,
  onStart,
}: {
  canStart: boolean
  onCancel?: () => void
  onStart: () => void
}) {
  return (
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
        onClick={onStart}
        disabled={!canStart}
        className="flex-1 py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-xl transition"
      >
        Начать игру
      </button>
    </div>
  )
}

// Общие настройки партии: состав, правила, пуля, первая рука.
// Живут в одном хуке, чтобы облачный и гостевой режимы не разъезжались.
function useGameSetup() {
  const [seatCount, setSeatCount] = useState<3 | 4>(3)
  const [presetId, setPresetId] = useState<string>(HOME_RULES.id)
  const [poolLimit, setPoolLimit] = useState<number | null>(HOME_RULES.poolLimit)
  const [firstHand, setFirstHand] = useState<PlayerId>('A')

  const seats = useMemo<Seats>(() => ALL_PLAYERS.slice(0, seatCount), [seatCount])
  const rules = useMemo(() => PRESETS.find((r) => r.id === presetId) ?? HOME_RULES, [presetId])

  // Сменили набор правил — подставляем его размер пули. Поменять можно вручную.
  const choosePreset = (id: string) => {
    setPresetId(id)
    const preset = PRESETS.find((r) => r.id === id)
    if (preset) setPoolLimit(preset.poolLimit)
  }

  // Ушли с четверых на троих — четвёртое место больше не может быть первой рукой
  const chooseSeatCount = (n: 3 | 4) => {
    setSeatCount(n)
    if (n === 3 && firstHand === 'D') setFirstHand('A')
  }

  return {
    seatCount,
    setSeatCount: chooseSeatCount,
    seats,
    presetId,
    setPresetId: choosePreset,
    rules,
    poolLimit,
    setPoolLimit,
    firstHand,
    setFirstHand,
  }
}

// Имена на все четыре места: незанятое место — пустая строка
function namesRecord(seats: Seats, nameOf: (p: PlayerId) => string): Record<PlayerId, string> {
  const out = { A: '', B: '', C: '', D: '' } as Record<PlayerId, string>
  seats.forEach((p) => (out[p] = nameOf(p)))
  return out
}

// ============================================================================
// ОСНОВНОЙ ЭКРАН
// ============================================================================

export function NewGame({ onCancel, onCreated }: Props = {}) {
  const newGame = useGameStore((s) => s.newGame)
  const setup = useGameSetup()
  const [selectedIds, setSelectedIds] = useState<Record<PlayerId, string>>({
    A: '',
    B: '',
    C: '',
    D: '',
  })
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
    setup.seats
      .filter((x) => x !== p)
      .map((x) => selectedIds[x])
      .filter(Boolean)

  const canStart = setup.seats.every((p) => !!selectedIds[p])

  const handleStart = () => {
    if (!canStart) return
    newGame({
      players: namesRecord(setup.seats, selectedName),
      seats: setup.seats,
      rules: setup.rules,
      poolLimit: setup.poolLimit,
      firstHand: setup.firstHand,
    })
    onCreated?.()
  }

  const handleAddNew = async () => {
    if (!newName.trim() || !showAddFor) return
    const person = await upsertPerson(newName)
    if (person) {
      setPeople((prev) =>
        prev.some((p) => p.id === person.id)
          ? prev
          : [...prev, person].sort((a, b) => a.name.localeCompare(b.name)),
      )
      setSelectedIds({ ...selectedIds, [showAddFor]: person.id })
      setNewName('')
      setShowAddFor(null)
    }
  }

  // Гостевой режим (без облака) — поля ввода вместо справочника
  if (!isCloud && !loading) {
    return <GuestNewGame newGame={newGame} onCancel={onCancel} onCreated={onCreated} />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">Загрузка...</div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Людочка</h1>
        <p className="text-slate-400 text-center mb-8">
          {setup.rules.name} · {setup.seatCount === 3 ? 'втроём' : 'вчетвером'}
        </p>

        <div className="space-y-6">
          <SeatCountPicker seatCount={setup.seatCount} setSeatCount={setup.setSeatCount} />

          <div>
            <label className="block text-sm text-slate-300 mb-3">
              Игроки (по часовой стрелке за столом)
            </label>
            <div className={`grid gap-3 ${setup.seatCount === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {setup.seats.map((p, idx) => {
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
              <div className="text-sm text-slate-300">
                Новый игрок на место {setup.seats.indexOf(showAddFor) + 1}
              </div>
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

          <RulesPicker presetId={setup.presetId} setPresetId={setup.setPresetId} />
          <RulesSummary rules={setup.rules} />
          <PoolLimitPicker poolLimit={setup.poolLimit} setPoolLimit={setup.setPoolLimit} />
          <FirstHandPicker
            seats={setup.seats}
            firstHand={setup.firstHand}
            setFirstHand={setup.setFirstHand}
            nameOf={selectedName}
          />
          <StartButtons canStart={canStart} onCancel={onCancel} onStart={handleStart} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ГОСТЕВОЙ РЕЖИМ — без облака, имена вводятся руками
// ============================================================================

function GuestNewGame({
  newGame,
  onCancel,
  onCreated,
}: {
  newGame: ReturnType<typeof useGameStore.getState>['newGame']
  onCancel?: () => void
  onCreated?: () => void
}) {
  const setup = useGameSetup()
  const [names, setNames] = useState<Record<PlayerId, string>>({ A: '', B: '', C: '', D: '' })

  const nameOf = (p: PlayerId) => names[p].trim()
  const canStart = setup.seats.every((p) => nameOf(p).length > 0)

  const handleStart = () => {
    if (!canStart) return
    newGame({
      players: namesRecord(setup.seats, nameOf),
      seats: setup.seats,
      rules: setup.rules,
      poolLimit: setup.poolLimit,
      firstHand: setup.firstHand,
    })
    onCreated?.()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Людочка</h1>
        <p className="text-slate-400 text-center mb-8">Гостевой режим (без синхронизации)</p>

        <div className="space-y-6">
          <SeatCountPicker seatCount={setup.seatCount} setSeatCount={setup.setSeatCount} />

          <div>
            <label className="block text-sm text-slate-300 mb-3">Имена игроков</label>
            <div className={`grid gap-3 ${setup.seatCount === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {setup.seats.map((p, idx) => (
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

          <RulesPicker presetId={setup.presetId} setPresetId={setup.setPresetId} />
          <RulesSummary rules={setup.rules} />
          <PoolLimitPicker poolLimit={setup.poolLimit} setPoolLimit={setup.setPoolLimit} />
          <FirstHandPicker
            seats={setup.seats}
            firstHand={setup.firstHand}
            setFirstHand={setup.setFirstHand}
            nameOf={nameOf}
          />
          <StartButtons canStart={canStart} onCancel={onCancel} onStart={handleStart} />
        </div>
      </div>
    </div>
  )
}
