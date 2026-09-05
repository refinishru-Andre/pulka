// Турнирный набор правил (ФСПР) считает иначе, чем домашний.
// Здесь проверяется, ЧТО именно отличается — по каждому пункту кодекса.
// Домашние правила проверяются в calc.test.ts и сверкой reference.test.ts.

import { describe, it, expect } from 'vitest'
import { calcDeal } from './calc'
import { applyDeal } from './index'
import { nextRaspasState, nextFirstHand, minBidFor } from './raspas'
import { settle } from './settle'
import { dealBreakdown } from './report'
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

  it('когда вистуют ОБА — каждый за свои, стиль виста ни при чём', () => {
    // Делить нечего: оба в игре, каждый пишет свои взятки. Турнир и дом совпадают.
    const g = calcDeal(deal, PLAYERS, FSPR_RULES)
    const h = calcDeal(deal, PLAYERS, HOME_RULES)
    expect(g.whists.find((w) => w.from === 'B')?.amount).toBe(8) // 1 взятка × 8
    expect(g.whists.find((w) => w.from === 'C')?.amount).toBe(16) // 2 взятки × 8
    expect(g.whists).toEqual(h.whists)
  })

  it('вся разница — когда один вистовал, а другой пасовал', () => {
    // B вистовал и взял все 3 взятки пары, C пасовал
    const oneVists: Deal = {
      ...deal,
      vistersTricks: { B: 3, C: 0 },
      vistDecisions: { B: 'vist', C: 'pass' },
    }
    // Турнир: делим поровну между обоими защитниками, пасовавший при своих
    const g = calcDeal(oneVists, PLAYERS, FSPR_RULES)
    expect(g.whists.find((w) => w.from === 'B')?.amount).toBe(12) // 1.5 × 8
    expect(g.whists.find((w) => w.from === 'C')?.amount).toBe(12) // столько же, хоть и пасовал

    // Дома пасовавшему ноль: все 3 взятки забирает вистовавший
    const h = calcDeal(oneVists, PLAYERS, HOME_RULES)
    expect(h.whists.find((w) => w.from === 'B')?.amount).toBe(24) // 3 × 8
    expect(h.whists.find((w) => w.from === 'C')).toBeUndefined()

    // Сумма при этом одна и та же — меняется только дележ
    expect(sumWhists(g)).toBe(sumWhists(h))
  })

  it('на восьмерной оба вистующих платят по ПОЛНОЙ половине цены игры', () => {
    // Норма пары на восьмерной — 1 взятка. Пара не взяла ни одной.
    // Каждый пишет 6 (половина от 12 — целой цены восьмерной в горе),
    // а не по 3 на брата. Штраф от стиля виста не зависит.
    const deal8: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 8 },
      playerTricks: 10,
      vistersTricks: { B: 0, C: 0 },
      vistDecisions: { B: 'vist', C: 'vist' },
    }
    expect(calcDeal(deal8, PLAYERS, FSPR_RULES).mount.B).toBe(6)
    expect(calcDeal(deal8, PLAYERS, FSPR_RULES).mount.C).toBe(6)
    // и дома ровно столько же — это общее питерское правило, не турнирное
    expect(calcDeal(deal8, PLAYERS, HOME_RULES).mount.B).toBe(6)
  })

  it('на десятерной так же — в турнире она вистуется, дома проверяется', () => {
    const deal10: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 10 },
      playerTricks: 10,
      vistersTricks: { B: 0, C: 0 },
      vistDecisions: { B: 'vist', C: 'vist' },
    }
    expect(calcDeal(deal10, PLAYERS, FSPR_RULES).mount.B).toBe(10) // половина от 20
    expect(calcDeal(deal10, PLAYERS, HOME_RULES).mount.B).toBe(0) // нормы нет
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

describe('ФСПР: висты за прикуп', () => {
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

describe('Мини-партия вчетвером по турнирным правилам', () => {
  it('считается от первой сдачи до итога и сходится в ноль', () => {
    // Пуля без предела: играют по времени
    let g: GameState = { ...fspr4(), poolLimit: null }
    expect(g.firstHand).toBe('A')

    // Сдача 1. Сдаёт D (он перед первой рукой), играет A семерную и берёт ровно 7.
    // Вистуют B и C, берут 2 и 1. В прикупе был туз с королём одной масти.
    g = applyDeal(g, {
      type: 'game',
      dealer: 'D',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 7,
      vistersTricks: { B: 2, C: 1 },
      vistDecisions: { B: 'vist', C: 'vist' },
      prikupFastTricks: 2,
    })
    expect(g.pool.A).toBe(4) // сыгранная семерная
    expect(g.whists.B.A).toBe(16) // 2 взятки x 8
    expect(g.whists.C.A).toBe(8) // 1 взятка x 8
    expect(g.whists.D.A).toBe(16) // премия сдатчику за прикуп: 2 x 8
    expect(g.firstHand).toBe('B') // сдача пошла по часовой

    // Сдача 2. Сдаёт A, играет B восьмерную и садится без двух.
    // Вистуют C и D, берут по 2.
    g = applyDeal(g, {
      type: 'game',
      dealer: 'A',
      firstHand: 'B',
      player: 'B',
      contract: { kind: 'game', level: 8 },
      playerTricks: 6,
      vistersTricks: { C: 2, D: 2 },
      vistDecisions: { C: 'vist', D: 'vist' },
    })
    expect(g.mount.B).toBe(24) // без двух x 12
    expect(g.whists.C.B).toBe(24 + 24) // взятки 2x12 плюс консоляция 2x12
    expect(g.whists.A.B).toBe(24) // сдатчику только консоляция за подсад

    // Сдача 3. Все спасовали - распас. Сдаёт B, он же ходит прикупом.
    g = applyDeal(g, {
      type: 'raspas',
      dealer: 'B',
      firstHand: 'C',
      level: 1,
      tricks: { A: 4, B: 2, C: 4, D: 0 },
    })
    expect(g.mount.A).toBe(8) // 4 взятки x 2, без амнистии
    expect(g.mount.C).toBe(8)
    expect(g.mount.B).toBe(24 + 4) // сдатчик пишет свои 2 взятки прикупа наравне со всеми
    expect(g.mount.D).toBe(-4) // ноль взяток: минус цена двух

    // После распаса минимум встаёт на 7 и дальше не растёт
    expect(g.raspasState).toBe('afterFirst')
    expect(minBidFor(g.raspasState, FSPR_RULES)).toBe(7)

    // Итог сходится: сумма балансов всех четверых равна нулю
    const net = settle(g).net
    expect(net.A + net.B + net.C + net.D).toBe(0)
  })
})

describe('Разбор сдачи: откуда взялась каждая цифра', () => {
  const names = { A: 'Олег', B: 'Андрей', C: 'Дмитрий', D: '' } as Record<PlayerId, string>

  it('объясняет джентльменский дележ и премию за прикуп втроём', () => {
    // Живая сдача из турнирной партии 03.09.2026: Олег сыграл семерную,
    // Андрей вистовал и взял 3, Дмитрий пасовал, в прикупе туз с королём.
    const deal: Deal = {
      type: 'game',
      dealer: 'B',
      firstHand: 'C',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 7,
      vistDecisions: { B: 'vist', C: 'pass' },
      vistersTricks: { B: 3, C: 0 },
      prikupFastTricks: 2,
    }
    const lines = dealBreakdown(deal, PLAYERS, FSPR_RULES, names).join(' | ')
    expect(lines).toContain('пуля +4')
    expect(lines).toContain('3 × 8 = 24')
    expect(lines).toContain('по 12 каждому')
    expect(lines).toContain('Висты за прикуп (за 2 взятки): 2 × 8 = 16')
    expect(lines).toContain('Андрей 8, Дмитрий 8')
  })

  it('объясняет подсад: гору играющего и консоляцию', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'B',
      firstHand: 'C',
      player: 'A',
      contract: { kind: 'game', level: 6 },
      playerTricks: 5,
      vistDecisions: { B: 'vist', C: 'pass' },
      vistersTricks: { B: 5, C: 0 },
    }
    const lines = dealBreakdown(deal, PLAYERS, FSPR_RULES, names).join(' | ')
    expect(lines).toContain('сел без 1')
    expect(lines).toContain('гора +4')
    expect(lines).toContain('по 10 каждому')
    expect(lines).toContain('Консоляция за подсад: 1 × 4 = 4 каждому')
  })

  it('вчетвером премию пишет сдатчик целиком', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'D',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 7,
      vistDecisions: { B: 'vist', C: 'vist' },
      vistersTricks: { B: 2, C: 1 },
      prikupFastTricks: 2,
    }
    const lines = dealBreakdown(deal, SEATS4, FSPR_RULES, {
      ...names,
      D: 'Гость',
    }).join(' | ')
    expect(lines).toContain('пишет сдатчик, Гость')
  })
})

describe('Полвиста — фиксированная плата, человек выбывает из розыгрыша', () => {

  it('на шестерной засчитывается 2 взятки, на семерной 1 — половина нормы пары', () => {
    expect(FSPR_RULES.vistersDuty[6] / 2).toBe(2)
    expect(FSPR_RULES.vistersDuty[7] / 2).toBe(1)
    expect(HOME_RULES.vistersDuty[6] / 2).toBe(2)
    expect(HOME_RULES.vistersDuty[7] / 2).toBe(1)
    // Только на 6 и 7 — кодекс 6.6
    expect(FSPR_RULES.halfVistLevels).toEqual([6, 7])
    expect(HOME_RULES.halfVistLevels).toEqual([6, 7])
  })

  it('полвиста + вист: полвистовой получает фикс, взятки только у вистовавшего', () => {
    // Раньше полвистовой считался обычным вистующим со своими взятками, и форма
    // зря спрашивала их число. Теперь он вне розыгрыша.
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 6 },
      playerTricks: 6,
      vistDecisions: { B: 'half', C: 'vist' },
      vistersTricks: { C: 4 }, // все 4 взятки у вистовавшего, у полвистового их нет
    }
    const g = calcDeal(deal, PLAYERS, HOME_RULES)
    // Полвистовой: 2 взятки × 4 = 8, фикс
    expect(g.whists.find((w) => w.from === 'B')?.amount).toBe(8)
    // Вистовавший: свои 4 взятки × 4 = 16
    expect(g.whists.find((w) => w.from === 'C')?.amount).toBe(16)
    // И штрафа за недобор нормы нет: пара взяла 4 при норме 4
    expect(g.mount.C).toBe(0)
  })

  it('полвиста + пас: играть некому, игра автоматом', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 7 },
      playerTricks: 7,
      vistDecisions: { B: 'half', C: 'pass' },
      vistersTricks: {},
    }
    const g = calcDeal(deal, PLAYERS, HOME_RULES)
    expect(g.pool.A).toBe(4) // пуля за семерную
    expect(g.whists.find((w) => w.from === 'B')?.amount).toBe(8) // 1 взятка × 8
    expect(g.whists.find((w) => w.from === 'C')).toBeUndefined()
  })

  it('на восьмерной полвиста не бывает — решение считается обычным вистом', () => {
    const deal: Deal = {
      type: 'game',
      dealer: 'C',
      firstHand: 'A',
      player: 'A',
      contract: { kind: 'game', level: 8 },
      playerTricks: 8,
      vistDecisions: { B: 'half', C: 'vist' },
      vistersTricks: { B: 1, C: 1 },
    }
    const g = calcDeal(deal, PLAYERS, HOME_RULES)
    // Оба пишут свои взятки по 12 — фикса нет
    expect(g.whists.find((w) => w.from === 'B')?.amount).toBe(12)
    expect(g.whists.find((w) => w.from === 'C')?.amount).toBe(12)
  })
})
