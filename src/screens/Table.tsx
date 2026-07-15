import { useState } from 'react'
import { useGameStore } from '../store/game'
import { settle, minBidFor } from '../engine'
import { PLAYERS } from '../engine/types'
import type { PlayerId } from '../engine/types'
import { DealForm } from './DealForm'

const RASPAS_LABEL: Record<string, string> = {
  normal: 'Обычная игра · мин 6',
  afterFirst: 'После 1-го распаса · мин 7',
  afterSecond: 'После 2-го распаса · мин 8',
  eightRaspas: '8-мерные распасы · мин 8',
}

export function Table() {
  const game = useGameStore((s) => s.game)!
  const undoDeal = useGameStore((s) => s.undoDeal)
  const redoDeal = useGameStore((s) => s.redoDeal)
  const redoStack = useGameStore((s) => s.redoStack)
  const resetGame = useGameStore((s) => s.resetGame)
  const [dealFormOpen, setDealFormOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const settlement = settle(game)
  const minBid = minBidFor(game.raspasState)

  // Дельта от последней сдачи (с учётом перекрытия пули) — из state
  const lastDeal = game.deals[game.deals.length - 1]
  const lastDelta = game.lastDelta ?? null
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
    if (p === game.firstHand) return 'ring-4 ring-yellow-500'
    return ''
  }

  const Delta = ({ value }: { value: number }) => {
    if (value === 0) return null
    const positive = value > 0
    return (
      <span
        className={`ml-2 text-sm font-bold px-1.5 py-0.5 rounded ${
          positive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}
      >
        {positive ? '+' : ''}
        {value}
      </span>
    )
  }

  // Расшифровка последней сдачи текстом
  const explainLastDeal = (): string[] => {
    if (!lastDeal || !lastDelta) return []
    const lines: string[] = []
    if (lastDeal.type === 'game' && lastDeal.contract.kind === 'game') {
      const level = lastDeal.contract.level
      const suit = { S: '♠', C: '♣', D: '♦', H: '♥', NT: 'БК' }[lastDeal.contract.suit]
      const player = game.players[lastDeal.player]
      lines.push(`${player} играл ${level}${suit}, взял ${lastDeal.playerTricks}.`)
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
      const suit = { S: '♠', C: '♣', D: '♦', H: '♥', NT: 'БК' }[lastDeal.contract.suit]
      lines.push(`${game.players[lastDeal.player]} ушёл без 3 на ${lastDeal.contract.level}${suit}.`)
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
    <div className="min-h-screen p-4 lg:p-8">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Пулька</h1>
          <div className="text-sm text-slate-400">
            Пуля до {game.poolLimit} · сдач сыграно: {game.deals.length}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={undoDeal}
            disabled={game.deals.length === 0}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm"
          >
            ⟲ Отменить
          </button>
          <button
            onClick={redoDeal}
            disabled={redoStack.length === 0}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-sm"
            title={redoStack.length > 0 ? `Можно вернуть ${redoStack.length} сдач(и)` : ''}
          >
            Вперёд ⟳{redoStack.length > 0 && ` (${redoStack.length})`}
          </button>
          {confirmReset ? (
            <>
              <button
                onClick={() => {
                  resetGame()
                  setConfirmReset(false)
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold"
              >
                Точно?
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
              >
                Нет
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
            >
              Новая игра
            </button>
          )}
        </div>
      </div>

      {/* Состояние распасов */}
      <div className="mb-4 px-4 py-2 bg-slate-800 rounded-lg text-center text-sm">
        <span className="text-slate-400">Состояние: </span>
        <span className="font-semibold">{RASPAS_LABEL[game.raspasState]}</span>
        {game.raspasState === 'eightRaspas' && (
          <span className="text-slate-400 ml-3">
            · круг:{' '}
            {PLAYERS.map((p) => `${game.players[p].slice(0, 3)}=${game.eightRaspasCounter[p]}`).join(', ')}
          </span>
        )}
      </div>

      {/* Основной блок: 3 колонки игроков */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {PLAYERS.map((p) => {
          const closed = game.pool[p] >= game.poolLimit
          const progress = Math.min(100, (game.pool[p] / game.poolLimit) * 100)
          const changed = playerHasChanges(p)
          const poolD = lastDelta?.pool[p] ?? 0
          const mountD = lastDelta?.mount[p] ?? 0
          const changedClass = changed && p !== game.firstHand ? 'ring-2 ring-blue-500/50' : ''
          return (
            <div key={p} className={`bg-slate-800 rounded-2xl p-5 ${playerColor(p)} ${changedClass}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xl font-bold truncate">{game.players[p]}</div>
                {p === game.firstHand && (
                  <span className="text-xs bg-yellow-500 text-slate-900 px-2 py-1 rounded font-semibold">
                    1 РУКА
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-slate-400">Пуля</span>
                  <span className="text-2xl font-bold text-pool">
                    {game.pool[p]}
                    <span className="text-sm text-slate-500 ml-1">/ {game.poolLimit}</span>
                    <Delta value={poolD} />
                  </span>
                </div>
                <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${closed ? 'bg-yellow-500' : 'bg-pool'} transition-all`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm text-slate-400">Гора</span>
                <span className="text-xl font-bold text-mount">
                  {game.mount[p]}
                  <Delta value={mountD} />
                </span>
              </div>

              <div className="border-t border-slate-700 mt-3 pt-2">
                <div className="text-xs text-slate-500 mb-1">Висты на кого написал</div>
                {PLAYERS.filter((o) => o !== p).map((o) => (
                  <div key={o} className="flex justify-between items-baseline text-sm">
                    <span className="text-slate-400">→ {game.players[o]}</span>
                    <span className="text-whist">
                      {game.whists[p][o]}
                      <Delta value={lastWhistDelta[p][o]} />
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-700 mt-2 pt-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-500">Итог (висты)</span>
                  <span
                    className={`text-lg font-bold ${
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
            <div key={i} className={`text-sm ${line === '' ? 'h-2' : 'text-slate-300'}`}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Попарные долги */}
      {settlement.pairwise.length > 0 && (
        <div className="mb-6 bg-slate-800 rounded-2xl p-4">
          <div className="text-sm text-slate-400 mb-2">Кто кому должен (висты)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {settlement.pairwise.map((d, i) => (
              <div key={i} className="bg-slate-900 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-slate-300">
                  {game.players[d.from]} → {game.players[d.to]}
                </span>
                <span className="text-lg font-bold text-yellow-500">{d.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Кнопка записи сдачи */}
      <button
        onClick={() => setDealFormOpen(true)}
        className="fixed bottom-6 right-6 lg:relative lg:bottom-auto lg:right-auto lg:w-full py-5 bg-green-600 hover:bg-green-500 rounded-2xl text-xl font-bold shadow-2xl lg:shadow-none px-8"
      >
        + Записать сдачу
      </button>

      {dealFormOpen && (
        <DealForm minBid={minBid} raspasState={game.raspasState} onClose={() => setDealFormOpen(false)} />
      )}
    </div>
  )
}
