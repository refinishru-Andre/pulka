// Логика передачи первой руки и переходов состояний распасов.
// Всё, что тут решается, зависит от конвенций партии (conventions.ts).

import type { Deal, GameState, PlayerId, RaspasState, Seats } from './types'
import { PLAYERS, seatsOf, zeroScores } from './types'
import type { Rules } from './conventions'
import { HOME_RULES, rulesOf, ladderAt } from './conventions'

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

// Была ли игра завистована — хоть кто-то не спасовал.
// Нужно там, где выход из распасов даёт только завистованная игра: тогда
// «8 пик — пас — пас» распасы не гасит, хотя формально сыграна.
function wasVisted(deal: Extract<Deal, { type: 'game' }>, seats: Seats): boolean {
  return seats.some((p) => p !== deal.player && deal.vistDecisions[p] && deal.vistDecisions[p] !== 'pass')
}

// Определить новую первую руку.
//
// По умолчанию сдача идёт по часовой, что бы ни случилось (так в ФСПР 6.5).
// Домашняя конвенция добавляет исключение: на 8-мерных распасах рука ОСТАЁТСЯ
// при любой несыгранной заказанной игре — ремиз 8+, пойманный мизер, уход без 3.
export function nextFirstHand(
  state: GameState,
  deal: Deal,
  _newRaspasState: RaspasState,
): PlayerId {
  const rules = rulesOf(state)
  const seats = seatsOf(state)
  if (rules.firstHandStaysOnFailedHighGame && state.raspasState === 'eightRaspas') {
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
  return nextClockwise(state.firstHand, seats)
}

// Определить новое состояние распасов после сдачи
export function nextRaspasState(state: GameState, deal: Deal): RaspasState {
  const rules = rulesOf(state)
  const seats = seatsOf(state)

  // Распас поднимает эскалацию на ступень.
  //
  // ВАЖНО: второй распас сразу выводит на 8-мерные. Раньше между ними жило
  // лишнее состояние «после 2-го распаса» с тем же минимумом 8 и той же ценой
  // взятки 6 — оно отличалось ТОЛЬКО тем, что там не работало правило «рука
  // остаётся». За столом такого различия нет: как только минимум стал 8, вы уже
  // на восьмерных. Из-за этой лишней ступени 26.08.2026 на 35-й сдаче рука ушла,
  // хотя Олег заказал восьмерную и ушёл без трёх, и она должна была остаться.
  if (deal.type === 'raspas') {
    if (state.raspasState === 'normal') return 'afterFirst'
    return 'eightRaspas'
  }

  if (deal.type === 'game') {
    if (deal.contract.kind !== 'game') return state.raspasState
    const success = deal.playerTricks >= deal.contract.level
    if (!success) return state.raspasState // подсадом из распасов не выходят
    // Конвенция ФСПР: выход даёт только ЗАВИСТОВАННАЯ сыгранная игра
    if (rules.exitRequiresVisted && !wasVisted(deal, seats)) return state.raspasState
    return 'normal'
  }

  if (deal.type === 'misere') {
    // Дома сыгранный мизер гасит распасы. В ФСПР — нет: мизер не вистуется в
    // принципе, а выход даёт только завистованная игра.
    if (rules.misereBreaksRaspas && deal.playerTricks === 0) return 'normal'
    return state.raspasState
  }

  // Уход без 3 и ручная корректировка состояние не меняют
  return state.raspasState
}

// Обновить счётчик «сколько раз каждый сидел на 1 руке в 8-мерных»
export function updateEightCounter(
  state: GameState,
  newRaspasState: RaspasState,
  oldFirstHand: PlayerId,
): Record<PlayerId, number> {
  // Только что вошли в 8-мерные — счётчик пустой.
  //
  // Сдачу, которая ПРИВЕЛА на восьмерные, засчитывать нельзя: она игралась ещё
  // по прежней цене и к режиму не относится. Раньше её первой руке ставили
  // единицу, и круг мог замкнуться при том, что человек на восьмерных первой
  // рукой так и не сидел. В партии 26.08.2026 так и вышло: круг закрылся, хотя
  // Олег своё на восьмерных не отсидел.
  if (state.raspasState !== 'eightRaspas' && newRaspasState === 'eightRaspas') {
    return zeroScores()
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

// На какой ступени лесенки мы находимся: 0 = обычная игра, дальше по числу
// пройденных распасов.
function ladderStep(raspasState: RaspasState): number {
  switch (raspasState) {
    case 'normal':
      return 0
    case 'afterFirst':
      return 1
    case 'afterSecond':
      return 2
    case 'eightRaspas':
      return 3
  }
}

// Минимальный заказ по состоянию.
// Дом: 6 → 7 → 8 и дальше 8. ФСПР: 6 → 7 и дальше 7 («выход затруднённый»).
export function minBidFor(raspasState: RaspasState, rules: Rules = HOME_RULES): number {
  return ladderAt(rules.minBidLadder, ladderStep(raspasState))
}

// Цена взятки на распасе в текущем состоянии: 2 → 4 → 6 и дальше 6
export function raspasCostFor(raspasState: RaspasState, rules: Rules = HOME_RULES): number {
  return ladderAt(rules.raspasCostLadder, ladderStep(raspasState))
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
