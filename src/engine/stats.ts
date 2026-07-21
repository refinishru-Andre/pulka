// Расчёт статистики по завершённым партиям
// Все метрики — must-have по результатам research

import type { GameState, Deal, PlayerId } from './types'
import { PLAYERS } from './types'
import { settle } from './settle'

// ============ ТИПЫ ============

export interface OrderStats {
  total: number
  played: number
  remise: number
  successRate: number // played / total
  avgOverbid: number // средний перебор (сколько сверх заказа) — если сыграл
  avgUnderbid: number // средний недобор (сколько не хватило) — если ремиз
}

export interface PlayerStats {
  name: string
  gamesTotal: number
  gamesWon: number // финальный виста-баланс > 0
  gamesLost: number
  gamesEven: number
  winRate: number // % партий в плюсе
  totalVists: number // сумма финальных балансов за все партии
  totalDeals: number // всего сдач в партиях с этим игроком
  vpd: number // vists per deal = totalVists / totalDeals
  ordersByLevel: Record<6 | 7 | 8 | 9 | 10, OrderStats>
  ntOrders: OrderStats // БК-игры
  suitOrders: Record<'S' | 'C' | 'D' | 'H', OrderStats> // по мастям
  miseres: {
    total: number
    played: number
    caught: number // поймали
    successRate: number
  }
  vist: {
    total: number // сколько раз вистовал
    passed: number // сколько раз пасовал
    half: number // сколько раз полвиста
  }
  raspas: {
    total: number
    avgTricks: number // среднее взяток на распасе
    eightMerCount: number // 8-мерных распасов
    zeroTricksCount: number // «чистый» распас (взял 0)
  }
  giveups: number // уходов без 3
  maxWinInGame: number // самый большой выигрыш за пулю
  maxLossInGame: number
  longestGameDeals: number
  currentStreak: number // + N побед подряд или − N поражений
}

export interface HeadToHead {
  a: string
  b: string
  gamesTogether: number
  aBalance: number // net балланс A относительно B (положительный = A выигрывает у B)
}

export interface OverallStats {
  players: Record<string, PlayerStats>
  h2h: HeadToHead[]
  gamesConsidered: number // сколько завершённых партий учтено
  gamesInProgress: number // сколько не завершённых
  totalDeals: number
}

// ============ ХЕЛПЕРЫ ============

function emptyOrderStats(): OrderStats {
  return { total: 0, played: 0, remise: 0, successRate: 0, avgOverbid: 0, avgUnderbid: 0 }
}

function isGameFinished(g: GameState): boolean {
  if (g.finishedManually) return true
  return PLAYERS.every((p) => g.pool[p] >= g.poolLimit)
}

function newPlayerStats(name: string): PlayerStats {
  return {
    name,
    gamesTotal: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesEven: 0,
    winRate: 0,
    totalVists: 0,
    totalDeals: 0,
    vpd: 0,
    ordersByLevel: {
      6: emptyOrderStats(),
      7: emptyOrderStats(),
      8: emptyOrderStats(),
      9: emptyOrderStats(),
      10: emptyOrderStats(),
    },
    ntOrders: emptyOrderStats(),
    suitOrders: {
      S: emptyOrderStats(),
      C: emptyOrderStats(),
      D: emptyOrderStats(),
      H: emptyOrderStats(),
    },
    miseres: { total: 0, played: 0, caught: 0, successRate: 0 },
    vist: { total: 0, passed: 0, half: 0 },
    raspas: { total: 0, avgTricks: 0, eightMerCount: 0, zeroTricksCount: 0 },
    giveups: 0,
    maxWinInGame: 0,
    maxLossInGame: 0,
    longestGameDeals: 0,
    currentStreak: 0,
  }
}

// ============ ГЛАВНЫЙ РАСЧЁТ ============

export function computeStats(games: GameState[]): OverallStats {
  const players: Record<string, PlayerStats> = {}
  const h2hMap = new Map<string, HeadToHead>()

  let gamesConsidered = 0
  let gamesInProgress = 0
  let totalDeals = 0

  // Сортируем партии по времени создания для правильных стриков
  const sortedGames = [...games].sort((a, b) => a.createdAt - b.createdAt)
  // Стрики: для каждого игрока — последняя серия
  const streaks: Record<string, { current: number; type: 'win' | 'loss' | null }> = {}

  for (const game of sortedGames) {
    if (!isGameFinished(game)) {
      gamesInProgress++
      continue
    }
    gamesConsidered++
    totalDeals += game.deals.length

    // Инициализируем игроков этой партии
    const gameNames = PLAYERS.map((p) => game.players[p])
    for (const name of gameNames) {
      if (!players[name]) players[name] = newPlayerStats(name)
      if (!streaks[name]) streaks[name] = { current: 0, type: null }
    }

    const settlement = settle(game)

    // Обновляем общие метрики каждого игрока
    for (const p of PLAYERS) {
      const name = game.players[p]
      const ps = players[name]
      const net = settlement.net[p]

      ps.gamesTotal++
      ps.totalVists += net
      ps.totalDeals += game.deals.length
      if (net > 0) {
        ps.gamesWon++
      } else if (net < 0) {
        ps.gamesLost++
      } else {
        ps.gamesEven++
      }

      // Рекорды
      if (net > ps.maxWinInGame) ps.maxWinInGame = net
      if (net < ps.maxLossInGame) ps.maxLossInGame = net
      if (game.deals.length > ps.longestGameDeals) ps.longestGameDeals = game.deals.length

      // Стрики
      const st = streaks[name]
      const outcome: 'win' | 'loss' | null = net > 0 ? 'win' : net < 0 ? 'loss' : null
      if (outcome === st.type) {
        st.current++
      } else if (outcome !== null) {
        st.type = outcome
        st.current = 1
      } else {
        // ничья — не сбрасываем но и не растим
      }
      ps.currentStreak = st.type === 'win' ? st.current : st.type === 'loss' ? -st.current : 0
    }

    // Разбор каждой сдачи
    for (const deal of game.deals) {
      processDeal(deal, game, players)
    }

    // H2H — попарные разности (a.net − b.net усредняется через попарки Settle)
    for (let i = 0; i < PLAYERS.length; i++) {
      for (let j = i + 1; j < PLAYERS.length; j++) {
        const nameA = game.players[PLAYERS[i]]
        const nameB = game.players[PLAYERS[j]]
        const netA = settlement.net[PLAYERS[i]]
        const netB = settlement.net[PLAYERS[j]]
        // Долг A → B: если netA − netB > 0, A относительно B в плюсе
        const diff = (netA - netB) / 2
        const key = [nameA, nameB].sort().join('||')
        const [k1] = key.split('||')
        const aIsFirst = k1 === nameA
        let record = h2hMap.get(key)
        if (!record) {
          record = { a: aIsFirst ? nameA : nameB, b: aIsFirst ? nameB : nameA, gamesTogether: 0, aBalance: 0 }
          h2hMap.set(key, record)
        }
        record.gamesTogether++
        record.aBalance += aIsFirst ? diff : -diff
      }
    }
  }

  // Финальные проценты
  for (const ps of Object.values(players)) {
    ps.winRate = ps.gamesTotal > 0 ? ps.gamesWon / ps.gamesTotal : 0
    ps.vpd = ps.totalDeals > 0 ? ps.totalVists / ps.totalDeals : 0
    // Проценты по заказам
    for (const level of [6, 7, 8, 9, 10] as const) {
      const o = ps.ordersByLevel[level]
      o.successRate = o.total > 0 ? o.played / o.total : 0
      if (o.played > 0) o.avgOverbid = o.avgOverbid / o.played
      if (o.remise > 0) o.avgUnderbid = o.avgUnderbid / o.remise
    }
    for (const suit of ['S', 'C', 'D', 'H'] as const) {
      const o = ps.suitOrders[suit]
      o.successRate = o.total > 0 ? o.played / o.total : 0
    }
    ps.ntOrders.successRate = ps.ntOrders.total > 0 ? ps.ntOrders.played / ps.ntOrders.total : 0
    ps.miseres.successRate = ps.miseres.total > 0 ? ps.miseres.played / ps.miseres.total : 0
    if (ps.raspas.total > 0) ps.raspas.avgTricks = ps.raspas.avgTricks / ps.raspas.total
  }

  return {
    players,
    h2h: Array.from(h2hMap.values()),
    gamesConsidered,
    gamesInProgress,
    totalDeals,
  }
}

// Обработка одной сдачи → обновляем статистику всех участников
function processDeal(deal: Deal, game: GameState, players: Record<string, PlayerStats>): void {
  if (deal.type === 'game' && deal.contract.kind === 'game') {
    const playerName = game.players[deal.player]
    const ps = players[playerName]
    if (!ps) return
    const level = deal.contract.level
    const suit = deal.contract.suit
    const success = deal.playerTricks >= level

    const orderStats = ps.ordersByLevel[level]
    orderStats.total++
    if (success) {
      orderStats.played++
      orderStats.avgOverbid += deal.playerTricks - level
    } else {
      orderStats.remise++
      orderStats.avgUnderbid += level - deal.playerTricks
    }

    // По масти
    if (suit === 'NT') {
      ps.ntOrders.total++
      if (success) ps.ntOrders.played++
      else ps.ntOrders.remise++
    } else {
      const so = ps.suitOrders[suit]
      so.total++
      if (success) so.played++
      else so.remise++
    }

    // Учёт вистующих
    for (const vp of PLAYERS) {
      if (vp === deal.player) continue
      const vName = game.players[vp]
      const vs = players[vName]
      if (!vs) continue
      const decision = deal.vistDecisions[vp]
      if (decision === 'vist') vs.vist.total++
      else if (decision === 'pass') vs.vist.passed++
      else if (decision === 'half') vs.vist.half++
    }
  } else if (deal.type === 'misere') {
    const playerName = game.players[deal.player]
    const ps = players[playerName]
    if (!ps) return
    ps.miseres.total++
    if (deal.playerTricks === 0) ps.miseres.played++
    else ps.miseres.caught++
  } else if (deal.type === 'raspas') {
    for (const p of PLAYERS) {
      const name = game.players[p]
      const ps = players[name]
      if (!ps) continue
      ps.raspas.total++
      ps.raspas.avgTricks += deal.tricks[p]
      if (deal.tricks[p] === 0) ps.raspas.zeroTricksCount++
      if (deal.level === 3) ps.raspas.eightMerCount++
    }
  } else if (deal.type === 'giveup') {
    const playerName = game.players[deal.player]
    const ps = players[playerName]
    if (!ps) return
    ps.giveups++
  }
}
