// Домeнные типы для движка расчёта пульки (Питер + конвенции Андрея)

export type PlayerId = 'A' | 'B' | 'C' | 'D'

// Все возможные места за столом. Кто реально играет в конкретной партии —
// задаётся в GameState.seats (3 или 4 места в порядке посадки по часовой).
export const ALL_PLAYERS: PlayerId[] = ['A', 'B', 'C', 'D']

// Стол на троих — умолчание для всех партий, сыгранных до появления
// четвёртого игрока (у них в данных нет поля seats).
export const PLAYERS: PlayerId[] = ['A', 'B', 'C']

// Порядок посадки: список мест по часовой стрелке
export type Seats = PlayerId[]

// Нулевая запись очков сразу на все места (лишние места просто не читаются)
export function zeroScores(): Record<PlayerId, number> {
  return { A: 0, B: 0, C: 0, D: 0 }
}

// Нулевая матрица вистов: whists[from][to]
export function zeroWhists(): Record<PlayerId, Record<PlayerId, number>> {
  return {
    A: zeroScores(),
    B: zeroScores(),
    C: zeroScores(),
    D: zeroScores(),
  }
}

// Места партии. Партии, записанные до этой версии, поля seats не имеют — это трое.
export function seatsOf(state: { seats?: Seats }): Seats {
  return state.seats && state.seats.length > 0 ? state.seats : PLAYERS
}

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
  // suit БОЛЬШЕ НЕ ЗАПИСЫВАЕТСЯ. Масть не участвует ни в одной формуле, а
  // Сталинград (6♠) не нужно отмечать отдельно: раз оба обязаны вистовать —
  // так и ставим в «как вистовали». Поле остаётся только для чтения уже
  // сыгранных партий, где метка 'S' есть (см. комментарий в calc.ts).
  | { kind: 'game'; level: GameLevel; suit?: Suit }
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
      // Записи есть только у тех, кто участвовал: вистующих всегда двое, а
      // вчетвером сдающий вне розыгрыша. Читать через `?? 0`.
      vistersTricks: Partial<Record<PlayerId, number>>
      vistDecisions: Partial<Record<PlayerId, VistDecision>>
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
      // Взятки участников, в сумме 10. Вчетвером сдающий тоже участвует —
      // он ходит картами прикупа (кодекс ФСПР 6.5), но не больше 2 взяток.
      tricks: Partial<Record<PlayerId, number>>
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
  // Места за столом по часовой стрелке. Отсутствует у партий, сыгранных до
  // появления игры вчетвером — читать только через seatsOf(), не напрямую.
  seats?: Seats
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

  // Партия завершена (вручную пользователем; или закрылась автоматически по всем пулям)
  finishedManually?: boolean
}

// Финальный расчёт: сколько каждый игрок «стоит» в вистах и попарно кто кому должен
export interface Settlement {
  net: Record<PlayerId, number> // висто-баланс каждого (сумма = 0)
  pairwise: Array<{ from: PlayerId; to: PlayerId; amount: number }> // from должен to
}
