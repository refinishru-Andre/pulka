// Итог партии одним куском текста — чтобы отправить людям.
//
// Один и тот же текст нужен в двух местах: в сыгранной партии и в калькуляторе.
// Калькулятор внутри собирает такое же состояние партии, поэтому функция общая:
// разъехаться два разных отчёта не смогут.

import type { GameState, PlayerId } from './types'
import { seatsOf } from './types'
import { rulesOf } from './conventions'
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
