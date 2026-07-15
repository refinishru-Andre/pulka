// Единая точка входа для движка

export * from './types'
export * from './rules'
export * from './calc'
export * from './settle'
export * from './raspas'

import type { Deal, GameState, PlayerId, DealDelta } from './types'
import { calcDeal } from './calc'
import { nextRaspasState, nextFirstHand, updateEightCounter, nextClockwise } from './raspas'
import { PLAYERS } from './types'

// Правило Андрея: 1 очко переданной пули = 10 вистов
const POOL_TRANSFER_VISTS_PER_POINT = 10

// Полная дельта: базовый calcDeal + учёт перекрытия пули (для отображения и применения)
export function calcDealFull(state: GameState, deal: Deal): DealDelta {
  const delta = calcDeal(deal)
  // Симулируем pool после базовой delta
  const pool: Record<PlayerId, number> = { ...state.pool }
  PLAYERS.forEach((p) => (pool[p] += delta.pool[p]))

  // Обработка перекрытия
  for (const p of PLAYERS) {
    if (pool[p] <= state.poolLimit) continue
    let excess = pool[p] - state.poolLimit
    // Обрезаем избыток из delta.pool[p]
    delta.pool[p] -= excess
    pool[p] = state.poolLimit
    // Передаём соседям по часовой
    let next = nextClockwise(p)
    for (let i = 0; i < PLAYERS.length - 1 && excess > 0; i++) {
      const room = state.poolLimit - pool[next]
      if (room > 0) {
        const transfer = Math.min(excess, room)
        delta.pool[next] += transfer
        pool[next] += transfer
        delta.whists.push({ from: next, to: p, amount: transfer * POOL_TRANSFER_VISTS_PER_POINT })
        excess -= transfer
      }
      next = nextClockwise(next)
    }
  }
  return delta
}

// Применить сдачу к состоянию → новое состояние
export function applyDeal(state: GameState, deal: Deal): GameState {
  const delta = calcDealFull(state, deal)
  const newPool = { ...state.pool }
  const newMount = { ...state.mount }
  const newWhists = {
    A: { ...state.whists.A },
    B: { ...state.whists.B },
    C: { ...state.whists.C },
  }
  PLAYERS.forEach((p) => {
    newPool[p] += delta.pool[p]
    newMount[p] += delta.mount[p] // гора может уходить в минус — не ограничиваем
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
    lastDelta: delta,
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
