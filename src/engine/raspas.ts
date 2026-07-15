// Логика передачи первой руки и переходов состояний распасов
// См. SPEC.md раздел 5

import type { Deal, GameState, PlayerId, RaspasState } from './types'
import { PLAYERS } from './types'

// Следующий игрок по часовой (по порядку A → B → C → A)
export function nextClockwise(p: PlayerId): PlayerId {
  const idx = PLAYERS.indexOf(p)
  return PLAYERS[(idx + 1) % PLAYERS.length]
}

// Определить новую первую руку после сдачи с учётом «первая рука остаётся» на 8-мерных
export function nextFirstHand(
  state: GameState,
  deal: Deal,
  _newRaspasState: RaspasState,
): PlayerId {
  // На 8-мерных при ремизе 8+ или мизера — первая рука ОСТАЁТСЯ
  if (state.raspasState === 'eightRaspas' && deal.type === 'game') {
    if (deal.contract.kind === 'game' && deal.contract.level >= 8 && deal.playerTricks < deal.contract.level) {
      // Ремиз 8+ на 8-мерных → первая рука остаётся
      return state.firstHand
    }
  }
  if (state.raspasState === 'eightRaspas' && deal.type === 'misere' && deal.playerTricks > 0) {
    // Ремиз мизера на 8-мерных → первая рука остаётся
    return state.firstHand
  }
  if (state.raspasState === 'eightRaspas' && deal.type === 'giveup') {
    // Уход без 3 на 8-мерных ??? — трактуем как несостоявшуюся игру, первая рука остаётся
    // (обсудить с Андреем, отдельный вопрос — но логичнее так)
    return state.firstHand
  }
  // Если состояние вышло из 8-мерных (successful 8+ или mizer) — новая первая рука по часовой
  // Во всех остальных случаях — по часовой стрелке
  return nextClockwise(state.firstHand)
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

  // Игра или мизер — если в состоянии эскалации, проверяем возврат в normal
  if (deal.type === 'game') {
    if (deal.contract.kind === 'game' && deal.contract.level >= 8) {
      const success = deal.playerTricks >= deal.contract.level
      if (success) return 'normal' // успешно сыграна 8+ → выход в чистую
      // Ремиз 8+ в состоянии 2 или 8-мерных — не выходим
      return state.raspasState
    }
    // Игра 6/7 в состоянии эскалации не сбрасывает — но по конвенции такие игры и не заказываются на 8+
    // Если по каким-то причинам она сыграна — принимаем что состояние не меняется
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
    return { A: 0, B: 0, C: 0, [oldFirstHand]: 1 } as Record<PlayerId, number>
  }
  // Если мы вышли из 8-мерных — обнуляем
  if (state.raspasState === 'eightRaspas' && newRaspasState !== 'eightRaspas') {
    return { A: 0, B: 0, C: 0 }
  }
  // Продолжаем в 8-мерных — увеличиваем счётчик первой руки
  if (state.raspasState === 'eightRaspas' && newRaspasState === 'eightRaspas') {
    return { ...state.eightRaspasCounter, [oldFirstHand]: state.eightRaspasCounter[oldFirstHand] + 1 }
  }
  return state.eightRaspasCounter
}

// Проверить: пройден ли «полный круг» на 8-мерных (все ≥ 1)
export function isEightRaspasFullCircle(counter: Record<PlayerId, number>): boolean {
  return PLAYERS.every((p) => counter[p] >= 1)
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
