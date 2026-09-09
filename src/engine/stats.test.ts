// Статистика виста: взятки засчитываются ТОМУ, КТО ВИСТОВАЛ.
//
// Когда один защитник пасует, второй играет лёжа: пасовавший открывает карты,
// и все ходы делает вистующий. Взятки от пасовавшего не зависят вовсе, поэтому
// делить их по тому, к кому они физически пришли, бессмысленно
// (объяснение Андрея 09.09.2026).

import { describe, it, expect } from 'vitest'
import { computeStats } from './stats'
import { FSPR_RULES } from './conventions'
import type { Deal, GameState, PlayerId } from './types'
import { zeroScores, zeroWhists, PLAYERS } from './types'

const SEATS4: PlayerId[] = ['A', 'B', 'C', 'D']

function game(deals: Deal[], seats = PLAYERS): GameState {
  return {
    players: { A: 'Андрей', B: 'Олег', C: 'Дмитрий', D: 'ФСПРовец' },
    seats,
    rules: FSPR_RULES,
    poolLimit: null,
    finishedManually: true, // статистика считает только завершённые
    createdAt: 0,
    pool: zeroScores(),
    mount: zeroScores(),
    whists: zeroWhists(),
    firstHand: 'A',
    raspasState: 'normal',
    eightRaspasCounter: zeroScores(),
    deals,
  }
}

const six = (over: Partial<Extract<Deal, { type: 'game' }>>): Deal => ({
  type: 'game',
  dealer: 'A',
  firstHand: 'B',
  player: 'B',
  contract: { kind: 'game', level: 6 },
  playerTricks: 5,
  vistersTricks: {},
  vistDecisions: {},
  ...over,
})

describe('Статистика виста', () => {
  it('вистовал один — ему идут ВСЕ взятки пары и вся её норма', () => {
    // Дмитрий вистовал и взял 2, ФСПРовец пасовал и взял 3 (лежал).
    // Все 5 взяток — Дмитрию, норма пары 4 тоже его.
    const st = computeStats([
      game([six({ vistersTricks: { C: 2, D: 3 }, vistDecisions: { C: 'vist', D: 'pass' } })], SEATS4),
    ])
    expect(st.players['Дмитрий'].vist.tricks).toBe(5)
    expect(st.players['Дмитрий'].vist.duty).toBe(4)
    expect(st.players['Дмитрий'].vist.failures).toBe(0)
    // Пасовавшему не пишется ничего: он только лежал
    expect(st.players['ФСПРовец'].vist.tricks).toBe(0)
    expect(st.players['ФСПРовец'].vist.duty).toBe(0)
    expect(st.players['ФСПРовец'].vist.passed).toBe(1)
  })

  it('вистовали оба — каждому свои взятки и половина нормы', () => {
    const st = computeStats([
      game([six({ vistersTricks: { C: 3, D: 2 }, vistDecisions: { C: 'vist', D: 'vist' } })], SEATS4),
    ])
    expect(st.players['Дмитрий'].vist.tricks).toBe(3)
    expect(st.players['Дмитрий'].vist.duty).toBe(2)
    expect(st.players['ФСПРовец'].vist.tricks).toBe(2)
    expect(st.players['ФСПРовец'].vist.duty).toBe(2)
  })

  it('недобор пары считается подсадом тому, кто ниже своей нормы', () => {
    // Пара взяла 1 при норме 4: Дмитрий 1, ФСПРовец 0 — оба ниже своих двух
    const st = computeStats([
      game([six({ playerTricks: 9, vistersTricks: { C: 1, D: 0 }, vistDecisions: { C: 'vist', D: 'vist' } })], SEATS4),
    ])
    expect(st.players['Дмитрий'].vist.failures).toBe(1)
    expect(st.players['ФСПРовец'].vist.failures).toBe(1)
  })

  it('ушедший за полвиста в счёт взяток не попадает', () => {
    const st = computeStats([
      game([six({ playerTricks: 6, vistersTricks: {}, vistDecisions: { C: 'half', D: 'pass' } })], SEATS4),
    ])
    expect(st.players['Дмитрий'].vist.half).toBe(1)
    expect(st.players['Дмитрий'].vist.duty).toBe(0)
    expect(st.players['Дмитрий'].vist.tricks).toBe(0)
  })
})

describe('Статистика сдающего', () => {
  it('считает сдачи и отданные в прикуп быстрые взятки', () => {
    const st = computeStats([
      game(
        [
          six({ dealer: 'A', prikupFastTricks: 2, vistersTricks: { C: 5 }, vistDecisions: { C: 'vist', D: 'pass' } }),
          six({ dealer: 'D', prikupFastTricks: 1, vistersTricks: { C: 5 }, vistDecisions: { C: 'vist', A: 'pass' } }),
        ],
        SEATS4,
      ),
    ])
    expect(st.players['Андрей'].dealer.deals).toBe(1)
    expect(st.players['Андрей'].dealer.fastGiven).toBe(2)
    expect(st.players['ФСПРовец'].dealer.deals).toBe(1)
    expect(st.players['ФСПРовец'].dealer.fastGiven).toBe(1)
    expect(st.players['Дмитрий'].dealer.deals).toBe(0)
  })
})
