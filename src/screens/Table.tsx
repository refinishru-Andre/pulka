import { useMemo, useState } from 'react'
import { useGameStore } from '../store/game'
import { useSyncStatus } from '../store/sync-status'
import { settle, minBidFor, applyDeal } from '../engine'
import { PLAYERS } from '../engine/types'
import type { PlayerId, GameState } from '../engine/types'
import { DealForm } from './DealForm'

function prevClockwise(p: PlayerId): PlayerId {
  const idx = PLAYERS.indexOf(p)
  return PLAYERS[(idx + PLAYERS.length - 1) % PLAYERS.length]
}

// Вычислить состояние на момент N-й сдачи (для просмотра истории)
function replayTo(game: GameState, upTo: number): GameState {
  const initial: GameState = {
    ...game,
    pool: { A: 0, B: 0, C: 0 },
    mount: { A: 0, B: 0, C: 0 },
    whists: {
      A: { A: 0, B: 0, C: 0 },
      B: { A: 0, B: 0, C: 0 },
      C: { A: 0, B: 0, C: 0 },
    },
    firstHand: game.deals[0]?.firstHand ?? game.firstHand,
    raspasState: 'normal',
    eightRaspasCounter: { A: 0, B: 0, C: 0 },
    deals: [],
    lastDelta: undefined,
  }
  return game.deals.slice(0, upTo).reduce(applyDeal, initial)
}

const RASPAS_LABEL: Record<string, string> = {
  normal: 'Обычная игра · мин 6',
  afterFirst: 'После 1-го распаса · мин 7',
  afterSecond: 'После 2-го распаса · мин 8',
  eightRaspas: '8-мерные распасы · мин 8',
}

// Значок в шапке: доехала ли последняя сдача до облака.
// Показывает состояние ЗАПИСИ, а не факт входа — обрыв связи должен быть виден
// сразу за столом, а не обнаруживаться на следующий день.
function SyncBadge() {
  const state = useSyncStatus((s) => s.state)
  if (state === 'idle') return null
  const view = {
    saving: { text: '◌ сохраняю…', cls: 'text-slate-300' },
    saved: { text: '● записано в облако', cls: 'text-green-400' },
    guest: { text: '● только на этом устройстве', cls: 'text-yellow-400' },
    failed: { text: '▲ НЕ УХОДИТ В ОБЛАКО', cls: 'text-red-400 font-bold' },
  }[state]
  return (
    <>
      <span>·</span>
      <span className={view.cls}>{view.text}</span>
    </>
  )
}

interface Props {
  onBack?: () => void
}

export function Table({ onBack }: Props = {}) {
  const game = useGameStore((s) => s.game)!
  const viewIndex = useGameStore((s) => s.viewIndex)
  const viewPrev = useGameStore((s) => s.viewPrev)
  const viewNext = useGameStore((s) => s.viewNext)
  const viewReset = useGameStore((s) => s.viewReset)
  const deleteLastDeal = useGameStore((s) => s.deleteLastDeal)
  const resetGame = useGameStore((s) => s.resetGame)
  const finishGame = useGameStore((s) => s.finishGame)
  const syncState = useSyncStatus((s) => s.state)
  const [dealFormOpen, setDealFormOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Партия автозавершена если все пули закрыты
  const allPoolsClosed = PLAYERS.every((p) => game.pool[p] >= game.poolLimit)
  const isFinished = allPoolsClosed || game.finishedManually === true

  // Просматриваемое состояние (для истории)
  const viewingHistory = viewIndex !== null
  const viewed: GameState = useMemo(() => {
    if (!viewingHistory) return game
    return replayTo(game, viewIndex!)
  }, [game, viewIndex, viewingHistory])

  // Сдающий = предыдущий по часовой от firstHand ВИДИМОГО состояния
  const dealer = prevClockwise(viewed.firstHand)

  const settlement = settle(viewed)
  const minBid = minBidFor(viewed.raspasState)

  const lastDeal = viewed.deals[viewed.deals.length - 1]
  const lastDelta = viewed.lastDelta ?? null
  // whists суммируем по (from,to) — может быть несколько записей (например висты + консоляция)
  const lastWhistDelta: Record<PlayerId, Record<PlayerId, number>> = {
    A: { A: 0, B: 0, C: 0 },
    B: { A: 0, B: 0, C: 0 },
    C: { A: 0, B: 0, C: 0 },
  }
  if (lastDelta) {
    lastDelta.whists.forEach((w) => {
      lastWhistDelta[w.from][w.to] += w.amount
    })
  }
  const playerHasChanges = (p: PlayerId): boolean => {
    if (!lastDelta) return false
    if (lastDelta.pool[p] !== 0 || lastDelta.mount[p] !== 0) return true
    if (PLAYERS.some((o) => lastWhistDelta[p][o] !== 0 || lastWhistDelta[o][p] !== 0)) return true
    return false
  }

  const playerColor = (p: PlayerId) => {
    if (p === viewed.firstHand) return 'ring-4 ring-yellow-500'
    return ''
  }

  const Delta = ({ value }: { value: number }) => {
    if (value === 0) return null
    const positive = value > 0
    return (
      <span
        className={`ml-2 text-base font-bold px-2 py-0.5 rounded ${
          positive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}
      >
        {positive ? '+' : ''}
        {value}
      </span>
    )
  }

  // Подпись заказа. Масть показываем только у Сталинграда (6♠) — в остальных играх
  // она ни на что не влияет и больше не записывается.
  const contractLabel = (c: { level: number; suit?: string }): string =>
    c.level === 6 && c.suit === 'S' ? '6♠ (Сталинград)' : String(c.level)

  // Расшифровка последней сдачи текстом
  const explainLastDeal = (): string[] => {
    if (!lastDeal || !lastDelta) return []
    const lines: string[] = []
    if (lastDeal.type === 'game' && lastDeal.contract.kind === 'game') {
      const player = game.players[lastDeal.player]
      lines.push(
        `${player} играл ${contractLabel(lastDeal.contract)}, взял ${lastDeal.playerTricks}.`,
      )
      const vs = PLAYERS.filter((p) => p !== lastDeal.player)
      vs.forEach((v) => {
        const decision = lastDeal.vistDecisions[v]
        const t = lastDeal.vistersTricks[v]
        lines.push(
          `${game.players[v]}: ${decision === 'vist' ? 'вист' : decision === 'pass' ? 'пас' : 'полвиста'}, взял ${t}`,
        )
      })
    } else if (lastDeal.type === 'misere') {
      const player = game.players[lastDeal.player]
      lines.push(
        `${player} мизер${lastDeal.blind ? ' б/п' : ''}, ${lastDeal.playerTricks === 0 ? 'сыграл' : `поймали ${lastDeal.playerTricks}`}.`,
      )
    } else if (lastDeal.type === 'raspas') {
      const levelName = lastDeal.level === 1 ? '1-й' : lastDeal.level === 2 ? '2-й' : '8-мерный'
      lines.push(`Распас ${levelName}: ` + PLAYERS.map((p) => `${game.players[p]}=${lastDeal.tricks[p]}`).join(', '))
    } else if (lastDeal.type === 'giveup' && lastDeal.contract.kind === 'game') {
      lines.push(
        `${game.players[lastDeal.player]} ушёл без 3 на ${contractLabel(lastDeal.contract)}.`,
      )
    }
    // Расчёт
    lines.push('') // разделитель
    PLAYERS.forEach((p) => {
      const changes: string[] = []
      if (lastDelta.pool[p] !== 0) changes.push(`пуля ${lastDelta.pool[p] > 0 ? '+' : ''}${lastDelta.pool[p]}`)
      if (lastDelta.mount[p] !== 0) changes.push(`гора ${lastDelta.mount[p] > 0 ? '+' : ''}${lastDelta.mount[p]}`)
      const whistsOut = PLAYERS.filter((o) => o !== p)
        .map((o) => (lastWhistDelta[p][o] !== 0 ? `+${lastWhistDelta[p][o]} на ${game.players[o]}` : null))
        .filter(Boolean)
      if (whistsOut.length > 0) changes.push(`висты ${whistsOut.join(', ')}`)
      if (changes.length > 0) lines.push(`${game.players[p]}: ${changes.join('; ')}`)
    })
    return lines
  }
  const explanation = explainLastDeal()

  return (
    <div className="min-h-screen p-4 lg:p-8 pb-28 lg:pb-32">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-3xl font-bold">Людочка</h1>
          <div className="text-base text-slate-400 flex items-center gap-3 flex-wrap mt-1">
            <span>Пуля до {game.poolLimit}</span>
            <span>·</span>
            <span>
              сдач: {viewingHistory ? `${viewIndex}/${game.deals.length}` : game.deals.length}
            </span>
            {viewingHistory && (
              <span className="text-yellow-400 font-semibold">
                (просмотр истории — не текущий момент)
              </span>
            )}
            <span>·</span>
            {(() => {
              const sumPool = PLAYERS.reduce((s, p) => s + viewed.pool[p], 0)
              const inGame = viewed.poolLimit * PLAYERS.length - sumPool
              if (isFinished && !viewingHistory) {
                return <span className="font-bold text-green-400 text-lg">Партия окончена</span>
              }
              if (inGame <= 0 && !viewingHistory) {
                return <span className="font-bold text-green-400 text-lg">Партия окончена</span>
              }
              const critical = inGame <= 5
              return (
                <span className={critical ? 'font-bold text-red-400 text-lg' : ''}>
                  в игре: {inGame}
                </span>
              )
            })()}
            <SyncBadge />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {onBack && (
            <button
              onClick={onBack}
              className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-base font-semibold"
            >
              ← К партиям
            </button>
          )}
          <button
            onClick={viewPrev}
            disabled={viewIndex === 0 || game.deals.length === 0}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-base font-semibold"
            title="Посмотреть предыдущую сдачу"
          >
            ◀ Сдача
          </button>
          <button
            onClick={viewNext}
            disabled={!viewingHistory}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-base font-semibold"
            title="Посмотреть следующую сдачу"
          >
            Сдача ▶
          </button>
          {viewingHistory && (
            <button
              onClick={viewReset}
              className="px-4 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-base font-semibold"
              title="К текущему моменту"
            >
              ⤓ К текущей
            </button>
          )}
          {!isFinished && !viewingHistory && (
            confirmDelete ? (
              <>
                <button
                  onClick={() => {
                    deleteLastDeal()
                    setConfirmDelete(false)
                  }}
                  className="px-4 py-3 bg-red-600 hover:bg-red-500 rounded-lg text-base font-bold"
                  title="Удалить последнюю сдачу навсегда"
                >
                  Удалить?
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-base font-semibold"
                >
                  Нет
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={game.deals.length === 0}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-base font-semibold"
                title="Удалить последнюю сдачу (нельзя отменить)"
              >
                🗑 Удалить сдачу
              </button>
            )
          )}
          {!isFinished && !viewingHistory &&
            (confirmFinish ? (
              <>
                <button
                  onClick={() => {
                    finishGame()
                    setConfirmFinish(false)
                    onBack?.()
                  }}
                  className="px-5 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg text-base font-bold"
                >
                  Да, завершить
                </button>
                <button
                  onClick={() => setConfirmFinish(false)}
                  className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-base font-semibold"
                >
                  Отмена
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmFinish(true)}
                className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-base font-semibold"
                title="Пометить партию как завершённую"
              >
                🏁 Завершить
              </button>
            ))}
          {confirmReset ? (
            <>
              <button
                onClick={() => {
                  resetGame()
                  setConfirmReset(false)
                }}
                className="px-5 py-3 bg-red-600 hover:bg-red-500 rounded-lg text-base font-bold"
              >
                Точно?
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-base font-semibold"
              >
                Нет
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-base font-semibold"
            >
              Новая игра
            </button>
          )}
        </div>
      </div>

      {/* Связь с облаком потеряна. Данные не пропали — они в памяти этого
          устройства, и приложение само повторяет отправку. Опасно только
          закрыть вкладку и уйти играть на другом устройстве. */}
      {syncState === 'failed' && (
        <div className="mb-5 px-5 py-4 bg-red-500/15 border border-red-500/50 rounded-lg">
          <div className="font-bold text-red-300 text-lg">▲ Сдачи не уходят в облако</div>
          <div className="text-base text-red-100/80 mt-1">
            Нет связи с сервером. Записывать можно дальше — всё сохраняется на этом устройстве,
            и приложение само отправит партию, когда связь вернётся. Только не закрывай вкладку
            надолго и не открывай эту партию на другом устройстве.
          </div>
        </div>
      )}

      {/* Состояние распасов */}
      <div className="mb-5 px-5 py-3 bg-slate-800 rounded-lg text-center text-base">
        <span className="text-slate-400">Состояние: </span>
        <span className="font-bold">{RASPAS_LABEL[viewed.raspasState]}</span>
        {viewed.raspasState === 'eightRaspas' && (
          <span className="text-slate-400 ml-3">
            · круг:{' '}
            {PLAYERS.map((p) => `${game.players[p].slice(0, 3)}=${viewed.eightRaspasCounter[p]}`).join(', ')}
          </span>
        )}
      </div>

      {/* Основной блок: 3 колонки игроков */}
      <div className="grid grid-cols-3 gap-5 mb-5">
        {PLAYERS.map((p) => {
          const closed = viewed.pool[p] >= viewed.poolLimit
          const progress = Math.min(100, (viewed.pool[p] / viewed.poolLimit) * 100)
          const changed = playerHasChanges(p)
          const poolD = lastDelta?.pool[p] ?? 0
          const mountD = lastDelta?.mount[p] ?? 0
          const changedClass = changed && p !== viewed.firstHand ? 'ring-2 ring-blue-500/50' : ''
          const isFirstHand = p === viewed.firstHand
          const isDealer = p === dealer
          // Третий игрок — вторая рука. Полосу рисуем всем, чтобы карточки были
          // одной высоты, а роль читалась с другого конца стола.
          const roleLabel = isFirstHand ? '1 РУКА'
            : isDealer
              ? 'СДАЁТ'
              : '2 РУКА'
          const roleClass = isFirstHand
            ? 'bg-yellow-500 text-slate-900'
            : isDealer
              ? 'bg-slate-600 text-slate-100'
              : 'bg-slate-900 text-slate-500'
          return (
            <div
              key={p}
              className={`bg-slate-800 rounded-2xl p-5 ${playerColor(p)} ${changedClass} ${
                isFirstHand ? 'ring-2 ring-yellow-500' : ''
              }`}
            >
              <div
                className={`mb-3 py-2 rounded-lg text-center text-lg font-extrabold tracking-widest ${roleClass}`}
              >
                {roleLabel}
              </div>
              <div className="flex items-baseline justify-between gap-2 mb-4">
                <div className="text-2xl font-bold truncate">{game.players[p]}</div>
                <span
                  className={`text-4xl font-extrabold tabular-nums ${
                    settlement.net[p] > 0
                      ? 'text-green-400'
                      : settlement.net[p] < 0
                        ? 'text-red-400'
                        : 'text-slate-400'
                  }`}
                >
                  {settlement.net[p] > 0 ? '+' : ''}
                  {settlement.net[p]}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-base text-slate-400">Пуля</span>
                  <span className="text-3xl font-bold text-pool">
                    {viewed.pool[p]}
                    <span className="text-base text-slate-500 ml-1">/ {viewed.poolLimit}</span>
                    <Delta value={poolD} />
                  </span>
                </div>
                <div className="h-3 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${closed ? 'bg-yellow-500' : 'bg-pool'} transition-all`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between items-baseline mb-3">
                <span className="text-base text-slate-400">Гора</span>
                <span className="text-2xl font-bold text-mount">
                  {viewed.mount[p]}
                  <Delta value={mountD} />
                </span>
              </div>

              <div className="border-t border-slate-700 mt-4 pt-3">
                <div className="text-sm text-slate-500 mb-2">Висты на кого написал</div>
                {PLAYERS.filter((o) => o !== p).map((o) => (
                  <div key={o} className="flex justify-between items-baseline text-lg mb-1">
                    <span className="text-slate-400">→ {game.players[o]}</span>
                    <span className="text-whist font-semibold">
                      {viewed.whists[p][o]}
                      <Delta value={lastWhistDelta[p][o]} />
                    </span>
                  </div>
                ))}
              </div>

            </div>
          )
        })}
      </div>

      {/* Развёрнутая расшифровка последней сдачи (для дебага) */}
      {explanation.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg">
          <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">
            Последняя сдача — расчёт
          </div>
          {explanation.map((line, i) => (
            <div key={i} className={`text-sm ${line === '' ? 'h-2' : 'text-slate-400'}`}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Попарные долги */}
      {settlement.pairwise.length > 0 && (
        <div className="mb-6 bg-slate-800 rounded-2xl p-5">
          <div className="text-base text-slate-400 mb-3 font-semibold">Кто кому должен (висты)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {settlement.pairwise.map((d, i) => (
              <div key={i} className="bg-slate-900 rounded-lg px-5 py-4 flex items-center justify-between">
                <span className="text-slate-300 text-lg">
                  {game.players[d.from]} → {game.players[d.to]}
                </span>
                <span className="text-2xl font-bold text-yellow-500">{d.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dealFormOpen && !isFinished && !viewingHistory && (
        <DealForm minBid={minBid} raspasState={game.raspasState} onClose={() => setDealFormOpen(false)} />
      )}

      {/* Sticky-футер */}
      <div className="fixed bottom-0 left-0 right-0 p-3 lg:p-4 bg-slate-900/95 backdrop-blur border-t border-slate-800 z-40">
        {isFinished ? (
          <div className="w-full py-5 bg-slate-800 rounded-2xl text-xl font-bold text-center text-slate-400">
            🏁 Партия завершена — только просмотр
          </div>
        ) : viewingHistory ? (
          <div className="w-full py-5 bg-slate-800 rounded-2xl text-xl font-bold text-center text-yellow-400">
            👁 Просмотр истории — вернись к текущей чтобы записать сдачу
          </div>
        ) : (
          <button
            onClick={() => setDealFormOpen(true)}
            className="w-full py-5 bg-green-600 hover:bg-green-500 rounded-2xl text-2xl font-bold shadow-lg"
          >
            + Записать сдачу
          </button>
        )}
      </div>
    </div>
  )
}
