// Единая точка входа для движка

export * from './types'
export * from './rules'
export * from './calc'
export * from './settle'
export * from './raspas'

import type { Deal, GameState, PlayerId, DealDelta } from './types'
import { calcDeal } from './calc'
import {
  nextRaspasState,
  nextFirstHand,
  updateEightCounter,
  nextClockwise,
  isEightRaspasFullCircle,
} from './raspas'
import { ALL_PLAYERS, seatsOf, zeroScores, zeroWhists } from './types'
// Правило Андрея: 1 очко переданной пули = 10 вистов
const POOL_TRANSFER_VISTS_PER_POINT = 10

// Полная дельта: базовый calcDeal + учёт перекрытия пули (для отображения и применения)
export function calcDealFull(state: GameState, deal: Deal): DealDelta {
  const seats = seatsOf(state)
  const delta = calcDeal(deal, seats)
  // Симулируем pool после базовой delta
  const pool: Record<PlayerId, number> = { ...zeroScores(), ...state.pool }
  seats.forEach((p) => (pool[p] += delta.pool[p]))

  // Обработка перекрытия
  for (const p of seats) {
    if (pool[p] <= state.poolLimit) continue
    let excess = pool[p] - state.poolLimit
    // Обрезаем избыток из delta.pool[p]
    delta.pool[p] -= excess
    pool[p] = state.poolLimit
    // Передаём соседям по часовой
    let next = nextClockwise(p, seats)
    for (let i = 0; i < seats.length - 1 && excess > 0; i++) {
      const room = state.poolLimit - pool[next]
      if (room > 0) {
        const transfer = Math.min(excess, room)
        delta.pool[next] += transfer
        pool[next] += transfer
        // Правило: передающий (p) получает висты от получателя (next).
        // Значит p пишет в свою пользу висты на next.
        delta.whists.push({ from: p, to: next, amount: transfer * POOL_TRANSFER_VISTS_PER_POINT })
        excess -= transfer
      }
      next = nextClockwise(next, seats)
    }
    // Если после передачи остался излишек — все игроки закрыты.
    // Правило: 1 очко пули = 2 очка списанной горы (эквивалент 20 вистов).
    // Итог: остаток * 2 в минус горы.
    if (excess > 0) {
      delta.mount[p] -= excess * 2
    }
  }
  return delta
}

// Применить сдачу к состоянию → новое состояние
export function applyDeal(state: GameState, deal: Deal): GameState {
  const seats = seatsOf(state)
  const delta = calcDealFull(state, deal)
  const newPool = { ...zeroScores(), ...state.pool }
  const newMount = { ...zeroScores(), ...state.mount }
  const newWhists = zeroWhists()
  ALL_PLAYERS.forEach((from) =>
    ALL_PLAYERS.forEach((to) => (newWhists[from][to] = state.whists[from]?.[to] ?? 0)),
  )
  seats.forEach((p) => {
    newPool[p] += delta.pool[p]
    newMount[p] += delta.mount[p] // гора может уходить в минус — не ограничиваем
  })
  delta.whists.forEach((w) => {
    newWhists[w.from][w.to] += w.amount
  })

  let newRaspas = nextRaspasState(state, deal)
  const newFirstHand = nextFirstHand(state, deal, newRaspas)
  let newCounter = updateEightCounter(state, newRaspas, state.firstHand)

  // «Полный круг» на 8-мерных: как только все игроки побывали первой рукой хотя бы 1 раз —
  // эскалация сбрасывается, следующая сдача играется как обычная (мин 6).
  if (newRaspas === 'eightRaspas' && isEightRaspasFullCircle(newCounter, seats)) {
    newRaspas = 'normal'
    newCounter = zeroScores()
  }

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
  return deals.reduce(applyDeal, emptyStateFrom(state, deals[0]?.firstHand ?? state.firstHand))
}

// Чистое стартовое состояние партии: настройки те же, счёт обнулён.
// Единственное место, где обнуляется счёт — раньше это было продублировано
// в пяти файлах, и при добавлении четвёртого места разъехалось бы.
export function emptyStateFrom(state: GameState, firstHand?: PlayerId): GameState {
  return {
    ...state,
    pool: zeroScores(),
    mount: zeroScores(),
    whists: zeroWhists(),
    firstHand: firstHand ?? state.firstHand,
    raspasState: 'normal',
    eightRaspasCounter: zeroScores(),
    deals: [],
    lastDelta: undefined,
  }
}

// Пересчитать состояние партии из истории сдач — deals[] единственный источник
// истины, pool/mount/whists это кеш. Вызывается при каждой загрузке партии.
//
// ИСКЛЮЧЕНИЕ: завершённая партия не пересчитывается НИКОГДА. Её итог зафиксирован
// таким, каким был за столом, и изменения формул движка на него не влияют — даже
// если в нём была ошибка счёта (решение Андрея, 2026-08-26).
export function recomputeState(game: GameState): GameState {
  if (isFrozen(game)) return game
  if (game.deals.length === 0) return game
  return game.deals.reduce(applyDeal, emptyStateFrom(game, game.deals[0].firstHand))
}

// Итог партии зафиксирован и пересчёту не подлежит.
//
// Отдельная метка frozenAt не обязательна: завершённость сама по себе означает
// заморозку. Это важно для партий, сыгранных ДО появления заморозки — метки у них
// нет, а цифры в облаке лежат ровно те, что записались при завершении. Никакой
// миграции данных и никакого ключа доступа к серверу для этого не нужно.
export function isFrozen(game: GameState): boolean {
  return Boolean(game.frozenAt) || game.finishedManually === true || isGameFinished(game)
}

// Заморозить итог партии. Вызывается при завершении — дальше цифры не меняются.
export function freezeGame(game: GameState, at: number): GameState {
  if (game.frozenAt) return game // уже вморожена — второй раз не трогаем
  return { ...game, frozenAt: at }
}

// Проверка: закрыта ли пуля у игрока
export function isPoolClosed(state: GameState, player: PlayerId): boolean {
  return state.pool[player] >= state.poolLimit
}

// Все ли пули закрыты
export function isGameFinished(state: GameState): boolean {
  return seatsOf(state).every((p) => isPoolClosed(state, p))
}
