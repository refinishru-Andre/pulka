// СВЕРКА СО СТАРОЙ ЛЮДОЧКОЙ
//
// Простыми словами: берём Людочку, какой она работает у Андрея сейчас (папка
// __reference__ — снимок с ветки main), и Людочку новую. Прогоняем через обе
// тысячи случайных партий на троих и сверяем ВСЁ: пулю, гору, висты каждого на
// каждого, чей ход, состояние распасов.
//
// Если хоть одна цифра разойдётся — тест красный и дальше идти нельзя, потому
// что это значит, что новая версия посчитает домашние партии иначе, чем старая.
//
// Партии генерируются не случайно «как повезёт», а от фиксированного зерна:
// каждый прогон даёт ровно те же партии. Сломалось — воспроизведётся.

import { describe, it, expect } from 'vitest'

import { applyDeal as applyNew } from './index'
import type { Deal as DealNew, GameState as StateNew } from './types'

import { applyDeal as applyOld } from './__reference__/index'
import type { Deal as DealOld, GameState as StateOld } from './__reference__/types'

type Seat = 'A' | 'B' | 'C'
const SEATS: Seat[] = ['A', 'B', 'C']

// Свой генератор случайных чисел с зерном — чтобы прогон повторялся в точности.
function makeRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// Разложить `total` взяток между игроками случайным образом
function splitTricks(rnd: () => number, players: Seat[], total: number): Record<Seat, number> {
  const out = { A: 0, B: 0, C: 0 } as Record<Seat, number>
  let left = total
  players.forEach((p, i) => {
    const take = i === players.length - 1 ? left : Math.floor(rnd() * (left + 1))
    out[p] = take
    left -= take
  })
  return out
}

// Одна случайная сдача. dealer/firstHand берутся из текущего состояния партии.
function randomDeal(rnd: () => number, firstHand: Seat): DealNew & DealOld {
  const dealerIdx = (SEATS.indexOf(firstHand) + SEATS.length - 1) % SEATS.length
  const dealer = SEATS[dealerIdx]
  const kind = rnd()
  const player = SEATS[Math.floor(rnd() * 3)]
  const levels = [6, 7, 8, 9, 10] as const

  if (kind < 0.55) {
    // Обычная игра
    const level = levels[Math.floor(rnd() * levels.length)]
    const playerTricks = Math.floor(rnd() * 11)
    const visters = SEATS.filter((p) => p !== player)
    const vistersTricks = splitTricks(rnd, visters, 10 - playerTricks)
    const decisions = ['vist', 'pass', 'half'] as const
    const vistDecisions = { A: 'vist', B: 'vist', C: 'vist' } as Record<Seat, 'vist' | 'pass' | 'half'>
    visters.forEach((v) => {
      vistDecisions[v] = decisions[Math.floor(rnd() * decisions.length)]
    })
    // Сталинград (метка 6♠) — только у старых сдач, но проверить его надо:
    // именно эту ветку мы обещали сохранить ради уже сыгранных партий.
    const suit = level === 6 && rnd() < 0.3 ? ('S' as const) : undefined
    return {
      type: 'game',
      dealer,
      firstHand,
      player,
      contract: suit ? { kind: 'game', level, suit } : { kind: 'game', level },
      playerTricks,
      vistersTricks,
      vistDecisions,
    } as DealNew & DealOld
  }
  if (kind < 0.75) {
    return {
      type: 'misere',
      dealer,
      firstHand,
      player,
      blind: rnd() < 0.2,
      playerTricks: Math.floor(rnd() * 11),
    } as DealNew & DealOld
  }
  if (kind < 0.92) {
    const level = (Math.floor(rnd() * 3) + 1) as 1 | 2 | 3
    return {
      type: 'raspas',
      dealer,
      firstHand,
      level,
      tricks: splitTricks(rnd, SEATS, 10),
    } as DealNew & DealOld
  }
  return {
    type: 'giveup',
    dealer,
    firstHand,
    player,
    contract: { kind: 'game', level: levels[Math.floor(rnd() * levels.length)] },
  } as DealNew & DealOld
}

function startNew(poolLimit: number): StateNew {
  return {
    players: { A: 'А', B: 'Б', C: 'В', D: '' },
    seats: SEATS,
    poolLimit,
    createdAt: 0,
    pool: { A: 0, B: 0, C: 0, D: 0 },
    mount: { A: 0, B: 0, C: 0, D: 0 },
    whists: {
      A: { A: 0, B: 0, C: 0, D: 0 },
      B: { A: 0, B: 0, C: 0, D: 0 },
      C: { A: 0, B: 0, C: 0, D: 0 },
      D: { A: 0, B: 0, C: 0, D: 0 },
    },
    firstHand: 'A',
    raspasState: 'normal',
    eightRaspasCounter: { A: 0, B: 0, C: 0, D: 0 },
    deals: [],
  }
}

function startOld(poolLimit: number): StateOld {
  return {
    players: { A: 'А', B: 'Б', C: 'В' },
    poolLimit,
    createdAt: 0,
    pool: { A: 0, B: 0, C: 0 },
    mount: { A: 0, B: 0, C: 0 },
    whists: { A: { A: 0, B: 0, C: 0 }, B: { A: 0, B: 0, C: 0 }, C: { A: 0, B: 0, C: 0 } },
    firstHand: 'A',
    raspasState: 'normal',
    eightRaspasCounter: { A: 0, B: 0, C: 0 },
    deals: [],
  }
}

// Одна партия: гоняем одни и те же сдачи через оба движка и сверяем после каждой
function comparePartiya(seed: number, dealsCount: number, poolLimit: number): string | null {
  const rnd = makeRandom(seed)
  let sNew = startNew(poolLimit)
  let sOld = startOld(poolLimit)

  for (let i = 0; i < dealsCount; i++) {
    // Первая рука в обоих движках обязана совпадать — если разошлась,
    // дальше сравнивать бессмысленно, сдачи пойдут разные
    if (sNew.firstHand !== sOld.firstHand) {
      return `сдача ${i}: первая рука разошлась — новая ${sNew.firstHand}, старая ${sOld.firstHand}`
    }
    const deal = randomDeal(rnd, sNew.firstHand as Seat)
    sNew = applyNew(sNew, deal as DealNew)
    sOld = applyOld(sOld, deal as DealOld)

    for (const p of SEATS) {
      if (sNew.pool[p] !== sOld.pool[p]) {
        return `сдача ${i}: пуля ${p} — новая ${sNew.pool[p]}, старая ${sOld.pool[p]}`
      }
      if (sNew.mount[p] !== sOld.mount[p]) {
        return `сдача ${i}: гора ${p} — новая ${sNew.mount[p]}, старая ${sOld.mount[p]}`
      }
      for (const q of SEATS) {
        if (sNew.whists[p][q] !== sOld.whists[p][q]) {
          return `сдача ${i}: висты ${p}→${q} — новая ${sNew.whists[p][q]}, старая ${sOld.whists[p][q]}`
        }
      }
      if (sNew.eightRaspasCounter[p] !== sOld.eightRaspasCounter[p]) {
        return `сдача ${i}: счётчик 8-мерных ${p} — новая ${sNew.eightRaspasCounter[p]}, старая ${sOld.eightRaspasCounter[p]}`
      }
    }
    if (sNew.raspasState !== sOld.raspasState) {
      return `сдача ${i}: состояние распасов — новая ${sNew.raspasState}, старая ${sOld.raspasState}`
    }
    if (sNew.firstHand !== sOld.firstHand) {
      return `сдача ${i}: первая рука после сдачи — новая ${sNew.firstHand}, старая ${sOld.firstHand}`
    }
  }
  return null
}

describe('Новая Людочка считает партии на троих так же, как старая', () => {
  it('1000 партий по 25 сдач, пуля 21 — расхождений нет', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const diff = comparePartiya(seed, 25, 21)
      expect(diff, `партия с зерном ${seed}`).toBeNull()
    }
  })

  it('300 длинных партий по 60 сдач — перекрытие пули тоже сходится', () => {
    for (let seed = 5000; seed < 5300; seed++) {
      const diff = comparePartiya(seed, 60, 21)
      expect(diff, `партия с зерном ${seed}`).toBeNull()
    }
  })

  it('300 партий с короткой пулей 10 — перекрытие срабатывает часто', () => {
    for (let seed = 9000; seed < 9300; seed++) {
      const diff = comparePartiya(seed, 40, 10)
      expect(diff, `партия с зерном ${seed}`).toBeNull()
    }
  })
})
