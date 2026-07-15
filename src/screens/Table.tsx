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
  const resetGame = useGameStore((s) => s.resetGame)
  const [dealFormOpen, setDealFormOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const settlement = settle(game)
  const minBid = minBidFor(game.raspasState)

  const playerColor = (p: PlayerId) => {
    if (p === game.firstHand) return 'ring-4 ring-yellow-500'
    return ''
  }

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
      <div className="grid grid-cols-3 gap-4 mb-6">
        {PLAYERS.map((p) => {
          const closed = game.pool[p] >= game.poolLimit
          const progress = Math.min(100, (game.pool[p] / game.poolLimit) * 100)
          return (
            <div key={p} className={`bg-slate-800 rounded-2xl p-5 ${playerColor(p)}`}>
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
                  </span>
                </div>
                <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${closed ? 'bg-yellow-500' : 'bg-pool'} transition-all`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between mb-1">
                <span className="text-sm text-slate-400">Гора</span>
                <span className="text-xl font-bold text-mount">{game.mount[p]}</span>
              </div>

              <div className="border-t border-slate-700 mt-3 pt-2">
                <div className="text-xs text-slate-500 mb-1">Висты на кого написал</div>
                {PLAYERS.filter((o) => o !== p).map((o) => (
                  <div key={o} className="flex justify-between text-sm">
                    <span className="text-slate-400">→ {game.players[o]}</span>
                    <span className="text-whist">{game.whists[p][o]}</span>
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
