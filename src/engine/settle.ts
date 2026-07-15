// Финальный расчёт: висто-баланс каждого + попарные долги «кто кому сколько»
// См. SPEC.md раздел 7

import type { GameState, PlayerId, Settlement } from './types'
import { PLAYERS } from './types'
import { POOL_TO_VISTS, MOUNT_TO_VISTS } from './rules'

// Вычислить net каждого игрока
// Семантика whists[i][j]: «i получает от j эти висты» (в свою пользу).
// В классической пульке: игрок пишет висты в своё поле «→ соперник» — это ЕГО плюс.
export function calcNet(state: GameState): Record<PlayerId, number> {
  const avgPool = PLAYERS.reduce((s, p) => s + state.pool[p], 0) / PLAYERS.length
  const avgMount = PLAYERS.reduce((s, p) => s + state.mount[p], 0) / PLAYERS.length

  const net: Record<PlayerId, number> = { A: 0, B: 0, C: 0 }
  PLAYERS.forEach((p) => {
    const own = (state.pool[p] - avgPool) * POOL_TO_VISTS - (state.mount[p] - avgMount) * MOUNT_TO_VISTS
    // written = сколько p написал на других = сколько p получает (плюс для p)
    const written = PLAYERS.reduce((s, other) => (other === p ? s : s + (state.whists[p]?.[other] ?? 0)), 0)
    // owed = сколько на p написали = сколько p должен (минус для p)
    const owed = PLAYERS.reduce((s, other) => (other === p ? s : s + (state.whists[other]?.[p] ?? 0)), 0)
    net[p] = own + written - owed
  })
  return net
}

// Попарные долги: кто кому сколько должен (жадный алгоритм)
export function calcPairwise(
  net: Record<PlayerId, number>,
): Array<{ from: PlayerId; to: PlayerId; amount: number }> {
  const debts: Array<{ from: PlayerId; to: PlayerId; amount: number }> = []
  // Отделяем должников и получателей
  const positive = PLAYERS.filter((p) => net[p] > 0).map((p) => ({ p, amount: net[p] }))
  const negative = PLAYERS.filter((p) => net[p] < 0).map((p) => ({ p, amount: -net[p] }))
  // Сортируем по убыванию для стабильности
  positive.sort((a, b) => b.amount - a.amount)
  negative.sort((a, b) => b.amount - a.amount)

  let i = 0
  let j = 0
  while (i < negative.length && j < positive.length) {
    const from = negative[i]
    const to = positive[j]
    const amount = Math.min(from.amount, to.amount)
    if (amount > 0.5) {
      debts.push({ from: from.p, to: to.p, amount: Math.round(amount) })
    }
    from.amount -= amount
    to.amount -= amount
    if (from.amount < 0.5) i++
    if (to.amount < 0.5) j++
  }
  return debts
}

export function settle(state: GameState): Settlement {
  const net = calcNet(state)
  const pairwise = calcPairwise(net)
  // Округляем net для отображения
  const netRounded: Record<PlayerId, number> = { A: 0, B: 0, C: 0 }
  PLAYERS.forEach((p) => (netRounded[p] = Math.round(net[p])))
  return { net: netRounded, pairwise }
}
