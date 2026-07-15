// Единая точка входа для движка

export * from './types'
export * from './rules'
export * from './calc'
export * from './settle'
export * from './raspas'

import type { Deal, GameState, PlayerId } from './types'
import { calcDeal } from './calc'
import { nextRaspasState, nextFirstHand, updateEightCounter } from './raspas'
import { PLAYERS } from './types'

// Применить сдачу к состоянию → новое состояние
export function applyDeal(state: GameState, deal: Deal): GameState {
  const delta = calcDeal(deal)
  const newPool = { ...state.pool }
  const newMount = { ...state.mount }
  const newWhists = {
    A: { ...state.whists.A },
    B: { ...state.whists.B },
    C: { ...state.whists.C },
  }
  PLAYERS.forEach((p) => {
    newPool[p] += delta.pool[p]
    newMount[p] += delta.mount[p]
  })
  delta.whists.forEach((w) => {
    newWhists[w.from][w.to] += w.amount
  })

  const newRaspas = nextRaspasState(state, deal)
  const newFirstHand = nextFirstHand(state, deal, newRaspas)
  const newCounter = updateEightCounter(state, newRaspas, state.firstHand)

  return {
    ...state,
    pool: newPool,
    mount: newMount,
    whists: newWhists,
    raspasState: newRaspas,
    firstHand: newFirstHand,
    eightRaspasCounter: newCounter,
    deals: [...state.deals, deal],
  }
}

// Отменить последнюю сдачу — пересчитать всё с нуля из истории (проще и надёжнее)
export function undoLastDeal(state: GameState): GameState {
  const deals = state.deals.slice(0, -1)
  const initialState: GameState = {
    ...state,
    pool: { A: 0, B: 0, C: 0 },
    mount: { A: 0, B: 0, C: 0 },
    whists: {
      A: { A: 0, B: 0, C: 0 },
      B: { A: 0, B: 0, C: 0 },
      C: { A: 0, B: 0, C: 0 },
    },
    firstHand: deals.length > 0 ? deals[0].firstHand : state.firstHand,
    raspasState: 'normal',
    eightRaspasCounter: { A: 0, B: 0, C: 0 },
    deals: [],
  }
  return deals.reduce(applyDeal, initialState)
}

// Проверка: закрыта ли пуля у игрока
export function isPoolClosed(state: GameState, player: PlayerId): boolean {
  return state.pool[player] >= state.poolLimit
}

// Все ли пули закрыты
export function isGameFinished(state: GameState): boolean {
  return PLAYERS.every((p) => isPoolClosed(state, p))
}
