import { useMemo, useState } from 'react'
import { useGameStore } from '../store/game'
import { useSyncStatus } from '../store/sync-status'
import {
  settle,
  minBidFor,
  applyDeal,
  emptyStateFrom,
  prevClockwise,
  isGameFinished,
  rulesOf,
  raspasStateLabel,
  RASPAS_LEVEL_NAME,
  gameResultText,
  dealBreakdown,
} from '../engine'
import { zeroWhists, seatsOf } from '../engine/types'
import type { PlayerId, GameState } from '../engine/types'
import { DealForm } from './DealForm'

// Вычислить состояние на момент N-й сдачи (для просмотра истории)
function replayTo(game: GameState, upTo: number): GameState {
  const initial = emptyStateFrom(game, game.deals[0]?.firstHand ?? game.firstHand)
  return game.deals.slice(0, upTo).reduce(applyDeal, initial)
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
  const deleteDealAt = useGameStore((s) => s.deleteDealAt)
  const resetGame = useGameStore((s) => s.resetGame)
  const finishGame = useGameStore((s) => s.finishGame)
  const syncState = useSyncStatus((s) => s.state)
  const [dealFormOpen, setDealFormOpen] = useState(false)
  // Правка сдачи из истории: её номер. null — обычная запись новой сдачи.
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [confirmDeleteDeal, setConfirmDeleteDeal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)

  // Кто за столом: трое или четверо. Читаем из партии, а не из константы.
  const seats = seatsOf(game)
  // Партия окончена: все пули закрыты либо посчитали вручную.
  // Без предела пуля не закрывается — только кнопкой «Рассчитать».
  const isFinished = isGameFinished(game) || game.finishedManually === true

  // Просматриваемое состояние (для истории)
  const viewingHistory = viewIndex !== null
  const viewed: GameState = useMemo(() => {
    if (!viewingHistory) return game
    return replayTo(game, viewIndex!)
  }, [game, viewIndex, viewingHistory])

  // Какую сдачу сейчас можно править: просматриваемую, а на текущем моменте —
  // последнюю записанную. null — править нечего.
  const editableIndex: number | null = isFinished
    ? null
    : viewingHistory
      ? viewIndex! > 0
        ? viewIndex! - 1
        : null
      : game.deals.length > 0
        ? game.deals.length - 1
        : null

  // Первая рука ТОЙ сдачи, которую смотрим. Состояние `viewed` — это уже ПОСЛЕ
  // неё, то есть расстановка для следующей. Пока смотришь прошлое, показывать
  // роли будущего нельзя: получалось «Олег сдаёт» и тут же «первая рука был
  // Олег» — оба верны, но про разные сдачи.
  const handBeforeLastDeal: PlayerId | null =
    viewed.deals.length > 0 ? replayTo(game, viewed.deals.length - 1).firstHand : null

  // Чьи роли рисуем на карточках
  const roleFirstHand =
    viewingHistory && handBeforeLastDeal ? handBeforeLastDeal : viewed.firstHand
  const dealer = prevClockwise(roleFirstHand, seats)

  const settlement = settle(viewed)
  const minBid = minBidFor(viewed.raspasState)

  const lastDeal = viewed.deals[viewed.deals.length - 1]
  const lastDelta = viewed.lastDelta ?? null
  // whists суммируем по (from,to) — может быть несколько записей (например висты + консоляция)
  const lastWhistDelta: Record<PlayerId, Record<PlayerId, number>> = zeroWhists()
  if (lastDelta) {
    lastDelta.whists.forEach((w) => {
      lastWhistDelta[w.from][w.to] += w.amount
    })
  }
  const playerHasChanges = (p: PlayerId): boolean => {
    if (!lastDelta) return false
    if (lastDelta.pool[p] !== 0 || lastDelta.mount[p] !== 0) return true
    if (seats.some((o) => lastWhistDelta[p][o] !== 0 || lastWhistDelta[o][p] !== 0)) return true
    return false
  }

  const playerColor = (p: PlayerId) => {
    if (p === roleFirstHand) return 'ring-4 ring-yellow-500'
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
    if (handBeforeLastDeal) {
      lines.push(`Сдача ${viewed.deals.length}. Первая рука была: ${game.players[handBeforeLastDeal]}.`)
    }
    if (lastDeal.type === 'game' && lastDeal.contract.kind === 'game') {
      const player = game.players[lastDeal.player]
      lines.push(
        `${player} играл ${contractLabel(lastDeal.contract)}, взял ${lastDeal.playerTricks}.`,
      )
      const vs = seats.filter((p) => p !== lastDeal.player && lastDeal.vistDecisions[p] !== undefined)
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
      const name = RASPAS_LEVEL_NAME[lastDeal.level]
      lines.push(
        `Распас ${name}: ` +
          seats.map((p) => `${game.players[p]}=${lastDeal.tricks[p] ?? 0}`).join(', '),
      )
    } else if (lastDeal.type === 'giveup' && lastDeal.contract.kind === 'game') {
      lines.push(
        `${game.players[lastDeal.player]} ушёл без 3 на ${contractLabel(lastDeal.contract)}.`,
      )
    } else if (lastDeal.type === 'adjust') {
      const where =
        lastDeal.target === 'mount'
          ? 'гора'
          : lastDeal.target === 'pool'
            ? 'пуля'
            : `висты на ${game.players[lastDeal.to!]}`
      const sign = lastDeal.amount > 0 ? '+' : ''
      lines.push(
        `Правка руками: ${game.players[lastDeal.player]}, ${where} ${sign}${lastDeal.amount}.`,
      )
      lines.push(`Причина: ${lastDeal.note}`)
    }
    // Откуда взялась каждая цифра — разбор по правилам партии
    const why = dealBreakdown(lastDeal, seats, rulesOf(viewed), game.players)
    if (why.length > 0) {
      lines.push('')
      why.forEach((l) => lines.push(l))
    }

    // Итоговые изменения
    lines.push('') // разделитель
    seats.forEach((p) => {
      const changes: string[] = []
      if (lastDelta.pool[p] !== 0) changes.push(`пуля ${lastDelta.pool[p] > 0 ? '+' : ''}${lastDelta.pool[p]}`)
      if (lastDelta.mount[p] !== 0) changes.push(`гора ${lastDelta.mount[p] > 0 ? '+' : ''}${lastDelta.mount[p]}`)
      const whistsOut = seats.filter((o) => o !== p)
        .map((o) => (lastWhistDelta[p][o] !== 0 ? `+${lastWhistDelta[p][o]} на ${game.players[o]}` : null))
        .filter(Boolean)
      if (whistsOut.length > 0) changes.push(`висты ${whistsOut.join(', ')}`)
      if (changes.length > 0) lines.push(`${game.players[p]}: ${changes.join('; ')}`)
    })
    lines.push('')
    if (handBeforeLastDeal) {
      lines.push(
        handBeforeLastDeal === viewed.firstHand
          ? `Дальше первая рука ОСТАЁТСЯ у ${game.players[viewed.firstHand]}.`
          : `Дальше первая рука переходит: ${game.players[handBeforeLastDeal]} → ${game.players[viewed.firstHand]}.`,
      )
    }
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
            <span>{game.poolLimit === null ? 'Пуля без предела' : `Пуля до ${game.poolLimit}`}</span>
            <span>·</span>
            <span>
              сдач: {viewingHistory ? viewIndex : game.deals.length}/{game.deals.length}
            </span>
            <span
              className={`text-yellow-400 font-semibold ${viewingHistory ? '' : 'invisible'}`}
            >
              (просмотр истории — не текущий момент)
            </span>
            <span>·</span>
            {(() => {
              if (isFinished && !viewingHistory) {
                return <span className="font-bold text-green-400 text-lg">Партия окончена</span>
              }
              // Без предела пуля не кончается: играют по времени, считают по кнопке
              if (viewed.poolLimit === null) {
                return <span className="text-slate-400">играем по времени</span>
              }
              const sumPool = seats.reduce((s, p) => s + viewed.pool[p], 0)
              const inGame = viewed.poolLimit * seats.length - sumPool
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
        {/* Ряд кнопок с ПОСТОЯННЫМ составом.
            Раньше кнопки появлялись и исчезали по обстановке, и весь ряд ехал:
            нажал «◀ Сдача», кнопки сдвинулись, второй клик попадал уже в другую.
            Теперь набор всегда один и тот же, неподходящие просто гаснут.
            Подтверждение тоже не добавляет кнопок — оно на той же кнопке,
            вторым нажатием. */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onBack}
            disabled={!onBack}
            className="px-5 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-base font-semibold"
          >
            ← К партиям
          </button>
          <button
            onClick={viewPrev}
            disabled={viewIndex === 1 || game.deals.length === 0}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-base font-semibold"
            title="Посмотреть предыдущую сдачу"
          >
            ◀ Сдача
          </button>
          <button
            onClick={viewNext}
            disabled={!viewingHistory || viewIndex === game.deals.length}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-base font-semibold"
            title="Посмотреть следующую сдачу"
          >
            Сдача ▶
          </button>
          <button
            onClick={viewReset}
            disabled={!viewingHistory}
            className="px-4 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-30 disabled:bg-slate-700 rounded-lg text-base font-semibold"
            title="Вернуться к текущему моменту"
          >
            ⤓ К текущей
          </button>
          <button
            onClick={() => {
              setEditIndex(editableIndex!)
              setDealFormOpen(true)
            }}
            disabled={editableIndex === null}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:bg-slate-700 rounded-lg text-base font-semibold"
            title="Исправить эту сдачу — партия пересчитается с неё"
          >
            ✏️ Исправить сдачу
          </button>
          <button
            onClick={() => {
              if (editableIndex === null) return
              if (confirmDeleteDeal) {
                deleteDealAt(editableIndex)
                setConfirmDeleteDeal(false)
              } else {
                setConfirmDeleteDeal(true)
              }
            }}
            disabled={editableIndex === null}
            className={`px-4 py-3 min-w-[190px] rounded-lg text-base font-semibold disabled:opacity-30 disabled:bg-slate-700 ${
              confirmDeleteDeal ? 'bg-red-600 hover:bg-red-500 font-bold' : 'bg-slate-700 hover:bg-slate-600'
            }`}
            title="Убрать эту сдачу из партии"
          >
            {confirmDeleteDeal ? 'Точно удалить?' : '🗑 Удалить сдачу'}
          </button>
          <button
            onClick={() => {
              if (confirmFinish) {
                finishGame()
                setConfirmFinish(false)
                onBack?.()
              } else {
                setConfirmFinish(true)
              }
            }}
            disabled={isFinished || viewingHistory}
            className={`px-5 py-3 min-w-[230px] rounded-lg text-base font-semibold disabled:opacity-30 disabled:bg-slate-700 ${
              confirmFinish ? 'bg-amber-600 hover:bg-amber-500 font-bold' : 'bg-slate-700 hover:bg-slate-600'
            }`}
            title="Зафиксировать итог на текущий момент. Пуля закрыта или нет — неважно: считаем по последней сдаче. После расчёта партия не меняется."
          >
            {confirmFinish ? 'Да, рассчитать' : '🏁 Рассчитать партию'}
          </button>
          {/* Откладывать можно только НЕдоигранную партию. У рассчитанной
              откладывать нечего — она уже в списке, и активная кнопка тут
              только сбивала с толку. */}
          <button
            onClick={() => {
              if (confirmReset) {
                resetGame()
                setConfirmReset(false)
              } else {
                setConfirmReset(true)
              }
            }}
            disabled={isFinished}
            className={`px-5 py-3 min-w-[260px] rounded-lg text-base font-semibold disabled:opacity-30 disabled:bg-slate-700 ${
              confirmReset ? 'bg-red-600 hover:bg-red-500 font-bold' : 'bg-slate-700 hover:bg-slate-600'
            }`}
            title={
              isFinished
                ? 'Партия уже рассчитана — откладывать нечего. Новую начинают из списка партий.'
                : 'Партия останется незавершённой в списке — её можно открыть и доиграть позже.'
            }
          >
            {confirmReset ? 'Точно отложить?' : 'Отложить и начать новую'}
          </button>
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
        <span className="font-bold">{raspasStateLabel(viewed.raspasState, rulesOf(viewed))}</span>
        {viewed.raspasState === 'eightRaspas' && (
          <span className="text-slate-400 ml-3">
            · кто уже сидел первой рукой:{' '}
            {seats
              .filter((p) => viewed.eightRaspasCounter[p] > 0)
              .map((p) => game.players[p])
              .join(', ') || 'ещё никто'}
          </span>
        )}
      </div>

      {/* Кто ходит в СЛЕДУЮЩЕЙ сдаче. Подписи на карточках относятся именно к
          ней, а не к только что записанной — на этом легко обмануться. */}
      {(viewingHistory || !isFinished) && (
        <div className="mb-3 px-5 py-2 bg-slate-800 rounded-lg text-center text-base">
          <span className="text-slate-400">
            {viewingHistory
              ? `Смотрим сдачу №${viewed.deals.length} из ${game.deals.length}: сдавал `
              : 'Сейчас сдаёт '}
          </span>
          <span className="font-semibold">{game.players[dealer]}</span>
          <span className="text-slate-400"> · первая рука </span>
          <span className="font-bold text-yellow-500">{game.players[roleFirstHand]}</span>
        </div>
      )}

      {/* Основной блок: по колонке на каждого за столом */}
      <div className={`grid ${seats.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'} gap-5 mb-5`}>
        {seats.map((p) => {
          const limit = viewed.poolLimit
          const closed = limit !== null && viewed.pool[p] >= limit
          const progress = limit === null ? 0 : Math.min(100, (viewed.pool[p] / limit) * 100)
          const changed = playerHasChanges(p)
          const poolD = lastDelta?.pool[p] ?? 0
          const mountD = lastDelta?.mount[p] ?? 0
          const changedClass = changed && p !== roleFirstHand ? 'ring-2 ring-blue-500/50' : ''
          const isFirstHand = p === roleFirstHand
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
                {seats.filter((o) => o !== p).map((o) => (
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
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="text-base text-slate-400 font-semibold">Кто кому должен (висты)</div>
            {/* Отправить итог людям: сыгранную партию раньше некуда было деть */}
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(gameResultText(viewed))
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                } catch {
                  setCopied(false)
                }
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold text-sm"
              title="Скопировать итог текстом — можно отправить в переписке"
            >
              {copied ? '✓ Скопировано' : '📋 Скопировать итог'}
            </button>
          </div>
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
        <DealForm
          minBid={editIndex === null ? minBid : minBidFor(replayTo(game, editIndex).raspasState, rulesOf(game))}
          raspasState={editIndex === null ? game.raspasState : replayTo(game, editIndex).raspasState}
          edit={editIndex === null ? undefined : { index: editIndex, deal: game.deals[editIndex] }}
          onClose={() => {
            setDealFormOpen(false)
            setEditIndex(null)
          }}
        />
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
            onClick={() => {
              setEditIndex(null)
              setDealFormOpen(true)
            }}
            className="w-full py-5 bg-green-600 hover:bg-green-500 rounded-2xl text-2xl font-bold shadow-lg"
          >
            + Записать сдачу
          </button>
        )}
      </div>
    </div>
  )
}
