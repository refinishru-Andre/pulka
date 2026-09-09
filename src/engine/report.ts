// Итог партии одним куском текста — чтобы отправить людям.
//
// Один и тот же текст нужен в двух местах: в сыгранной партии и в калькуляторе.
// Калькулятор внутри собирает такое же состояние партии, поэтому функция общая:
// разъехаться два разных отчёта не смогут.

import type { GameState, PlayerId, Deal, Seats } from './types'
import { seatsOf } from './types'
import { rulesOf, halfVistTricks, ladderAt, type Rules } from './conventions'
import { settle } from './settle'

function dateLabel(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('ru-RU')
}

export function gameResultText(game: GameState, title = 'Пулька — итог'): string {
  const seats = seatsOf(game)
  const rules = rulesOf(game)
  const result = settle(game)
  const name = (p: PlayerId) => game.players[p] || p
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

  const lines: string[] = []
  const when = dateLabel(game.createdAt)
  lines.push(when ? `${title} · ${when}` : title)
  if (game.deals.length > 0) lines.push(`Сдач: ${game.deals.length}`)
  lines.push('')

  seats.forEach((p) => {
    lines.push(
      `${name(p)}: пуля ${game.pool[p] ?? 0}, гора ${game.mount[p] ?? 0}, итог ${signed(
        result.net[p],
      )}`,
    )
  })

  lines.push('')
  if (result.pairwise.length === 0) {
    lines.push('Никто никому ничего не должен')
  } else {
    result.pairwise.forEach((d) =>
      lines.push(`${name(d.from)} должен ${name(d.to)} ${d.amount} вистов`),
    )
  }

  lines.push('')
  lines.push(`Правила: ${rules.name}`)
  return lines.join('\n')
}

// ============================================================================
// РАЗБОР СДАЧИ: откуда взялась каждая цифра
//
// За столом мало увидеть «висты +12». Нужно видеть, из чего они сложились:
// взятки, консоляция, премия за прикуп. Иначе каждый спорный расчёт приходится
// проверять вручную или спрашивать у разработчика.
// ============================================================================


export function dealBreakdown(
  deal: Deal,
  seats: Seats,
  rules: Rules,
  players: Record<PlayerId, string>,
): string[] {
  const who = (p: PlayerId) => players[p] || p
  const lines: string[] = []

  // РАСПАС. Разбираем по каждому игроку поимённо, включая взявших ноль.
  // Раньше объяснения не было вовсе, и в записи оставались только те, у кого
  // гора изменилась. Человек с нулём просто исчезал, и было непонятно: то ли
  // ему списали по амнистии, то ли забыли (замечание Андрея 09.09.2026).
  if (deal.type === 'raspas') {
    const cost = ladderAt(rules.raspasCostLadder, deal.level - 1)
    const played = seats.filter(
      (p) => deal.tricks[p] !== undefined || !(seats.length === 4 && p === deal.dealer),
    )
    const min = Math.min(...played.map((p) => deal.tricks[p] ?? 0))
    lines.push(
      `Взятка на этом распасе ${cost} в гору. ` +
        (rules.raspasWriteEveryTrick
          ? 'Пишем каждому за КАЖДУЮ его взятку.'
          : min > 0
            ? `Амнистия минимума: у всех вычитается ${min} — столько взял тот, кто взял меньше всех.`
            : 'Амнистия минимума на этой сдаче ничего не меняет — кто-то взял ноль.'),
    )
    played.forEach((p) => {
      const mine = deal.tricks[p] ?? 0
      const billed = rules.raspasWriteEveryTrick ? mine : mine - min
      const tail = rules.raspasWriteEveryTrick
        ? `${mine} × ${cost} = ${billed * cost}`
        : `(${mine} − ${min}) × ${cost} = ${billed * cost}`
      lines.push(`${who(p)}: взял ${mine} — в гору ${billed * cost}${billed > 0 ? ` (${tail})` : ''}.`)
    })
    // Поблажка за ноль взяток — и почему её может не быть
    played
      .filter((p) => (deal.tricks[p] ?? 0) === 0)
      .forEach((p) => {
        if (rules.raspasZeroExcludesDealer && p === deal.dealer) {
          lines.push(
            `${who(p)} взял 0, но он сдающий — поблажка за чистый распас ему не полагается.`,
          )
        } else if (rules.raspasZeroBonus === 'mountMinus2') {
          lines.push(`${who(p)} взял 0 — списываем цену 2 взяток: ${-2 * cost} в гору.`)
        } else if (rules.raspasZeroBonus === 'poolPlus1') {
          lines.push(`${who(p)} взял 0 — пишем цену взятки в пулю: +${cost}.`)
        }
      })
    return lines
  }

  if (deal.type !== 'game' || deal.contract.kind !== 'game') return lines

  const level = deal.contract.level
  const perTrick = rules.vistPerTrick[level]
  const duty = rules.vistersDuty[level]
  const perMiss = rules.visterPenaltyPerMiss[level]
  const fourHanded = seats.length === 4

  // Кто вистовал: втроём все кроме играющего, вчетвером сдающий только если
  // за ним записано решение
  const vs = seats.filter(
    (p) => p !== deal.player && (!fourHanded || p !== deal.dealer || deal.vistDecisions[p] !== undefined),
  )
  const active = vs.filter((v) => deal.vistDecisions[v] !== 'pass')
  const passed = vs.filter((v) => deal.vistDecisions[v] === 'pass')
  const total = vs.reduce((s, v) => s + (deal.vistersTricks[v] ?? 0), 0)
  const success = deal.playerTricks >= level

  // Автоматы без розыгрыша
  if (active.length === 0) {
    lines.push(`Все пасовали — игра автоматом, ${who(deal.player)} пишет ${rules.poolCost[level]} в пулю.`)
    return lines
  }
  const half = vs.find((v) => deal.vistDecisions[v] === 'half')
  const halfStands = half !== undefined && active.every((v) => v === half)
  if (half && halfStands && rules.halfVistLevels.includes(level)) {
    const t = halfVistTricks(rules, level)
    lines.push(`Полвиста — без розыгрыша. ${who(deal.player)} пишет ${rules.poolCost[level]} в пулю.`)
    lines.push(`${who(half)} за полвиста: ${t} × ${perTrick} = ${t * perTrick} на ${who(deal.player)}.`)
    return lines
  }

  // Итог играющего
  if (success) {
    lines.push(`${who(deal.player)} сыграл — пуля +${rules.poolCost[level]}.`)
  } else {
    const short = level - deal.playerTricks
    lines.push(
      `${who(deal.player)} сел без ${short} — гора +${short * rules.mountPenalty[level]} (${short} × ${rules.mountPenalty[level]}).`,
    )
  }

  // Висты за взятки
  // Дележ отменяется, если вист достался одному через перевистовку — см. calc.ts
  const realVisters = active.filter((v) => deal.vistDecisions[v] !== 'half')
  const soloVister = realVisters.length === 1 ? realVisters[0] : null
  const vistReturned = soloVister !== null && half !== undefined
  const dealerVisted = soloVister !== null && fourHanded && soloVister === deal.dealer
  const noSplit = vistReturned || dealerVisted
  const gentlemanSplit = rules.vistStyle === 'gentleman' && passed.length > 0 && !noSplit
  if (total > 0) {
    if (gentlemanSplit) {
      const share = total / vs.length
      lines.push(
        `Взятки защиты: ${total} × ${perTrick} = ${total * perTrick}. Вист джентльменский — делим поровну, по ${share * perTrick} каждому (${vs.map(who).join(' и ')}).`,
      )
    } else if (soloVister) {
      const why = vistReturned
        ? ` (${who(half!)} уходил за полвиста, вист вернули — дележа нет, полвиста аннулировано)`
        : dealerVisted
          ? ' (вистовал сдающий — оба защитника отказались, дележа нет)'
          : ''
      lines.push(
        `${who(soloVister)} вистовал один${why} — пишет все ${total} взяток пары: ${total} × ${perTrick} = ${total * perTrick}.`,
      )
    } else {
      lines.push(
        `Взятки, каждый за свои: ` +
          active
            .map((v) => `${who(v)} ${deal.vistersTricks[v] ?? 0} × ${perTrick} = ${(deal.vistersTricks[v] ?? 0) * perTrick}`)
            .join('; ') +
          '.',
      )
    }
  }

  // Консоляция за подсад
  if (!success && rules.consolation) {
    const short = level - deal.playerTricks
    const cons = short * perTrick
    if (cons > 0) {
      const receivers = noSplit && soloVister ? new Set<PlayerId>([soloVister]) : new Set<PlayerId>(vs)
      if (rules.consolationToDealer && fourHanded) receivers.add(deal.dealer)
      lines.push(
        `Консоляция за подсад: ${short} × ${perTrick} = ${cons} каждому (${[...receivers].filter((p) => p !== deal.player).map(who).join(', ')}).`,
      )
    }
  }

  // Штраф за недобор нормы
  if (total < duty) {
    lines.push(
      `Норма защиты на ${level}-й — ${duty} взятк${duty === 1 ? 'а' : 'и'}, взяли ${total}. Недобор пишется в гору по ${perMiss} за взятку.`,
    )
  }

  // Висты за прикуп (в кодексе — премия за «быстрые взятки»)
  const fast = deal.prikupFastTricks ?? 0
  if (rules.prikupBonus && fast > 0) {
    const pot = fast * perTrick
    const word = fast === 1 ? 'взятку' : 'взятки'
    if (fourHanded) {
      lines.push(
        `Висты за прикуп (за ${fast} ${word}): ${fast} × ${perTrick} = ${pot} — пишет сдающий, ${who(deal.dealer)}, на играющего.`,
      )
    } else {
      // Втроём премию пишут ОБА соперника по половине, независимо от того, кто
      // сдавал — «хоть бы и сам играющий» (кодекс ФСПР 6.4).
      const opponents = seats.filter((p) => p !== deal.player)
      const each = pot / opponents.length
      lines.push(
        `Висты за прикуп (за ${fast} ${word}): ${fast} × ${perTrick} = ${pot}. Втроём делится между соперниками: ` +
          opponents.map((p) => `${who(p)} ${each}`).join(', ') +
          ' — на играющего.',
      )
    }
  }

  return lines
}
