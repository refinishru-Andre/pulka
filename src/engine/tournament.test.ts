// СКВОЗНАЯ ПРОВЕРКА ТУРНИРНОГО ПУТИ
//
// Зачем отдельный файл: сверка reference.test.ts гоняет тысячу партий, но
// ТОЛЬКО домашние правила и только втроём — она сравнивает новый движок со
// старым снимком, а турнирного набора в старом снимке нет вовсе. Поэтому она
// не поймала ни одной турнирной ошибки, и 09.09.2026, накануне турнира,
// выяснилось, что экран требует заказ от 8 вместо 7.
//
// Здесь проверяется то, что видит и получает ЧЕЛОВЕК за турнирным столом:
// минимальный заказ, цена взятки, список доступных заказов, участие сдающего
// в распасе, поблажка за ноль взяток и сходимость итога.

import { describe, it, expect } from 'vitest'
import { applyDeal, emptyStateFrom } from './index'
import { minBidFor, raspasCostFor, raspasLevelFor, raspasStateLabel } from './raspas'
import { settle } from './settle'
import { FSPR_RULES, HOME_RULES } from './conventions'
import type { Deal, GameState, PlayerId, RaspasState } from './types'
import { zeroScores, zeroWhists } from './types'

const SEATS4: PlayerId[] = ['A', 'B', 'C', 'D']
const GAME_LEVELS = [6, 7, 8, 9, 10] as const

function tournament(): GameState {
  return {
    players: { A: 'Андрей', B: 'Олег', C: 'Дмитрий', D: 'ФСПРовец' },
    seats: SEATS4,
    rules: FSPR_RULES,
    poolLimit: null,
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

// Что форма сдачи предлагает заказать: уровни не ниже минимума
const offeredLevels = (st: GameState) =>
  GAME_LEVELS.filter((l) => l >= minBidFor(st.raspasState, FSPR_RULES))

const raspasOf = (st: GameState, tricks: Record<string, number>): Deal => ({
  type: 'raspas',
  dealer: 'D',
  firstHand: st.firstHand,
  level: raspasLevelFor(st.raspasState),
  tricks: tricks as Partial<Record<PlayerId, number>>,
})

describe('Турнир: лесенка распасов как в конвенциях ФСПР', () => {
  it('заказ 6 - 7 - 7 - 7, семерная доступна на любом распасе', () => {
    let st = tournament()
    expect(minBidFor(st.raspasState, FSPR_RULES)).toBe(6)
    expect(offeredLevels(st)).toEqual([6, 7, 8, 9, 10])

    st = applyDeal(st, raspasOf(st, { A: 4, B: 3, C: 2, D: 1 }))
    expect(minBidFor(st.raspasState, FSPR_RULES)).toBe(7)
    expect(offeredLevels(st)).toContain(7)

    st = applyDeal(st, raspasOf(st, { A: 4, B: 3, C: 2, D: 1 }))
    expect(minBidFor(st.raspasState, FSPR_RULES)).toBe(7)
    expect(offeredLevels(st)).toContain(7)
    expect(offeredLevels(st)).not.toContain(6)

    // Четвёртый и пятый распасы подряд — заказ всё ещё от семи
    st = applyDeal(st, raspasOf(st, { A: 4, B: 3, C: 2, D: 1 }))
    st = applyDeal(st, raspasOf(st, { A: 4, B: 3, C: 2, D: 1 }))
    expect(minBidFor(st.raspasState, FSPR_RULES)).toBe(7)
    expect(raspasStateLabel(st.raspasState, FSPR_RULES)).toContain('заказ от 7')
    expect(raspasStateLabel(st.raspasState, FSPR_RULES)).not.toContain('Восьмерные')
  })

  it('цена взятки нарастает 2 - 4 - 6 и дальше стоит на 6', () => {
    const prices: number[] = []
    let st = tournament()
    for (let i = 0; i < 5; i++) {
      prices.push(raspasCostFor(st.raspasState, FSPR_RULES))
      st = applyDeal(st, raspasOf(st, { A: 4, B: 3, C: 2, D: 1 }))
    }
    expect(prices).toEqual([2, 4, 6, 6, 6])
  })

  it('домашняя лесенка другая - 6-7-8, наборы не должны смешиваться', () => {
    const states: RaspasState[] = ['normal', 'afterFirst', 'eightRaspas']
    expect(states.map((s) => minBidFor(s, HOME_RULES))).toEqual([6, 7, 8])
    expect(states.map((s) => minBidFor(s, FSPR_RULES))).toEqual([6, 7, 7])
  })
})

describe('Турнир: сдающий на распасе', () => {
  it('пишут в гору все четверо, включая сдающего', () => {
    const st = applyDeal(tournament(), raspasOf(tournament(), { A: 3, B: 3, C: 2, D: 2 }))
    expect([st.mount.A, st.mount.B, st.mount.C, st.mount.D]).toEqual([6, 6, 4, 4])
  })

  it('за ноль взяток сдающему поблажки нет, остальным есть', () => {
    const zeroDealer = applyDeal(tournament(), raspasOf(tournament(), { A: 4, B: 3, C: 3, D: 0 }))
    expect(zeroDealer.mount.D).toBe(0) // «кроме СДАЮЩЕГО»

    const zeroPlayer = applyDeal(tournament(), raspasOf(tournament(), { A: 0, B: 4, C: 3, D: 3 }))
    expect(zeroPlayer.mount.A).toBe(-4) // списываем цену двух взяток
  })
})

describe('Турнир: итог сходится после каждой сдачи', () => {
  function rnd(seed: number) {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }

  it('300 случайных турнирных партий вчетвером, 20 сдач в каждой', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rnd(seed)
      let st = emptyStateFrom(tournament(), 'A')

      for (let n = 0; n < 20; n++) {
        const dealer = SEATS4[(SEATS4.indexOf(st.firstHand) + 3) % 4]
        const kind = r()
        let deal: Deal

        if (kind < 0.55) {
          const canPlay = SEATS4.filter((p) => p !== dealer)
          const player = canPlay[Math.floor(r() * canPlay.length)]
          const level = GAME_LEVELS[Math.floor(r() * GAME_LEVELS.length)]
          const playerTricks = Math.floor(r() * 11)
          const vs = SEATS4.filter((p) => p !== player && p !== dealer)
          const left = 10 - playerTricks
          const first = Math.floor(r() * (left + 1))
          deal = {
            type: 'game',
            dealer,
            firstHand: st.firstHand,
            player,
            contract: { kind: 'game', level },
            playerTricks,
            vistersTricks: { [vs[0]]: first, [vs[1]]: left - first },
            vistDecisions: {
              [vs[0]]: r() < 0.5 ? 'vist' : 'pass',
              [vs[1]]: r() < 0.5 ? 'vist' : 'pass',
            },
            prikupFastTricks: Math.floor(r() * 4),
          }
        } else if (kind < 0.75) {
          const canPlay = SEATS4.filter((p) => p !== dealer)
          deal = {
            type: 'misere',
            dealer,
            firstHand: st.firstHand,
            player: canPlay[Math.floor(r() * canPlay.length)],
            blind: false,
            playerTricks: Math.floor(r() * 11),
          }
        } else {
          // Сдающий берёт не больше двух: у него на руках две карты прикупа
          const d = Math.floor(r() * 3)
          const rest = SEATS4.filter((p) => p !== dealer)
          const a = Math.floor(r() * (10 - d + 1))
          const b = Math.floor(r() * (10 - d - a + 1))
          deal = {
            type: 'raspas',
            dealer,
            firstHand: st.firstHand,
            level: raspasLevelFor(st.raspasState),
            tricks: { [dealer]: d, [rest[0]]: a, [rest[1]]: b, [rest[2]]: 10 - d - a - b },
          }
        }

        st = applyDeal(st, deal)

        // Главный инвариант: сколько один выиграл, столько остальные проиграли.
        // Допуск — только на округление при показе, не больше числа мест.
        const { net, pairwise } = settle(st)
        const sum = SEATS4.reduce((s, p) => s + net[p], 0)
        expect(Math.abs(sum)).toBeLessThanOrEqual(SEATS4.length)

        // Долги «кто кому» сходятся с балансами
        SEATS4.forEach((p) => {
          const out = pairwise.filter((d) => d.from === p).reduce((s, d) => s + d.amount, 0)
          const inc = pairwise.filter((d) => d.to === p).reduce((s, d) => s + d.amount, 0)
          expect(Math.abs(inc - out - net[p])).toBeLessThanOrEqual(SEATS4.length)
        })

        // Заказ на турнире никогда не поднимается до восьми
        expect(minBidFor(st.raspasState, FSPR_RULES)).toBeLessThanOrEqual(7)
      }
    }
  })
})
