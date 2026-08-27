// Тесты движка расчёта — покрывают все ключевые сценарии
// Запуск: npm test

import { describe, it, expect } from 'vitest'
import { calcDeal } from './calc'
import { applyDeal, recomputeState, freezeGame } from './index'
import { prevClockwise, minBidFor } from './raspas'
import { settle, calcNet } from './settle'
import {
  rulesOf, ladderAt, halfVistTricks, HOME_RULES, FSPR_RULES,
} from './conventions'
import {
  POOL_COST, MOUNT_PENALTY, VIST_PER_TRICK, VISTERS_DUTY, VISTER_PENALTY_PER_MISS,
  MISERE_POOL_COST, MISERE_TRICK_PENALTY, RASPAS_TRICK_COST,
} from './rules'
import { nextRaspasState, nextFirstHand, updateEightCounter, isEightRaspasFullCircle } from './raspas'
import type { Deal, GameState, PlayerId } from './types'
import { PLAYERS, zeroScores, zeroWhists } from './types'

// Хелпер: начальное пустое состояние. Стол на троих — все тесты этого файла
// проверяют домашние правила Андрея, они же поведение до появления четвёртого места.
function initState(): GameState {
  return {
    players: { A: 'А', B: 'Б', C: 'В', D: '' },
    seats: PLAYERS,
    poolLimit: 21,
    createdAt: Date.now(),
    pool: zeroScores(),
    mount: zeroScores(),
    whists: zeroWhists(),
    firstHand: 'A',
    raspasState: 'normal',
    eightRaspasCounter: zeroScores(),
    deals: [],
  }
}

describe('calcDeal — Игра сыграна', () => {
  it('7♠ сыграна ровно, оба вистовали, взяли 1+2 — каждый за свои', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'C',
      contract: { kind: 'game', level: 7, suit: 'S' },
      playerTricks: 7,
      vistersTricks: { A: 1, B: 2, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.C).toBe(4) // сыгранная 7 = 4 в пулю
    // A за 1 = 8; B за 2 = 16. Обязательство 7-й = 2 на пару, по 1 на игрока.
    // A взял 1 = норму, B взял 2 (переработал), штрафов нет.
    expect(delta.mount).toEqual({ A: 0, B: 0, C: 0, D: 0 })
    const aToC = delta.whists.find((w) => w.from === 'A' && w.to === 'C')?.amount
    const bToC = delta.whists.find((w) => w.from === 'B' && w.to === 'C')?.amount
    expect(aToC).toBe(8)
    expect(bToC).toBe(16)
  })

  it('6♣: О пас, Д вист — Д один за пару, пишет за ВСЕ взятки пары', () => {
    // Живой пример Андрея: А играл 6, взял 7, О пасовал (взял 1), Д вистовал (взял 2)
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' },
      playerTricks: 7,
      vistersTricks: { A: 0, B: 1, C: 2, D: 0 }, // B пас взял 1, C вист взял 2
      vistDecisions: { A: 'vist', B: 'pass', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(2)
    // C — единственный активный, пишет за ВСЮ пару 3 взятки = 3 × 4 = 12
    const cToA = delta.whists.find((w) => w.from === 'C' && w.to === 'A')?.amount
    expect(cToA).toBe(12)
    // B пас — не пишет ничего
    expect(delta.whists.find((w) => w.from === 'B')).toBeUndefined()
    // Штраф за недобор пары 4-3=1 → 1×2=2, весь на активного C
    expect(delta.mount.C).toBe(2)
    expect(delta.mount.B).toBe(0)
  })

  it('8♠: оба вистуют, один взял 1 другой 0 — пара выполнила, штрафа нет', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 8, suit: 'S' },
      playerTricks: 9,
      vistersTricks: { A: 0, B: 1, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(6)
    // Пара взяла 1 = обязательство, штрафа нет
    expect(delta.mount.B).toBe(0)
    expect(delta.mount.C).toBe(0)
    // Виста: B за 1 = 12 на A
    const bToA = delta.whists.find((w) => w.from === 'B' && w.to === 'A')?.amount
    expect(bToA).toBe(12)
  })

  it('8♠: оба вистуют, оба взяли 0 — штраф полный 6 каждому', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 8, suit: 'S' },
      playerTricks: 10,
      vistersTricks: { A: 0, B: 0, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(6)
    expect(delta.mount.B).toBe(6)
    expect(delta.mount.C).toBe(6)
  })

  it('9♠: один вист, взял 0 — недобор пары 1, весь штраф ему = 8', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 9, suit: 'S' },
      playerTricks: 10,
      vistersTricks: { A: 0, B: 0, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'pass', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(8)
    expect(delta.mount.C).toBe(8) // весь штраф на единственного активного
    expect(delta.mount.B).toBe(0)
  })

  it('6♣: оба вистуют, взяли по 1 — каждый штрафуется на 2 (недобрал 1 личный)', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' },
      playerTricks: 8,
      vistersTricks: { A: 0, B: 1, C: 1, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(2)
    // Каждый взял 1 при норме 2 → недобрал 1 → штраф 2 в гору обоим
    expect(delta.mount.B).toBe(2)
    expect(delta.mount.C).toBe(2)
    // Виста: каждый за 1 = 4 на A
    const bToA = delta.whists.find((w) => w.from === 'B' && w.to === 'A')?.amount
    const cToA = delta.whists.find((w) => w.from === 'C' && w.to === 'A')?.amount
    expect(bToA).toBe(4)
    expect(cToA).toBe(4)
  })

  it('6♣: оба вистуют, взяли 1+2 — индивидуальная норма (норма 2 каждому)', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' },
      playerTricks: 7,
      vistersTricks: { A: 0, B: 1, C: 2, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' }, // оба вистуют
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(2)
    // B взял 1 = 4 на A; C взял 2 = 8 на A
    const bToA = delta.whists.find((w) => w.from === 'B' && w.to === 'A')?.amount
    const cToA = delta.whists.find((w) => w.from === 'C' && w.to === 'A')?.amount
    expect(bToA).toBe(4)
    expect(cToA).toBe(8)
    // B недобрал 1 (норма 2, взял 1) → 1 × 2 = 2 в гору B
    // C взял 2 = норму → 0
    expect(delta.mount.B).toBe(2)
    expect(delta.mount.C).toBe(0)
  })

  it('9♥ сыграна с запасом, оба вистовали, взяли по 0 — штраф ПОЛНЫЙ 8 каждому', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 9, suit: 'H' },
      playerTricks: 10,
      vistersTricks: { A: 0, B: 0, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(8)
    // duty=1, пара 0 → каждый взял 0 → штраф полный 8 каждому (пол не считается)
    expect(delta.mount.B).toBe(8)
    expect(delta.mount.C).toBe(8)
  })
})

describe('calcDeal — Ремиз играющего', () => {
  it('6♣ ремиз без 1, оба вистовали, взяли 5 в паре — с консоляцией', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' },
      playerTricks: 5,
      vistersTricks: { A: 0, B: 2, C: 3, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.mount.A).toBe(4) // недобрал 1 × 4 = 4 в гору
    expect(delta.pool.A).toBe(0)
    // B за 2 взятки × 4 = 8; C за 3 × 4 = 12. Консоляция 1 × 4 = 4 обоим
    const bToA = delta.whists.filter((w) => w.from === 'B' && w.to === 'A').reduce((s, w) => s + w.amount, 0)
    const cToA = delta.whists.filter((w) => w.from === 'C' && w.to === 'A').reduce((s, w) => s + w.amount, 0)
    expect(bToA).toBe(12) // 8 + 4
    expect(cToA).toBe(16) // 12 + 4
  })

  it('9♠ ремиз без 2, оба вистовали, взяли 1+2 — жлобский + консоляция', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'C',
      contract: { kind: 'game', level: 9, suit: 'S' },
      playerTricks: 7,
      vistersTricks: { A: 1, B: 2, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.mount.C).toBe(2 * 16) // недобрал 2 × 16 = 32
    // A за 1 = 16, B за 2 = 32. Консоляция 2 × 16 = 32 обоим
    const aToC = delta.whists.filter((w) => w.from === 'A' && w.to === 'C').reduce((s, w) => s + w.amount, 0)
    const bToC = delta.whists.filter((w) => w.from === 'B' && w.to === 'C').reduce((s, w) => s + w.amount, 0)
    expect(aToC).toBe(48) // 16 + 32
    expect(bToC).toBe(64) // 32 + 32
  })
})

describe('Автомат-сценарии (без розыгрыша)', () => {
  it('оба пасовали на 6-й → играющий получает 2 в пулю, вистам ничего', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' },
      playerTricks: 6, // не важно
      vistersTricks: { A: 0, B: 0, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'pass', C: 'pass' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(2)
    expect(delta.mount).toEqual({ A: 0, B: 0, C: 0, D: 0 })
    expect(delta.whists).toHaveLength(0)
  })

  it('оба пасовали на 9-й → играющий получает 8 в пулю автоматом', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 9, suit: 'H' },
      playerTricks: 0,
      vistersTricks: { A: 0, B: 0, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'pass', C: 'pass' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(8)
    expect(delta.whists).toHaveLength(0)
  })

  it('полвиста + пас на 6-й → играющий пуля, полвистовому за 2 взятки = 8 вистов', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' },
      playerTricks: 6,
      vistersTricks: { A: 0, B: 0, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'pass', C: 'half' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(2)
    // Полвистовому (C) за 2 взятки × 4 = 8 на A
    const cToA = delta.whists.find((w) => w.from === 'C' && w.to === 'A')?.amount
    expect(cToA).toBe(8)
    // B (пас) ничего
    expect(delta.whists.find((w) => w.from === 'B')).toBeUndefined()
  })

  it('полвиста + пас на 7-й → полвистовому за 1 взятку = 8 вистов', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7, suit: 'S' },
      playerTricks: 7,
      vistersTricks: { A: 0, B: 0, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'half', C: 'pass' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(4)
    // Полвистовому (B) за 1 взятку × 8 = 8 на A
    const bToA = delta.whists.find((w) => w.from === 'B' && w.to === 'A')?.amount
    expect(bToA).toBe(8)
  })
})

describe('calcDeal — Сталинград (6♠)', () => {
  it('6♠: оба принудительно вистуют, ремиз — жлобский за свои + консоляция', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'C',
      contract: { kind: 'game', level: 6, suit: 'S' },
      playerTricks: 5,
      vistersTricks: { A: 3, B: 2, C: 0, D: 0 },
      vistDecisions: { A: 'pass', B: 'pass', C: 'vist' }, // оба «пас», но 6♠ → форс вист
    }
    const delta = calcDeal(deal)
    expect(delta.mount.C).toBe(4) // ремиз без 1
    // A за 3 = 12; B за 2 = 8. Консоляция 1×4=4 обоим (оба сталингр. считаются активными)
    const aToC = delta.whists.filter((w) => w.from === 'A' && w.to === 'C').reduce((s, w) => s + w.amount, 0)
    const bToC = delta.whists.filter((w) => w.from === 'B' && w.to === 'C').reduce((s, w) => s + w.amount, 0)
    expect(aToC).toBe(16) // 12 + 4
    expect(bToC).toBe(12) // 8 + 4
  })
})

describe('calcDeal — Мизер', () => {
  it('мизер сыгран', () => {
    const deal: Deal = {
      type: 'misere',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      blind: false,
      playerTricks: 0,
    }
    const delta = calcDeal(deal)
    expect(delta.pool.B).toBe(10)
    expect(delta.mount).toEqual({ A: 0, B: 0, C: 0, D: 0 })
  })

  it('мизер пойман на 2 взятки', () => {
    const deal: Deal = {
      type: 'misere',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      blind: false,
      playerTricks: 2,
    }
    const delta = calcDeal(deal)
    expect(delta.pool.B).toBe(0)
    expect(delta.mount.B).toBe(40) // 2 × 20 = 40
    expect(delta.whists).toHaveLength(0) // вистующим ничего не пишется
  })
})

describe('calcDeal — Распасы', () => {
  it('1-й распас: A взял 0 → бонус -4 с горы (при большой горе)', async () => {
    const { applyDeal } = await import('./index')
    const state = initState()
    state.mount = { A: 58, B: 0, C: 40, D: 0 }
    const deal: Deal = {
      type: 'raspas',
      dealer: 'A',
      firstHand: 'B',
      level: 1,
      tricks: { A: 0, B: 3, C: 7, D: 0 },
    }
    const newState = applyDeal(state, deal)
    // A взял 0 → -4 с горы: 58 - 4 = 54. Также amnesty min=0, штрафа нет.
    expect(newState.mount.A).toBe(54)
    // B: (3-0)*2 = 6 → 0+6=6
    expect(newState.mount.B).toBe(6)
    // C: (7-0)*2 = 14 → 40+14=54
    expect(newState.mount.C).toBe(54)
  })

  it('1-й распас: A взял 0 при горе 2 → уходит в минус (гора не ограничена)', async () => {
    const { applyDeal } = await import('./index')
    const state = initState()
    state.mount = { A: 2, B: 0, C: 0, D: 0 }
    const deal: Deal = {
      type: 'raspas',
      dealer: 'A',
      firstHand: 'B',
      level: 1,
      tricks: { A: 0, B: 5, C: 5, D: 0 },
    }
    const newState = applyDeal(state, deal)
    // A: 2 - 4 = -2
    expect(newState.mount.A).toBe(-2)
    expect(newState.mount.B).toBe(10)
    expect(newState.mount.C).toBe(10)
  })

  it('1-й распас: 4-3-3, амнистия минимума', () => {
    const deal: Deal = {
      type: 'raspas',
      dealer: 'A',
      firstHand: 'B',
      level: 1,
      tricks: { A: 4, B: 3, C: 3, D: 0 },
    }
    const delta = calcDeal(deal)
    expect(delta.mount.A).toBe(2) // (4-3) × 2 = 2
    expect(delta.mount.B).toBe(0)
    expect(delta.mount.C).toBe(0)
  })

  it('2-й распас: 5-4-1, цена 4', () => {
    const deal: Deal = {
      type: 'raspas',
      dealer: 'A',
      firstHand: 'B',
      level: 2,
      tricks: { A: 5, B: 4, C: 1, D: 0 },
    }
    const delta = calcDeal(deal)
    expect(delta.mount.A).toBe((5 - 1) * 4) // 16
    expect(delta.mount.B).toBe((4 - 1) * 4) // 12
    expect(delta.mount.C).toBe(0)
  })

  it('3-й (8-мерный) распас: 6-2-2, цена 6', () => {
    const deal: Deal = {
      type: 'raspas',
      dealer: 'A',
      firstHand: 'B',
      level: 3,
      tricks: { A: 6, B: 2, C: 2, D: 0 },
    }
    const delta = calcDeal(deal)
    expect(delta.mount.A).toBe((6 - 2) * 6) // 24
    expect(delta.mount.B).toBe(0)
    expect(delta.mount.C).toBe(0)
  })
})

describe('calcDeal — Уход без 3', () => {
  it('уход без 3 на 6♣ → гора 12, вистов нет', () => {
    const deal: Deal = {
      type: 'giveup',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' },
    }
    const delta = calcDeal(deal)
    expect(delta.mount.A).toBe(12) // 3 × 4 = 12
    expect(delta.pool.A).toBe(0)
    expect(delta.whists).toHaveLength(0)
  })

  it('уход без 3 на 8БК → гора 36', () => {
    const deal: Deal = {
      type: 'giveup',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      contract: { kind: 'game', level: 8, suit: 'NT' },
    }
    const delta = calcDeal(deal)
    expect(delta.mount.B).toBe(36) // 3 × 12 = 36
  })
})

describe('nextRaspasState + nextFirstHand', () => {
  it('1-й распас в normal → afterFirst; первая рука сдвигается', () => {
    const state = initState()
    const deal: Deal = { type: 'raspas', dealer: 'C', firstHand: 'A', level: 1, tricks: { A: 4, B: 3, C: 3, D: 0 } }
    const newState = nextRaspasState(state, deal)
    expect(newState).toBe('afterFirst')
    expect(nextFirstHand(state, deal, newState)).toBe('B')
  })

  it('2-й распас сразу выводит на 8-мерные: минимум стал 8 — значит уже они', () => {
    // Раньше между ними была лишняя ступень «после 2-го распаса» с тем же
    // минимумом 8 и той же ценой 6. Отличалась только тем, что в ней не работало
    // правило «рука остаётся» — из-за чего 26.08.2026 на 35-й сдаче рука ушла.
    const state: GameState = { ...initState(), raspasState: 'afterFirst' }
    const deal: Deal = { type: 'raspas', dealer: 'C', firstHand: 'A', level: 2, tricks: { A: 4, B: 3, C: 3, D: 0 } }
    expect(nextRaspasState(state, deal)).toBe('eightRaspas')
    // И минимум, и цена взятки при этом те же, что были в старой ступени
    expect(minBidFor('eightRaspas')).toBe(8)
  })

  it('уход без трёх на 8-мерных оставляет руку на месте', () => {
    // Ровно тот случай: Олег заказал восьмерную и ушёл без трёх, рука должна
    // остаться. Проверяем со ВТОРОГО распаса, а не с третьего.
    let s: GameState = { ...initState(), raspasState: 'afterFirst' }
    s = applyDeal(s, { type: 'raspas', dealer: 'C', firstHand: 'A', level: 2, tricks: { A: 4, B: 3, C: 3, D: 0 } })
    expect(s.raspasState).toBe('eightRaspas')
    const handBefore = s.firstHand
    s = applyDeal(s, {
      type: 'giveup', dealer: prevClockwise(handBefore), firstHand: handBefore,
      player: 'B', contract: { kind: 'game', level: 8 },
    })
    expect(s.firstHand).toBe(handBefore) // осталась
    expect(s.raspasState).toBe('eightRaspas')
  })

  it('3-й распас в afterSecond → eightRaspas', () => {
    const state: GameState = { ...initState(), raspasState: 'afterSecond' }
    const deal: Deal = { type: 'raspas', dealer: 'C', firstHand: 'A', level: 3, tricks: { A: 4, B: 3, C: 3, D: 0 } }
    expect(nextRaspasState(state, deal)).toBe('eightRaspas')
  })

  it('ремиз 8+ на 8-мерных → первая рука остаётся', () => {
    const state: GameState = { ...initState(), raspasState: 'eightRaspas', firstHand: 'B' }
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      contract: { kind: 'game', level: 8, suit: 'S' },
      playerTricks: 7, // не сыграл
      vistersTricks: { A: 2, B: 0, C: 1, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const newState = nextRaspasState(state, deal)
    expect(newState).toBe('eightRaspas') // остаёмся
    expect(nextFirstHand(state, deal, newState)).toBe('B') // остаётся B
  })

  it('7-я сыграна в состоянии afterFirst → возврат в normal', () => {
    const state: GameState = { ...initState(), raspasState: 'afterFirst', firstHand: 'B' }
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      contract: { kind: 'game', level: 7, suit: 'S' },
      playerTricks: 7, // сыграл
      vistersTricks: { A: 2, B: 0, C: 1, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    expect(nextRaspasState(state, deal)).toBe('normal')
  })

  it('7-я ремиз в состоянии afterFirst → остаётся afterFirst', () => {
    const state: GameState = { ...initState(), raspasState: 'afterFirst', firstHand: 'B' }
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      contract: { kind: 'game', level: 7, suit: 'S' },
      playerTricks: 6, // недобор
      vistersTricks: { A: 2, B: 0, C: 2, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    expect(nextRaspasState(state, deal)).toBe('afterFirst')
  })

  it('успешная 8-мерная на 8-мерных → выход в normal + первая рука сдвигается', () => {
    const state: GameState = { ...initState(), raspasState: 'eightRaspas', firstHand: 'B' }
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      contract: { kind: 'game', level: 8, suit: 'S' },
      playerTricks: 8,
      vistersTricks: { A: 1, B: 0, C: 1, D: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const newState = nextRaspasState(state, deal)
    expect(newState).toBe('normal') // выход
    expect(nextFirstHand(state, deal, newState)).toBe('C') // B → C
  })

  it('успешный мизер на 8-мерных → выход в normal', () => {
    const state: GameState = { ...initState(), raspasState: 'eightRaspas', firstHand: 'B' }
    const deal: Deal = {
      type: 'misere',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      blind: false,
      playerTricks: 0,
    }
    expect(nextRaspasState(state, deal)).toBe('normal')
  })

  it('пойманный мизер на 8-мерных → первая рука остаётся', () => {
    const state: GameState = { ...initState(), raspasState: 'eightRaspas', firstHand: 'B' }
    const deal: Deal = {
      type: 'misere',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      blind: false,
      playerTricks: 2,
    }
    const newState = nextRaspasState(state, deal)
    expect(newState).toBe('eightRaspas')
    expect(nextFirstHand(state, deal, newState)).toBe('B')
  })
})

describe('8-мерные распасы: уход без 3 и полный круг', () => {
  it('уход без 3 на 8-мерных → первая рука ОСТАЁТСЯ', async () => {
    const { applyDeal } = await import('./index')
    const state: GameState = {
      ...initState(),
      raspasState: 'eightRaspas',
      firstHand: 'B',
      eightRaspasCounter: { A: 0, B: 1, C: 0, D: 0 },
    }
    const deal: Deal = {
      type: 'giveup',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      contract: { kind: 'game', level: 8, suit: 'S' },
    }
    const newState = applyDeal(state, deal)
    expect(newState.firstHand).toBe('B') // осталась
    expect(newState.raspasState).toBe('eightRaspas') // тоже осталось
  })

  it('распас в 8-мерных → все побывали первой рукой → выход в normal', async () => {
    const { applyDeal } = await import('./index')
    // Была A первой рукой в 8-мерных. Уже A=1, B=1 (побывали). C только сейчас.
    const state: GameState = {
      ...initState(),
      raspasState: 'eightRaspas',
      firstHand: 'C',
      eightRaspasCounter: { A: 1, B: 1, C: 0, D: 0 },
    }
    const deal: Deal = {
      type: 'raspas',
      dealer: 'B',
      firstHand: 'C',
      level: 3,
      tricks: { A: 3, B: 3, C: 4, D: 0 },
    }
    const newState = applyDeal(state, deal)
    // C побывал первой рукой в этой сдаче → counter стал A=1, B=1, C=1 → полный круг → normal
    expect(newState.raspasState).toBe('normal')
    expect(newState.eightRaspasCounter).toEqual({ A: 0, B: 0, C: 0, D: 0 })
  })

  it('распас в 8-мерных → не полный круг → остаёмся в 8-мерных', async () => {
    const { applyDeal } = await import('./index')
    const state: GameState = {
      ...initState(),
      raspasState: 'eightRaspas',
      firstHand: 'A',
      eightRaspasCounter: { A: 0, B: 0, C: 0, D: 0 }, // только что зашли
    }
    const deal: Deal = {
      type: 'raspas',
      dealer: 'C',
      firstHand: 'A',
      level: 3,
      tricks: { A: 4, B: 3, C: 3, D: 0 },
    }
    const newState = applyDeal(state, deal)
    expect(newState.raspasState).toBe('eightRaspas') // остались
    expect(newState.eightRaspasCounter.A).toBe(1) // A побывал
    expect(newState.eightRaspasCounter.B).toBe(0)
    expect(newState.eightRaspasCounter.C).toBe(0)
  })
})

describe('8-мерные распасы: счётчик и полный круг', () => {
  it('вход в 8-мерные → счётчик первой руки = 1, остальные 0', () => {
    const state: GameState = { ...initState(), raspasState: 'afterSecond', firstHand: 'A' }
    const deal: Deal = { type: 'raspas', dealer: 'C', firstHand: 'A', level: 3, tricks: { A: 4, B: 3, C: 3, D: 0 } }
    const newState = nextRaspasState(state, deal)
    expect(newState).toBe('eightRaspas')
    const counter = updateEightCounter(state, newState, 'A')
    expect(counter).toEqual({ A: 1, B: 0, C: 0, D: 0 })
    expect(isEightRaspasFullCircle(counter)).toBe(false)
  })

  it('после того как каждый посидел на 1 руке ≥ 1 раз — полный круг', () => {
    const counter = { A: 1, B: 1, C: 1, D: 0 } as Record<PlayerId, number>
    expect(isEightRaspasFullCircle(counter)).toBe(true)
  })

  it('один сидел много раз, другой ни разу — не полный круг', () => {
    const counter = { A: 3, B: 0, C: 1, D: 0 } as Record<PlayerId, number>
    expect(isEightRaspasFullCircle(counter)).toBe(false)
  })
})

describe('Переполнение пули (передача по часовой)', () => {
  it('A набрал 12 при пуле 11 → 1 передан B, A пишет 10 вистов на B (в свою пользу)', async () => {
    const { applyDeal } = await import('./index')
    const state = initState()
    state.poolLimit = 11
    state.pool = { A: 10, B: 0, C: 0, D: 0 }
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' },
      playerTricks: 7,
      vistersTricks: { A: 0, B: 0, C: 0, D: 0 },
      vistDecisions: { A: 'vist', B: 'pass', C: 'pass' },
    }
    const newState = applyDeal(state, deal)
    expect(newState.pool.A).toBe(11)
    expect(newState.pool.B).toBe(1)
    // A передал 1 очко B → A получает 10 вистов от B → A пишет 10 на B
    expect(newState.whists.A.B).toBe(10)
  })

  it('A переполнил на 7 при закрытых Д и почти закрытом О → 1 к О, 6 остаток × 2 = 12 с горы А', async () => {
    const { applyDeal } = await import('./index')
    const state = initState()
    state.poolLimit = 11
    state.pool = { A: 11, B: 11, C: 10, D: 0 }
    state.mount = { A: 100, B: 0, C: 0, D: 0 }
    // A играет 9♥ и сыграл → пуля +8, все нужно передать/списать.
    // C принимает 1 (стал 11). Остаток 7. По правилу: 7 × 2 = 14 с горы А.
    // A: 100 - 14 = 86
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 9, suit: 'H' },
      playerTricks: 9,
      vistersTricks: { A: 0, B: 0, C: 1, D: 0 },
      vistDecisions: { A: 'vist', B: 'pass', C: 'vist' },
    }
    const newState = applyDeal(state, deal)
    expect(newState.pool.A).toBe(11)
    expect(newState.pool.B).toBe(11)
    expect(newState.pool.C).toBe(11)
    expect(newState.mount.A).toBe(86) // 100 − 14
    // Остальные висты за 1 переданное очко = A пишет 10 на C (в свою пользу)
    expect(newState.whists.A.C).toBeGreaterThanOrEqual(10)
  })

  it('A переполнил на 2, B уже закрыт — 2 очка передаются C через B', async () => {
    const { applyDeal } = await import('./index')
    const state = initState()
    state.poolLimit = 11
    state.pool = { A: 9, B: 11, C: 5, D: 0 } // A 9, B закрыт, C 5
    // A играет девятерную и сыграл → пуля +8 → 17 (переполнение 6)
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 9, suit: 'H' },
      playerTricks: 9,
      vistersTricks: { A: 0, B: 0, C: 1, D: 0 },
      vistDecisions: { A: 'vist', B: 'pass', C: 'vist' },
    }
    const newState = applyDeal(state, deal)
    expect(newState.pool.A).toBe(11) // A закрыл
    expect(newState.pool.B).toBe(11) // B был закрыт — не растёт
    expect(newState.pool.C).toBe(11) // C получил 6, но макс 11 → +6 = 11 (было 5)
    // A передал C 6 очков → A получает 60 вистов от C
    expect(newState.whists.A.C).toBeGreaterThanOrEqual(60)
  })
})

describe('settle — финальный расчёт', () => {
  it('сумма net всех игроков = 0', () => {
    const state = initState()
    state.pool = { A: 10, B: 5, C: 8, D: 0 }
    state.mount = { A: 4, B: 12, C: 2, D: 0 }
    state.whists = {
      A: { A: 0, B: 20, C: 15, D: 0 },
      B: { A: 10, B: 0, C: 25, D: 0 },
      C: { A: 5, B: 8, C: 0, D: 0 },
      D: zeroScores(),
    }
    const result = settle(state)
    const sum = result.net.A + result.net.B + result.net.C
    expect(Math.abs(sum)).toBeLessThan(2) // допускаем округление ≤ 2
  })

  it('пуля A=10, все остальные 0 — A на плюсе', () => {
    const state = initState()
    state.pool = { A: 10, B: 0, C: 0, D: 0 }
    const result = settle(state)
    expect(result.net.A).toBeGreaterThan(0)
    expect(result.net.B).toBeLessThan(0)
    expect(result.net.C).toBeLessThan(0)
  })

  it('гора одного игрока — он в минусе', () => {
    const state = initState()
    state.mount = { A: 0, B: 20, C: 0, D: 0 }
    const result = settle(state)
    expect(result.net.B).toBeLessThan(0)
    expect(result.net.A).toBeGreaterThan(0)
    expect(result.net.C).toBeGreaterThan(0)
  })

  it('попарные долги: сумма отданного = сумма полученного', () => {
    const state = initState()
    state.pool = { A: 5, B: 8, C: 2, D: 0 }
    state.mount = { A: 12, B: 4, C: 20, D: 0 }
    state.whists = {
      A: { A: 0, B: 15, C: 30, D: 0 },
      B: { A: 20, B: 0, C: 10, D: 0 },
      C: { A: 5, B: 12, C: 0, D: 0 },
      D: zeroScores(),
    }
    const result = settle(state)
    const totalDebt = result.pairwise.reduce((s, d) => s + d.amount, 0)
    // Сумма позитивного net = сумма долгов
    const totalPositive = Math.max(0, result.net.A) + Math.max(0, result.net.B) + Math.max(0, result.net.C)
    expect(Math.abs(totalDebt - totalPositive)).toBeLessThan(3)
  })
})

// ============================================================================
// Стол на ЧЕТВЕРЫХ (этап 1 универсализации)
// Проверяем только каркас: кто участвует в сдаче и попадают ли взятки четвёртого
// в расчёт. Турнирные правила ФСПР (премия за прикуп, консоляция сдающему,
// распасы без амнистии) появятся отдельно — см. PROGRESS.md, этап 3.
// ============================================================================

const SEATS4: PlayerId[] = ['A', 'B', 'C', 'D']

function initState4(): GameState {
  return { ...initState(), players: { A: 'А', B: 'Б', C: 'В', D: 'Г' }, seats: SEATS4 }
}

describe('Стол на четверых — каркас', () => {
  it('сдающий вне розыгрыша: вистующих двое, сдающему ничего не пишется', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'D', // D сдал — в розыгрыше не участвует
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 7,
      vistersTricks: { B: 1, C: 2 },
      vistDecisions: { B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal, SEATS4)
    expect(delta.pool.A).toBe(4)
    expect(delta.whists.find((w) => w.from === 'B' && w.to === 'A')?.amount).toBe(8)
    expect(delta.whists.find((w) => w.from === 'C' && w.to === 'A')?.amount).toBe(16)
    // Сдающий не вистовал и ничего не пишет
    expect(delta.whists.find((w) => w.from === 'D')).toBeUndefined()
    expect(delta.mount.D).toBe(0)
    expect(delta.pool.D).toBe(0)
  })

  it('сдающий не считается пасовавшим: игра НЕ уходит в автомат', () => {
    // Втроём «оба пасовали» = автомат без розыгрыша. Вчетвером сдающий вообще
    // не торгуется, и его молчание не должно превращать сдачу в автомат.
    const deal: Deal = {
      type: 'game',
      dealer: 'D',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 6 },
      playerTricks: 4, // ремиз без 2
      vistersTricks: { B: 3, C: 3 },
      vistDecisions: { B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal, SEATS4)
    expect(delta.pool.A).toBe(0) // не автомат — играющий сел
    expect(delta.mount.A).toBe(8) // недобор 2 × 4
  })

  it('распас вчетвером: сдающий пишет взятки прикупа на общих основаниях', () => {
    // Кодекс ФСПР 6.5: прикуп открывается по карте, первые два хода делает
    // сдатчик и пишет за взятки как все. Сумма взяток всех четверых = 10.
    const deal: Deal = {
      type: 'raspas',
      dealer: 'D',
      firstHand: 'A',
      level: 1,
      tricks: { A: 4, B: 3, C: 1, D: 2 },
    }
    const delta = calcDeal(deal, SEATS4)
    // Минимум 1 у C — амнистия. Цена взятки 1-го распаса = 2.
    expect(delta.mount.A).toBe(6) // (4−1) × 2
    expect(delta.mount.B).toBe(4) // (3−1) × 2
    expect(delta.mount.C).toBe(0) // минимум
    expect(delta.mount.D).toBe(2) // (2−1) × 2 — взятки сдающего считаются
  })

  it('первая рука обходит все четыре места по часовой', () => {
    const state = initState4()
    const deal: Deal = {
      type: 'raspas', dealer: 'D', firstHand: 'A', level: 1, tricks: { A: 4, B: 3, C: 2, D: 1 },
    }
    let s = applyDeal(state, deal)
    expect(s.firstHand).toBe('B')
    s = applyDeal(s, { ...deal, firstHand: 'B', dealer: 'A' })
    expect(s.firstHand).toBe('C')
    s = applyDeal(s, { ...deal, firstHand: 'C', dealer: 'B' })
    expect(s.firstHand).toBe('D')
    s = applyDeal(s, { ...deal, firstHand: 'D', dealer: 'C' })
    expect(s.firstHand).toBe('A') // круг замкнулся
  })

  it('итог вчетвером сходится: сумма net = 0', () => {
    const state = initState4()
    state.pool = { A: 10, B: 5, C: 8, D: 3 }
    state.mount = { A: 4, B: 12, C: 2, D: 7 }
    state.whists = {
      A: { A: 0, B: 20, C: 15, D: 5 },
      B: { A: 10, B: 0, C: 25, D: 0 },
      C: { A: 5, B: 8, C: 0, D: 12 },
      D: { A: 3, B: 0, C: 6, D: 0 },
    }
    // Проверяем неокруглённый баланс: он обязан сходиться в ноль ТОЧНО.
    // settle() округляет каждый net для показа, и на «половинках» округление
    // даёт расхождение в пару вистов — это косметика показа, а не ошибка счёта.
    const net = calcNet(state)
    const sum = net.A + net.B + net.C + net.D
    expect(Math.abs(sum)).toBeLessThan(0.001)
  })
})

// ============================================================================
// Заморозка итога сыгранной партии
// ============================================================================

describe('Вмороженная партия не пересчитывается', () => {
  const played: Deal = {
    type: 'game',
    dealer: 'C',
    firstHand: 'A',
    player: 'C',
    contract: { kind: 'game', level: 7 },
    playerTricks: 7,
    vistersTricks: { A: 1, B: 2 },
    vistDecisions: { A: 'vist', B: 'vist' },
  }

  it('идущая партия — пересчитывается из сдач, кеш чинится', () => {
    const g: GameState = { ...initState(), deals: [played] }
    // В кеше мусор, но пули не закрыты — партия идёт, пересчёт обязан выправить
    g.pool = { A: 5, B: 5, C: 5, D: 0 }
    const out = recomputeState(g)
    expect(out.pool.C).toBe(4)
    expect(out.pool.A).toBe(0)
  })

  it('с меткой frozenAt — цифры остаются как записаны, даже неверные', () => {
    const g: GameState = { ...initState(), deals: [played], frozenAt: 1756200000000 }
    g.pool = { A: 9, B: 4, C: 6, D: 0 }
    const out = recomputeState(g)
    // Ровно то, что было записано: партия сыграна, её итог зафиксирован
    expect(out.pool).toEqual({ A: 9, B: 4, C: 6, D: 0 })
    expect(out).toBe(g) // и объект тот же — никакой работы не делалось
  })

  it('завершённая вручную партия БЕЗ метки тоже не пересчитывается', () => {
    // Партии, сыгранные до появления заморозки, метки не имеют. Их защищает сама
    // завершённость — иначе пришлось бы лезть в облако и проставлять метки.
    const g: GameState = { ...initState(), deals: [played], finishedManually: true }
    g.pool = { A: 7, B: 3, C: 5, D: 0 }
    expect(recomputeState(g).pool).toEqual({ A: 7, B: 3, C: 5, D: 0 })
  })

  it('партия с закрытыми пулями не пересчитывается', () => {
    const g: GameState = { ...initState(), deals: [played], poolLimit: 21 }
    g.pool = { A: 21, B: 21, C: 21, D: 0 }
    expect(recomputeState(g).pool).toEqual({ A: 21, B: 21, C: 21, D: 0 })
  })

  it('НЕзавершённая партия пересчитывается как раньше', () => {
    const g: GameState = { ...initState(), deals: [played] }
    g.pool = { A: 9, B: 0, C: 0, D: 0 }
    expect(recomputeState(g).pool.A).toBe(0)
    expect(recomputeState(g).pool.C).toBe(4)
  })

  it('freezeGame ставит метку один раз и не перетирает её', () => {
    const g: GameState = { ...initState(), deals: [played] }
    const once = freezeGame(g, 111)
    expect(once.frozenAt).toBe(111)
    const twice = freezeGame(once, 222)
    expect(twice.frozenAt).toBe(111) // повторная заморозка не сдвигает дату
  })
})

// ============================================================================
// Конвенции: каркас
// ============================================================================

describe('Конвенции партии', () => {
  it('партия без правил считается по пресету «Дом»', () => {
    expect(rulesOf(initState()).id).toBe('home')
  })

  it('пресет «Дом» совпадает с константами, по которым считались старые партии', () => {
    // Если это разойдётся — старые партии посчитаются по-другому. Тест ровно об этом.
    expect(HOME_RULES.poolCost).toEqual(POOL_COST)
    expect(HOME_RULES.mountPenalty).toEqual(MOUNT_PENALTY)
    expect(HOME_RULES.vistPerTrick).toEqual(VIST_PER_TRICK)
    expect(HOME_RULES.vistersDuty).toEqual(VISTERS_DUTY)
    expect(HOME_RULES.visterPenaltyPerMiss).toEqual(VISTER_PENALTY_PER_MISS)
    expect(HOME_RULES.miserePoolCost).toBe(MISERE_POOL_COST)
    expect(HOME_RULES.misereTrickPenalty).toBe(MISERE_TRICK_PENALTY)
    // Лесенки: цена взятки на распасах и минимальный заказ
    expect([1, 2, 3].map((l) => ladderAt(HOME_RULES.raspasCostLadder, l - 1))).toEqual([
      RASPAS_TRICK_COST[1], RASPAS_TRICK_COST[2], RASPAS_TRICK_COST[3],
    ])
    expect([0, 1, 2].map((s) => ladderAt(HOME_RULES.minBidLadder, s))).toEqual([6, 7, 8])
  })

  it('лесенка: последнее значение повторяется дальше', () => {
    // Пятый распас подряд стоит столько же, сколько третий
    expect(ladderAt(HOME_RULES.raspasCostLadder, 4)).toBe(6)
    expect(ladderAt(HOME_RULES.minBidLadder, 9)).toBe(8) // дом: 6-7-8-8-8…
    expect(ladderAt(FSPR_RULES.minBidLadder, 9)).toBe(7) // турнир: 6-7-7-7…
  })

  it('полвиста = половина нормы пары', () => {
    expect(halfVistTricks(HOME_RULES, 6)).toBe(2)
    expect(halfVistTricks(HOME_RULES, 7)).toBe(1)
    // «Уход второго за две (6-я) / за одну (7-я)» — то же самое
    expect(halfVistTricks(FSPR_RULES, 6)).toBe(2)
    expect(halfVistTricks(FSPR_RULES, 7)).toBe(1)
  })

  it('турнир и дом расходятся именно там, где мы договорились', () => {
    expect(FSPR_RULES.vistStyle).toBe('gentleman')
    expect(HOME_RULES.vistStyle).toBe('zhlob')
    expect(FSPR_RULES.vistersDuty[10]).toBe(1) // десятерная вистуется
    expect(HOME_RULES.vistersDuty[10]).toBe(0) // дома проверяется
    expect(FSPR_RULES.raspasWriteEveryTrick).toBe(true)
    expect(HOME_RULES.raspasWriteEveryTrick).toBe(false)
    expect(FSPR_RULES.misereBreaksRaspas).toBe(false)
    expect(HOME_RULES.misereBreaksRaspas).toBe(true)
    expect(FSPR_RULES.allowGiveup).toBe(false)
    expect(FSPR_RULES.prikupBonus).toBe(true)
    expect(FSPR_RULES.poolLimit).toBeNull() // играют на время
  })
})
