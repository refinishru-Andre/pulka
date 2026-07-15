// Тесты движка расчёта — покрывают все ключевые сценарии
// Запуск: npm test

import { describe, it, expect } from 'vitest'
import { calcDeal } from './calc'
import { settle } from './settle'
import { nextRaspasState, nextFirstHand, updateEightCounter, isEightRaspasFullCircle } from './raspas'
import type { Deal, GameState } from './types'

// Хелпер: начальное пустое состояние
function initState(): GameState {
  return {
    players: { A: 'А', B: 'Б', C: 'В' },
    poolLimit: 21,
    createdAt: Date.now(),
    pool: { A: 0, B: 0, C: 0 },
    mount: { A: 0, B: 0, C: 0 },
    whists: {
      A: { A: 0, B: 0, C: 0 },
      B: { A: 0, B: 0, C: 0 },
      C: { A: 0, B: 0, C: 0 },
    },
    firstHand: 'A',
    raspasState: 'normal',
    eightRaspasCounter: { A: 0, B: 0, C: 0 },
    deals: [],
  }
}

describe('calcDeal — Игра сыграна', () => {
  it('7♠ сыграна ровно, оба вистовали, взяли 1+2 — жлобский, каждый за свои', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'C',
      contract: { kind: 'game', level: 7, suit: 'S' },
      playerTricks: 7,
      vistersTricks: { A: 1, B: 2, C: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.C).toBe(4) // сыгранная 7 = 4 в пулю
    expect(delta.mount).toEqual({ A: 0, B: 0, C: 0 })
    // A за 1 взятку = 1 × 8 = 8; B за 2 взятки = 2 × 8 = 16
    const aToC = delta.whists.find((w) => w.from === 'A' && w.to === 'C')?.amount
    const bToC = delta.whists.find((w) => w.from === 'B' && w.to === 'C')?.amount
    expect(aToC).toBe(8)
    expect(bToC).toBe(16)
  })

  it('6♠ (Сталинград): А играл, О пасовал, Д вистовал, взял 3 — жлобский', () => {
    // Живой пример Андрея: А играл 6, взял 7, О пасовал, Д взял 3
    // Но берём 6♣ чтобы не путать со Сталинградом
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 6, suit: 'C' }, // не Сталинград
      playerTricks: 7,
      vistersTricks: { A: 0, B: 0, C: 3 },
      vistDecisions: { A: 'vist', B: 'pass', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(2) // сыграл 6 (даже с запасом)
    // Пара взяла 3 при обязательстве 4 → штраф пары 1×2=2 на активных
    // Активных = C (один). Значит гора C = 2.
    expect(delta.mount.C).toBe(2)
    expect(delta.mount.B).toBe(0)
    // Висты: только активный C пишет за СВОИ 3 взятки = 3 × 4 = 12 на A
    const cToA = delta.whists.find((w) => w.from === 'C' && w.to === 'A')?.amount
    const bToA = delta.whists.find((w) => w.from === 'B' && w.to === 'A')?.amount
    expect(cToA).toBe(12)
    expect(bToA).toBeUndefined() // B пасовал — не пишет
  })

  it('9♥ сыграна с запасом (10 взяток), оба вистовали, взяли по 0', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 9, suit: 'H' },
      playerTricks: 10,
      vistersTricks: { A: 0, B: 0, C: 0 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const delta = calcDeal(deal)
    expect(delta.pool.A).toBe(8) // сыгранная 9 = 8 в пулю
    expect(delta.mount).toEqual({ A: 0, B: 0, C: 0 })
    expect(delta.whists).toHaveLength(0) // вистующие ничего не взяли
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
      vistersTricks: { A: 0, B: 2, C: 3 },
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
      vistersTricks: { A: 1, B: 2, C: 0 },
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

describe('calcDeal — Сталинград (6♠)', () => {
  it('6♠: оба принудительно вистуют, ремиз — жлобский за свои + консоляция', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'C',
      contract: { kind: 'game', level: 6, suit: 'S' },
      playerTricks: 5,
      vistersTricks: { A: 3, B: 2, C: 0 },
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
    expect(delta.mount).toEqual({ A: 0, B: 0, C: 0 })
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
  it('1-й распас: 4-3-3, амнистия минимума', () => {
    const deal: Deal = {
      type: 'raspas',
      dealer: 'A',
      firstHand: 'B',
      level: 1,
      tricks: { A: 4, B: 3, C: 3 },
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
      tricks: { A: 5, B: 4, C: 1 },
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
      tricks: { A: 6, B: 2, C: 2 },
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
    const deal: Deal = { type: 'raspas', dealer: 'C', firstHand: 'A', level: 1, tricks: { A: 4, B: 3, C: 3 } }
    const newState = nextRaspasState(state, deal)
    expect(newState).toBe('afterFirst')
    expect(nextFirstHand(state, deal, newState)).toBe('B')
  })

  it('2-й распас в afterFirst → afterSecond', () => {
    const state: GameState = { ...initState(), raspasState: 'afterFirst' }
    const deal: Deal = { type: 'raspas', dealer: 'C', firstHand: 'A', level: 2, tricks: { A: 4, B: 3, C: 3 } }
    expect(nextRaspasState(state, deal)).toBe('afterSecond')
  })

  it('3-й распас в afterSecond → eightRaspas', () => {
    const state: GameState = { ...initState(), raspasState: 'afterSecond' }
    const deal: Deal = { type: 'raspas', dealer: 'C', firstHand: 'A', level: 3, tricks: { A: 4, B: 3, C: 3 } }
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
      vistersTricks: { A: 2, B: 0, C: 1 },
      vistDecisions: { A: 'vist', B: 'vist', C: 'vist' },
    }
    const newState = nextRaspasState(state, deal)
    expect(newState).toBe('eightRaspas') // остаёмся
    expect(nextFirstHand(state, deal, newState)).toBe('B') // остаётся B
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
      vistersTricks: { A: 1, B: 0, C: 1 },
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

describe('8-мерные распасы: счётчик и полный круг', () => {
  it('вход в 8-мерные → счётчик первой руки = 1, остальные 0', () => {
    const state: GameState = { ...initState(), raspasState: 'afterSecond', firstHand: 'A' }
    const deal: Deal = { type: 'raspas', dealer: 'C', firstHand: 'A', level: 3, tricks: { A: 4, B: 3, C: 3 } }
    const newState = nextRaspasState(state, deal)
    expect(newState).toBe('eightRaspas')
    const counter = updateEightCounter(state, newState, 'A')
    expect(counter).toEqual({ A: 1, B: 0, C: 0 })
    expect(isEightRaspasFullCircle(counter)).toBe(false)
  })

  it('после того как каждый посидел на 1 руке ≥ 1 раз — полный круг', () => {
    const counter = { A: 1, B: 1, C: 1 } as Record<'A' | 'B' | 'C', number>
    expect(isEightRaspasFullCircle(counter)).toBe(true)
  })

  it('один сидел много раз, другой ни разу — не полный круг', () => {
    const counter = { A: 3, B: 0, C: 1 } as Record<'A' | 'B' | 'C', number>
    expect(isEightRaspasFullCircle(counter)).toBe(false)
  })
})

describe('settle — финальный расчёт', () => {
  it('сумма net всех игроков = 0', () => {
    const state = initState()
    state.pool = { A: 10, B: 5, C: 8 }
    state.mount = { A: 4, B: 12, C: 2 }
    state.whists = {
      A: { A: 0, B: 20, C: 15 },
      B: { A: 10, B: 0, C: 25 },
      C: { A: 5, B: 8, C: 0 },
    }
    const result = settle(state)
    const sum = result.net.A + result.net.B + result.net.C
    expect(Math.abs(sum)).toBeLessThan(2) // допускаем округление ≤ 2
  })

  it('пуля A=10, все остальные 0 — A на плюсе', () => {
    const state = initState()
    state.pool = { A: 10, B: 0, C: 0 }
    const result = settle(state)
    expect(result.net.A).toBeGreaterThan(0)
    expect(result.net.B).toBeLessThan(0)
    expect(result.net.C).toBeLessThan(0)
  })

  it('гора одного игрока — он в минусе', () => {
    const state = initState()
    state.mount = { A: 0, B: 20, C: 0 }
    const result = settle(state)
    expect(result.net.B).toBeLessThan(0)
    expect(result.net.A).toBeGreaterThan(0)
    expect(result.net.C).toBeGreaterThan(0)
  })

  it('попарные долги: сумма отданного = сумма полученного', () => {
    const state = initState()
    state.pool = { A: 5, B: 8, C: 2 }
    state.mount = { A: 12, B: 4, C: 20 }
    state.whists = {
      A: { A: 0, B: 15, C: 30 },
      B: { A: 20, B: 0, C: 10 },
      C: { A: 5, B: 12, C: 0 },
    }
    const result = settle(state)
    const totalDebt = result.pairwise.reduce((s, d) => s + d.amount, 0)
    // Сумма позитивного net = сумма долгов
    const totalPositive = Math.max(0, result.net.A) + Math.max(0, result.net.B) + Math.max(0, result.net.C)
    expect(Math.abs(totalDebt - totalPositive)).toBeLessThan(3)
  })
})
