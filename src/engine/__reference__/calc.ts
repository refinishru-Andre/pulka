// Движок расчёта одной сдачи → изменения в пуле/горе/вистах
// См. SPEC.md разделы 3-6

import type { Deal, DealDelta, PlayerId, GameLevel } from './types'
import { PLAYERS } from './types'
import {
  POOL_COST,
  MISERE_POOL_COST,
  MOUNT_PENALTY,
  MISERE_TRICK_PENALTY,
  VIST_PER_TRICK,
  VISTERS_DUTY,
  VISTER_PENALTY_PER_MISS,
  RASPAS_TRICK_COST,
} from './rules'

function emptyDelta(): DealDelta {
  return {
    pool: { A: 0, B: 0, C: 0 },
    mount: { A: 0, B: 0, C: 0 },
    whists: [],
  }
}

// Список вистующих (двое, кроме играющего)
function visters(player: PlayerId): PlayerId[] {
  return PLAYERS.filter((p) => p !== player)
}

// Расчёт «Игра» (сыграна или ремиз)
function calcGame(deal: Extract<Deal, { type: 'game' }>): DealDelta {
  const delta = emptyDelta()
  if (deal.contract.kind !== 'game') return delta // защита от неправильного заказа
  const level = deal.contract.level
  const suit = deal.contract.suit
  const player = deal.player
  const vs = visters(player)

  const playerTricks = deal.playerTricks

  // Сталинград: на 6♠ оба вистующих ОБЯЗАНЫ вистовать — принудительно ставим 'vist'
  const isStalingrad = level === 6 && suit === 'S'
  const effectiveDecisions = isStalingrad
    ? { ...deal.vistDecisions, ...Object.fromEntries(vs.map((v) => [v, 'vist' as const])) }
    : deal.vistDecisions

  // СПЕЦ-СЛУЧАЙ 1: оба вистующих пасовали → игра автомат, без розыгрыша (на любом уровне)
  const allPassed = vs.every((v) => effectiveDecisions[v] === 'pass')
  if (allPassed) {
    delta.pool[player] += POOL_COST[level]
    return delta
  }

  // ТРЕТЬЕ согласованное отступление от снимка (04.09.2026): полвиста — это
  // ФИКСИРОВАННАЯ плата, и человек выбывает из розыгрыша, а не считается обычным
  // вистующим со своими взятками. Раньше фикс работал только в паре с пасом
  // второго; если второй вистовал, полвистовому считали его записанные взятки —
  // и форма зря спрашивала их число. Правило исправлено по замечанию Андрея.
  const halfPlayers = vs.filter(
    (v) => effectiveDecisions[v] === 'half' && (level === 6 || level === 7),
  )
  halfPlayers.forEach((h) => {
    const halfTricks = level === 6 ? 2 : 1
    delta.whists.push({ from: h, to: player, amount: halfTricks * VIST_PER_TRICK[level] })
  })
  const rest = vs.filter((v) => !halfPlayers.includes(v))
  const activeVisters = rest.filter((v) => effectiveDecisions[v] !== 'pass')
  const vTricksTotal = rest.reduce((sum, v) => sum + deal.vistersTricks[v], 0)
  if (activeVisters.length === 0) {
    delta.pool[player] += POOL_COST[level]
    return delta
  }

  // Играющий сыграл?
  const success = playerTricks >= level

  // Висты за взятки и штраф за недобор — зависит от числа активных вистующих
  const duty = VISTERS_DUTY[level]
  if (activeVisters.length === 1) {
    // Только один вистует — он играет за всю пару, ему все взятки пары и весь штраф
    const solo = activeVisters[0]
    if (vTricksTotal > 0) {
      delta.whists.push({ from: solo, to: player, amount: vTricksTotal * VIST_PER_TRICK[level] })
    }
    if (vTricksTotal < duty) {
      const shortfall = duty - vTricksTotal
      delta.mount[solo] += shortfall * VISTER_PENALTY_PER_MISS[level]
    }
  } else if (activeVisters.length === 2) {
    // Оба вистуют — каждый за свои личные взятки
    activeVisters.forEach((v) => {
      const myTricks = deal.vistersTricks[v]
      if (myTricks > 0) {
        delta.whists.push({ from: v, to: player, amount: myTricks * VIST_PER_TRICK[level] })
      }
    })
    // Штраф за недобор — «пол взятки не считается».
    // Норма пары ≥ 2 (6-я, 7-я): делится нацело, каждый должен взять duty/2. Штраф тому, кто взял меньше своей нормы.
    // Норма пары = 1 (8-я, 9-я): пара должна взять 1. Если пара не взяла — штраф каждому, кто лично взял 0, на 1 недобранную взятку.
    if (vTricksTotal < duty) {
      if (duty >= 2) {
        const dutyPerPlayer = duty / 2
        activeVisters.forEach((v) => {
          const myTricks = deal.vistersTricks[v]
          if (myTricks < dutyPerPlayer) {
            const myShort = dutyPerPlayer - myTricks
            delta.mount[v] += myShort * VISTER_PENALTY_PER_MISS[level]
          }
        })
      } else {
        // duty = 1 — каждый вистующий, взявший 0, платит за 1 недобранную полностью
        activeVisters.forEach((v) => {
          if (deal.vistersTricks[v] === 0) {
            delta.mount[v] += VISTER_PENALTY_PER_MISS[level]
          }
        })
      }
    }
  }

  if (success) {
    // Плюс в пулю играющему
    delta.pool[player] += POOL_COST[level]
  } else {
    // Ремиз играющего — недобор × штраф в гору
    const shortfall = level - playerTricks
    delta.mount[player] += shortfall * MOUNT_PENALTY[level]

    // Консоляция — ОБОИМ (вистующему и пасовавшему), по (недобор × стоимость виста игры)
    const consolation = shortfall * VIST_PER_TRICK[level]
    if (consolation > 0) {
      rest.forEach((v) => {
        delta.whists.push({ from: v, to: player, amount: consolation })
      })
    }
  }

  return delta
}

// Расчёт «Мизер»
function calcMisere(deal: Extract<Deal, { type: 'misere' }>): DealDelta {
  const delta = emptyDelta()
  if (deal.playerTricks === 0) {
    // Сыграл
    delta.pool[deal.player] += MISERE_POOL_COST
  } else {
    // Поймали
    delta.mount[deal.player] += deal.playerTricks * MISERE_TRICK_PENALTY
  }
  return delta
}

// Расчёт «Распасы» (амнистия минимума + бонус за 0 взяток).
// Правило Андрея: игрок, взявший 0 взяток на распасе, списывает с горы
// удвоенную цену распаса (для 1-го = −4, 2-го = −8, 8-мерного = −12).
// Списание не может увести гору ниже нуля (обрежется в applyDeal через state).
function calcRaspas(deal: Extract<Deal, { type: 'raspas' }>): DealDelta {
  const delta = emptyDelta()
  const cost = RASPAS_TRICK_COST[deal.level]
  const tricks = deal.tricks
  const min = Math.min(tricks.A, tricks.B, tricks.C)
  PLAYERS.forEach((p) => {
    const extra = tricks[p] - min
    if (extra > 0) delta.mount[p] += extra * cost
    // Бонус за «чистый» распас (0 взяток): -2*cost с горы
    if (tricks[p] === 0) {
      delta.mount[p] -= 2 * cost
    }
  })
  return delta
}

// Расчёт «Уход без 3»
function calcGiveup(deal: Extract<Deal, { type: 'giveup' }>): DealDelta {
  const delta = emptyDelta()
  if (deal.contract.kind !== 'game') return delta
  const level = deal.contract.level as GameLevel
  // Гора за 3 недобранные взятки; висты не пишутся
  delta.mount[deal.player] += 3 * MOUNT_PENALTY[level]
  return delta
}

// Основная функция
export function calcDeal(deal: Deal): DealDelta {
  switch (deal.type) {
    case 'game':
      return calcGame(deal)
    case 'misere':
      return calcMisere(deal)
    case 'raspas':
      return calcRaspas(deal)
    case 'giveup':
      return calcGiveup(deal)
  }
}
