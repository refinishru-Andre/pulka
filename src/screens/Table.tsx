import { useState } from 'react'
import { useGameStore } from '../store/game'
import { settle, minBidFor, calcDeal } from '../engine'
import { PLAYERS } from '../engine/types'
import type { PlayerId } from '../engine/types'
import { DealForm } from './DealForm'
import { TrianglePool } from '../components/TrianglePool'

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

  // Дельта от последней сдачи — для подсветки изменений
  const lastDeal = game.deals[game.deals.length - 1]
  const lastDelta = lastDeal ? calcDeal(lastDeal) : null
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
  // (Все визуальные детали игроков рисует TrianglePool.)

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

      {/* Треугольная пуля */}
      <div className="max-w-4xl mx-auto mb-4">
        <TrianglePool
          game={game}
          lastDelta={lastDelta}
          lastWhistDelta={lastWhistDelta}
          netVists={settlement.net}
        />
      </div>

      {/* Информация о последней сдаче */}
      {lastDeal && (
        <div className="mb-4 px-4 py-2 bg-slate-800/50 rounded-lg text-xs text-slate-400 text-center">
          Последняя сдача:{' '}
          {lastDeal.type === 'game' &&
            lastDeal.contract.kind === 'game' &&
            `${game.players[lastDeal.player]} играл ${lastDeal.contract.level}${
              { S: '♠', C: '♣', D: '♦', H: '♥', NT: 'БК' }[lastDeal.contract.suit]
            }, взял ${lastDeal.playerTricks}`}
          {lastDeal.type === 'misere' &&
            `${game.players[lastDeal.player]} мизер${lastDeal.blind ? ' б/п' : ''}, поймали ${lastDeal.playerTricks}`}
          {lastDeal.type === 'raspas' &&
            `распас ${lastDeal.level === 1 ? '' : lastDeal.level === 2 ? '2-й' : '8-мерный'}: ${PLAYERS.map((p) => `${game.players[p].slice(0, 3)}=${lastDeal.tricks[p]}`).join(', ')}`}
          {lastDeal.type === 'giveup' &&
            lastDeal.contract.kind === 'game' &&
            `${game.players[lastDeal.player]} ушёл без 3 на ${lastDeal.contract.level}${
              { S: '♠', C: '♣', D: '♦', H: '♥', NT: 'БК' }[lastDeal.contract.suit]
            }`}
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
