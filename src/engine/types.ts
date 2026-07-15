// Домeнные типы для движка расчёта пульки (Питер + конвенции Андрея)

export type PlayerId = 'A' | 'B' | 'C'
export const PLAYERS: PlayerId[] = ['A', 'B', 'C']

export type Suit = 'S' | 'C' | 'D' | 'H' | 'NT' // пики, трефы, бубны, черви, БК
export const SUITS: Suit[] = ['S', 'C', 'D', 'H', 'NT']
export const SUIT_LABEL: Record<Suit, string> = {
  S: '♠',
  C: '♣',
  D: '♦',
  H: '♥',
  NT: 'БК',
}

export type GameLevel = 6 | 7 | 8 | 9 | 10

// Заказ: обычная игра или мизер
export type Contract =
  | { kind: 'game'; level: GameLevel; suit: Suit }
  | { kind: 'misere'; blind: boolean } // blind = мизер без прикупа

// Тип виста каждого из двух вистующих
export type VistDecision = 'vist' | 'pass' | 'half' // вист / пас / полвиста

// Одна сдача — событие в истории
export type Deal =
  // Обычная игра
  | {
      type: 'game'
      dealer: PlayerId // сдающий
      firstHand: PlayerId // первая рука в момент сдачи
      player: PlayerId // играющий
      contract: Contract
      playerTricks: number // сколько взял играющий
      vistersTricks: Record<PlayerId, number> // сколько взял каждый вистующий
      vistDecisions: Record<PlayerId, VistDecision> // решение каждого вистующего
    }
  // Мизер
  | {
      type: 'misere'
      dealer: PlayerId
      firstHand: PlayerId
      player: PlayerId
      blind: boolean // мизер без прикупа
      playerTricks: number // 0 = сыграл, ≥1 = ремиз
    }
  // Распасы (уровень 1/2/3)
  | {
      type: 'raspas'
      dealer: PlayerId
      firstHand: PlayerId
      level: 1 | 2 | 3 // 1 = обычный, 2 = после первого, 3 = 8-мерные
      tricks: Record<PlayerId, number> // взятки каждого, сумма = 10
    }
  // Уход без 3
  | {
      type: 'giveup'
      dealer: PlayerId
      firstHand: PlayerId
      player: PlayerId
      contract: Contract // на что заказал (не мизер)
    }

// Результат применения сдачи к состоянию игры — изменения полей
export interface DealDelta {
  pool: Record<PlayerId, number> // изменение пули
  mount: Record<PlayerId, number> // изменение горы
  whists: Array<{ from: PlayerId; to: PlayerId; amount: number }> // висты (от кого на кого)
}

// Состояние игры в момент времени
export type RaspasState = 'normal' | 'afterFirst' | 'afterSecond' | 'eightRaspas'

export interface GameState {
  // Настройки игры (заданы при создании)
  players: Record<PlayerId, string> // имена
  poolLimit: number // размер пули (21 по умолчанию)
  createdAt: number

  // Текущее состояние
  pool: Record<PlayerId, number>
  mount: Record<PlayerId, number>
  whists: Record<PlayerId, Record<PlayerId, number>> // whists[from][to] = сумма

  // Кто на первой руке сейчас (следующая сдача)
  firstHand: PlayerId

  // Состояние распасов
  raspasState: RaspasState
  // Для 8-мерных: счётчик, сколько раз каждый уже сидел на 1-й руке в этом режиме
  eightRaspasCounter: Record<PlayerId, number>

  // История сдач (для отмены и просмотра)
  deals: Deal[]

  // Дельта последней сдачи (с учётом перекрытия пули) — для отображения изменений
  lastDelta?: DealDelta
}

// Финальный расчёт: сколько каждый игрок «стоит» в вистах и попарно кто кому должен
export interface Settlement {
  net: Record<PlayerId, number> // висто-баланс каждого (сумма = 0)
  pairwise: Array<{ from: PlayerId; to: PlayerId; amount: number }> // from должен to
}
