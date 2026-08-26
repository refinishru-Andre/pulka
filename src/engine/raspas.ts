// Логика передачи первой руки и переходов состояний распасов
// См. SPEC.md раздел 5

import type { Deal, GameState, PlayerId, RaspasState, Seats } from './types'
import { PLAYERS, seatsOf, zeroScores } from './types'

// Следующий игрок по часовой. seats — порядок посадки (по умолчанию стол на троих).
export function nextClockwise(p: PlayerId, seats: Seats = PLAYERS): PlayerId {
  const idx = seats.indexOf(p)
  return seats[(idx + 1) % seats.length]
}

// Предыдущий по часовой. Сдающий = предыдущий перед первой рукой.
export function prevClockwise(p: PlayerId, seats: Seats = PLAYERS): PlayerId {
  const idx = seats.indexOf(p)
  return seats[(idx - 1 + seats.length) % seats.length]
}

// Определить новую первую руку. Правило Андрея (v2):
// На 8-мерных распасах рука ОСТАЁТСЯ при ЛЮБОЙ несыгранной заказанной игре/мизере:
//   - ремиз 8+
//   - пойманный мизер
//   - уход без 3 (это тоже несыгранная игра)
// Во всех остальных случаях (распас, сыгранная игра/мизер) — рука переходит по часовой.
export function nextFirstHand(
  state: GameState,
  deal: Deal,
  _newRaspasState: RaspasState,
): PlayerId {
  if (state.raspasState === 'eightRaspas') {
    if (
      deal.type === 'game' &&
      deal.contract.kind === 'game' &&
      deal.contract.level >= 8 &&
      deal.playerTricks < deal.contract.level
    ) {
      return state.firstHand
    }
    if (deal.type === 'misere' && deal.playerTricks > 0) {
      return state.firstHand
    }
    if (deal.type === 'giveup') {
      return state.firstHand
    }
  }
  return nextClockwise(state.firstHand, seatsOf(state))
}

// Определить новое состояние распасов после сдачи
export function nextRaspasState(state: GameState, deal: Deal): RaspasState {
  // Распас увеличивает уровень
  if (deal.type === 'raspas') {
    if (state.raspasState === 'normal') return 'afterFirst'
    if (state.raspasState === 'afterFirst') return 'afterSecond'
    if (state.raspasState === 'afterSecond') return 'eightRaspas'
    return 'eightRaspas' // остаёмся в 8-мерных при повторном распасе
  }

  // Игра — любая УСПЕШНО сыгранная возвращает в normal.
  // Ремиз — состояние не меняется (остаёмся в эскалации).
  if (deal.type === 'game') {
    if (deal.contract.kind !== 'game') return state.raspasState
    const success = deal.playerTricks >= deal.contract.level
    if (success) return 'normal'
    return state.raspasState
  }
  if (deal.type === 'misere') {
    // Мизер сыгран или пойман — сброс в normal? Да (см. SPEC.md, разумно по умолчанию)
    if (deal.playerTricks === 0) return 'normal' // сыгран
    // Пойман — по правилам Андрея на 8-мерных первая рука остаётся, а состояние не сбрасывается
    if (state.raspasState === 'eightRaspas') return 'eightRaspas'
    return state.raspasState
  }
  if (deal.type === 'giveup') {
    // Уход без 3 — не сбрасывает состояние
    return state.raspasState
  }
  return state.raspasState
}

// Обновить счётчик «сколько раз каждый сидел на 1 руке в 8-мерных»
export function updateEightCounter(
  state: GameState,
  newRaspasState: RaspasState,
  oldFirstHand: PlayerId,
): Record<PlayerId, number> {
  // Если мы только-только вошли в 8-мерные — обнуляем счётчик и ставим 1 для входящей руки
  if (state.raspasState !== 'eightRaspas' && newRaspasState === 'eightRaspas') {
    return { ...zeroScores(), [oldFirstHand]: 1 }
  }
  // Если мы вышли из 8-мерных — обнуляем
  if (state.raspasState === 'eightRaspas' && newRaspasState !== 'eightRaspas') {
    return zeroScores()
  }
  // Продолжаем в 8-мерных — увеличиваем счётчик первой руки
  if (state.raspasState === 'eightRaspas' && newRaspasState === 'eightRaspas') {
    return { ...state.eightRaspasCounter, [oldFirstHand]: state.eightRaspasCounter[oldFirstHand] + 1 }
  }
  return state.eightRaspasCounter
}

// Проверить: пройден ли «полный круг» на 8-мерных (все ≥ 1)
export function isEightRaspasFullCircle(
  counter: Record<PlayerId, number>,
  seats: Seats = PLAYERS,
): boolean {
  return seats.every((p) => counter[p] >= 1)
}

// Минимальный заказ по состоянию
export function minBidFor(raspasState: RaspasState): number {
  switch (raspasState) {
    case 'normal':
      return 6
    case 'afterFirst':
      return 7
    case 'afterSecond':
      return 8
    case 'eightRaspas':
      return 8
  }
}

// Уровень распаса для новой раздачи (если все спасовали)
export function raspasLevelFor(raspasState: RaspasState): 1 | 2 | 3 {
  switch (raspasState) {
    case 'normal':
      return 1
    case 'afterFirst':
      return 2
    case 'afterSecond':
    case 'eightRaspas':
      return 3
  }
}
