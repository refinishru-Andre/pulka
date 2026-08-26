// Турнирный набор правил (ФСПР) считает иначе, чем домашний.
// Здесь проверяется, ЧТО именно отличается — по каждому пункту кодекса.
// Домашние правила проверяются в calc.test.ts и сверкой reference.test.ts.

import { describe, it, expect } from 'vitest'
import { calcDeal } from './calc'
import { applyDeal } from './index'
import { nextRaspasState, nextFirstHand, minBidFor } from './raspas'
import { HOME_RULES, FSPR_RULES } from './conventions'
import type { Deal, GameState, PlayerId } from './types'
import { PLAYERS, zeroScores, zeroWhists } from './types'

const SEATS4: PlayerId[] = ['A', 'B', 'C', 'D']

function base(): GameState {
  return {
    players: { A: 'А', B: 'Б', C: 'В', D: '' },
    seats: PLAYERS,
    poolLimit: 21,
    createdAt: 0,
    pool: zeroScores(),
    mount: zeroScores(),
    whists: zeroWhists(),
    firstHand: 'A',
    raspasState: 'normal',
    eightRaspasCounter: zeroScores(),
    deals: [],
  }
}
const home = (): GameState => base()
const fspr3 = (): GameState => ({ ...base(), rules: FSPR_RULES })
const fspr4 = (): GameState => ({
  ...base(),
  players: { A: 'А', B: 'Б', C: 'В', D: 'Г' },
  seats: SEATS4,
  rules: FSPR_RULES,
})

const sumWhists = (d: { whists: { amount: number }[] }) =>
  d.whists.reduce((s, w) => s + w.amount, 0)

describe('ФСПР: вист джентльменский', () => {
  const deal: Deal = {
    type: 'game',
    dealer: 'C',
    firstHand: 'A',
    player: 'A',
    contract: { kind: 'game', level: 7 },
    playerTricks: 7,
    vistersTricks: { B: 1, C: 2 },
    vistDecisions: { B: 'vist', C: 'vist' },
  }

  it('взятки пары делятся поровну, кто бы их ни взял', () => {
    const g = calcDeal(deal, PLAYERS, FSPR_RULES)
    // Пара взяла 3, делим пополам: по 1.5 взятки × 8 = 12 каждому
    expect(g.whists.find((w) => w.from === 'B')?.amount).toBe(12)
    expect(g.whists.find((w) => w.from === 'C')?.amount).toBe(12)
  })

  it('дома те же взятки пишутся каждым за себя', () => {
    const h = calcDeal(deal, PLAYERS, HOME_RULES)
    expect(h.whists.find((w) => w.from === 'B')?.amount).toBe(8)
    expect(h.whists.find((w) => w.from === 'C')?.amount).toBe(16)
  })

  it('сумма вистов одна и та же — меняется только дележ', () => {
    expect(sumWhists(calcDeal(deal, PLAYERS, FSPR_RULES))).toBe(
      sumWhists(calcDeal(deal, PLAYERS, HOME_RULES)),
    )
  })

  it('главное отличие: пасовавший тоже получает свою половину', () => {
    // B вистовал и взял все 3 взятки пары, C пасовал
    const oneVists: Deal = {
      ...deal,
      vistersTricks: { B: 3, C: 0 },
      vistDecisions: { B: 'vist', C: 'pass' },
    }
    const g = calcDeal(oneVists, PLAYERS, FSPR_RULES)
    expect(g.whists.find((w) => w.from === 'B')?.amount).toBe(12) // 1.5 × 8
    expect(g.whists.find((w) => w.from === 'C')?.amount).toBe(12) // столько же, хоть и пасовал

    // Дома пасовавший не получает ничего: все 3 взятки пишет вистовавший
    const h = calcDeal(oneVists, PLAYERS, HOME_RULES)
    expect(h.whists.find((w) => w.from === 'B')?.amount).toBe(24) // 3 × 8
    expect(h.whists.find((w) => w.from === 'C')).toBeUndefined()
  })

  it('но штраф за недобор платит только вистовавший — пасовавший не виноват', () => {
    // Норма пары на семерной 2, пара взяла 0
    const oneVists: Deal = {
      ...deal,
      playerTricks: 10,
      vistersTricks: { B: 0, C: 0 },
      vistDecisions: { B: 'vist', C: 'pass' },
    }
    const g = calcDeal(oneVists, PLAYERS, FSPR_RULES)
    expect(g.mount.B).toBe(8) // 2 недобранные × 4
    expect(g.mount.C).toBe(0) // пасовавший в гору не пишет
  })
})

describe('ФСПР: распасы пишутся за каждую взятку', () => {
  const deal: Deal = {
    type: 'raspas',
    dealer: 'C',
    firstHand: 'A',
    level: 1,
    tricks: { A: 4, B: 3, C: 3 },
  }

  it('в гору идёт каждая своя взятка, без амнистии минимума', () => {
    const g = calcDeal(deal, PLAYERS, FSPR_RULES)
    expect(g.mount.A).toBe(8) // 4 × 2
    expect(g.mount.B).toBe(6) // 3 × 2
    expect(g.mount.C).toBe(6) // 3 × 2
  })

  it('дома минимум амнистируется', () => {
    const h = calcDeal(deal, PLAYERS, HOME_RULES)
    expect(h.mount.A).toBe(2)
    expect(h.mount.B).toBe(0)
    expect(h.mount.C).toBe(0)
  })

  it('обе записи отличаются на одно число у всех — на итог выбор не влияет', () => {
    const g = calcDeal(deal, PLAYERS, FSPR_RULES)
    const h = calcDeal(deal, PLAYERS, HOME_RULES)
    const diffs = PLAYERS.map((p) => g.mount[p] - h.mount[p])
    expect(new Set(diffs).size).toBe(1)
  })

  it('за 0 взяток поблажка есть у всех, кроме сдающего', () => {
    const d: Deal = {
      type: 'raspas',
      dealer: 'D',
      firstHand: 'A',
      level: 1,
      tricks: { A: 5, B: 5, C: 0, D: 0 },
    }
    const g = calcDeal(d, SEATS4, FSPR_RULES)
    expect(g.mount.C).toBe(-4) // минус цена 2 взяток
    expect(g.mount.D).toBe(0) // сдающему не даётся
  })
})

describe('ФСПР: премия за быстрые взятки в прикупе', () => {
  it('вчетвером её пишет сдатчик на играющего целиком', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'D',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 7,
      vistersTricks: { B: 2, C: 1 },
      vistDecisions: { B: 'vist', C: 'vist' },
      prikupFastTricks: 2, // туз и король одной масти
    }
    const g = calcDeal(deal, SEATS4, FSPR_RULES)
    expect(g.whists.find((w) => w.from === 'D' && w.to === 'A')?.amount).toBe(16) // 2 × 8
  })

  it('втроём каждый соперник пишет половину, даже если сдавал сам играющий', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'A', // играющий сдавал сам себе
      firstHand: 'B',
      player: 'A',
      contract: { kind: 'game', level: 6 },
      playerTricks: 6,
      vistersTricks: { B: 2, C: 2 },
      vistDecisions: { B: 'vist', C: 'vist' },
      prikupFastTricks: 3, // два туза
    }
    const g = calcDeal(deal, PLAYERS, FSPR_RULES)
    // 3 взятки × 4 = 12 всего, по 6 с каждого соперника — сверх вистов за розыгрыш
    expect(g.whists.filter((w) => w.from === 'B' && w.to === 'A').map((w) => w.amount)).toContain(6)
    expect(g.whists.filter((w) => w.from === 'C' && w.to === 'A').map((w) => w.amount)).toContain(6)
  })

  it('пишется и когда играющий сел — сдатчик не виноват в чужом ремизе', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'D',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 5, // без двух
      vistersTricks: { B: 3, C: 2 },
      vistDecisions: { B: 'vist', C: 'vist' },
      prikupFastTricks: 1,
    }
    const g = calcDeal(deal, SEATS4, FSPR_RULES)
    const fromDealer = g.whists.filter((w) => w.from === 'D' && w.to === 'A').map((w) => w.amount)
    expect(fromDealer).toContain(8) // премия 1 × 8
    expect(fromDealer).toContain(16) // и отдельно консоляция 2 × 8
  })

  it('дома премии нет вообще', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 7,
      vistersTricks: { B: 2, C: 1 },
      vistDecisions: { B: 'vist', C: 'vist' },
      prikupFastTricks: 3,
    }
    const h = calcDeal(deal, PLAYERS, HOME_RULES)
    expect(h.whists.map((w) => w.amount).sort((a, b) => a - b)).toEqual([8, 16])
  })
})

describe('ФСПР: выход из распасов затруднён', () => {
  it('минимальный заказ встаёт на 7 и дальше не растёт', () => {
    expect(minBidFor('afterFirst', FSPR_RULES)).toBe(7)
    expect(minBidFor('afterSecond', FSPR_RULES)).toBe(7)
    expect(minBidFor('eightRaspas', FSPR_RULES)).toBe(7)
    expect(minBidFor('afterSecond', HOME_RULES)).toBe(8) // дома лесенка круче
  })

  it('мизер распасы не гасит — он не вистуется в принципе', () => {
    const played: Deal = {
      type: 'misere',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      blind: false,
      playerTricks: 0,
    }
    expect(nextRaspasState({ ...fspr3(), raspasState: 'afterFirst' }, played)).toBe('afterFirst')
    expect(nextRaspasState({ ...home(), raspasState: 'afterFirst' }, played)).toBe('normal')
  })

  it('игра, где все спасовали, не выход — хотя формально сыграна', () => {
    const passed: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 8 },
      playerTricks: 8,
      vistersTricks: {},
      vistDecisions: { B: 'pass', C: 'pass' },
    }
    const t = { ...fspr3(), raspasState: 'afterFirst' as const }
    expect(nextRaspasState(t, passed)).toBe('afterFirst')
    // дома такая игра распасы гасит
    expect(nextRaspasState({ ...home(), raspasState: 'afterFirst' }, passed)).toBe('normal')
  })

  it('завистованная сыгранная игра — выход', () => {
    const visted: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 8 },
      playerTricks: 8,
      vistersTricks: { B: 2 },
      vistDecisions: { B: 'vist', C: 'pass' },
    }
    expect(nextRaspasState({ ...fspr3(), raspasState: 'afterFirst' }, visted)).toBe('normal')
  })

  it('подсадом не выходят', () => {
    const failed: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 8 },
      playerTricks: 6,
      vistersTricks: { B: 2, C: 2 },
      vistDecisions: { B: 'vist', C: 'vist' },
    }
    expect(nextRaspasState({ ...fspr3(), raspasState: 'afterFirst' }, failed)).toBe('afterFirst')
  })
})

describe('ФСПР: сдача всегда идёт по часовой', () => {
  const failed: Deal = {
    type: 'game',
    dealer: 'D',
    firstHand: 'A',
    player: 'A',
    contract: { kind: 'game', level: 9 },
    playerTricks: 5,
    vistersTricks: { B: 3, C: 2 },
    vistDecisions: { B: 'vist', C: 'vist' },
  }

  it('рука не остаётся даже на 8-мерных распасах', () => {
    const t = { ...fspr4(), raspasState: 'eightRaspas' as const }
    expect(nextFirstHand(t, failed, 'eightRaspas')).toBe('B')
  })

  it('дома при несыгранной девятерной на 8-мерных рука остаётся', () => {
    const h = { ...home(), raspasState: 'eightRaspas' as const }
    expect(nextFirstHand(h, failed, 'eightRaspas')).toBe('A')
  })
})

describe('ФСПР: сдающий вчетвером', () => {
  it('может вистовать, но за недобор взяток в гору не платит', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'D',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 8 },
      playerTricks: 10,
      vistersTricks: { B: 0, C: 0, D: 0 },
      vistDecisions: { B: 'pass', C: 'pass', D: 'vist' },
    }
    const g = calcDeal(deal, SEATS4, FSPR_RULES)
    expect(g.pool.A).toBe(6)
    expect(g.mount.D).toBe(0) // норма пары не взята, но сдатчик не отвечает
    expect(g.mount.B).toBe(0)
    expect(g.mount.C).toBe(0)
  })

  it('получает консоляцию за подсад, хотя в розыгрыше не участвовал', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'D',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 5, // без двух
      vistersTricks: { B: 3, C: 2 },
      vistDecisions: { B: 'vist', C: 'vist' },
    }
    const g = calcDeal(deal, SEATS4, FSPR_RULES)
    expect(g.mount.A).toBe(16) // 2 недобора × 8
    expect(g.whists.filter((w) => w.from === 'D' && w.to === 'A').map((w) => w.amount)).toEqual([16])
  })

  it('дома консоляция сдающему не пишется', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'D',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 5,
      vistersTricks: { B: 3, C: 2 },
      vistDecisions: { B: 'vist', C: 'vist' },
    }
    const h = calcDeal(deal, SEATS4, HOME_RULES)
    expect(h.whists.filter((w) => w.from === 'D')).toHaveLength(0)
  })
})

describe('Ручная корректировка', () => {
  const adj = (over: Partial<Extract<Deal, { type: 'adjust' }>>): Deal => ({
    type: 'adjust',
    dealer: 'C',
    firstHand: 'A',
    player: 'B',
    target: 'mount',
    amount: 47,
    note: 'ход вне очереди',
    ...over,
  })

  it('пишет в гору любое число — величина штрафа не ограничена', () => {
    expect(calcDeal(adj({ amount: 47 })).mount.B).toBe(47)
    expect(calcDeal(adj({ amount: 4 })).mount.B).toBe(4)
    expect(calcDeal(adj({ amount: 250 })).mount.B).toBe(250)
  })

  it('умеет списывать: отрицательное число', () => {
    expect(calcDeal(adj({ amount: -13, note: 'пересчёт по договорённости' })).mount.B).toBe(-13)
  })

  it('умеет писать в пулю и в висты', () => {
    expect(calcDeal(adj({ target: 'pool', amount: 3 })).pool.B).toBe(3)
    expect(calcDeal(adj({ target: 'whists', to: 'C', amount: 40 })).whists).toEqual([
      { from: 'B', to: 'C', amount: 40 },
    ])
  })

  it('не сбивает состояние распасов, руку передаёт по часовой', () => {
    const t = { ...home(), raspasState: 'afterFirst' as const }
    const after = applyDeal(t, adj({ amount: 10 }))
    expect(after.mount.B).toBe(10)
    expect(after.raspasState).toBe('afterFirst')
    expect(after.firstHand).toBe('B')
  })
})
