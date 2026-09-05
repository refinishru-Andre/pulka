/**
 * «А если бы играли по другим правилам?»
 *
 * Берёт сыгранную партию и пересчитывает ТЕ ЖЕ сдачи по другому своду правил.
 * Показывает оба итога рядом и объясняет, из чего вышла разница.
 *
 * Оговорка: моделируется только СЧЁТ. Ход игры не меняется — люди за столом
 * при других правилах заказывали бы иначе, а пуля с пределом кончилась бы
 * раньше. Поэтому предел пули при пересчёте снимается.
 *
 * Запуск: npx tsx scripts/what-if.ts <gameId>
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recomputeState, settle } from '../src/engine'
import { calcDeal } from '../src/engine/calc'
import { zeroScores as zero, zeroWhists as zeroW } from '../src/engine/types'
import { HOME_RULES, FSPR_RULES, rulesOf } from '../src/engine/conventions'
import { seatsOf } from '../src/engine/types'
import type { GameState, PlayerId } from '../src/engine/types'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const key = (() => {
  const e = readFileSync(resolve(ROOT, '.env'), 'utf8')
  for (const l of e.split(/\r?\n/)) { const m = /^\s*SERVICE_KEY\s*=\s*(.+?)\s*$/.exec(l); if (m) return m[1] }
  throw new Error('нет ключа')
})()
const db = createClient('https://pulka-api-178-154-204-13.sslip.io', key, { db: { schema: 'pulka' } })

const { data } = await db.from('games').select('*').eq('id', process.argv[2]).single()
const c = data as any
const base: GameState = {
  players: c.players,
  seats: c.state.seats,
  poolLimit: null, // предел снимаем: иначе пуля закрылась бы и партия оборвалась
  createdAt: new Date(c.created_at).getTime(),
  pool: c.state.pool, mount: c.state.mount, whists: c.state.whists,
  firstHand: c.state.firstHand, raspasState: c.state.raspasState,
  eightRaspasCounter: c.state.eightRaspasCounter, deals: c.state.deals,
  rules: c.state.rules,
}
const seats = seatsOf(base)
const n = (p: PlayerId) => base.players[p]

const asPlayed = recomputeState({ ...base, frozenAt: undefined, rules: rulesOf(base) })
const asHome = recomputeState({ ...base, frozenAt: undefined, rules: HOME_RULES })

const a = settle(asPlayed)
const b = settle(asHome)

console.log(`Партия ${new Date(c.created_at).toLocaleString('ru-RU')} · сдач ${base.deals.length}`)
console.log(`Играли по: ${rulesOf(base).name}\n`)

const pad = (s: string, w: number) => s.padEnd(w)
console.log(pad('', 12) + pad('ТУРНИР', 26) + 'ДОМА')
console.log(pad('', 12) + pad('пуля  гора   итог', 26) + 'пуля  гора   итог')
for (const p of seats) {
  const row = (st: GameState, s: ReturnType<typeof settle>) =>
    `${String(st.pool[p]).padStart(4)}${String(st.mount[p]).padStart(6)}${String((s.net[p] > 0 ? '+' : '') + s.net[p]).padStart(7)}`
  console.log(pad(n(p), 12) + pad(row(asPlayed, a), 26) + row(asHome, b))
}

const debts = (s: ReturnType<typeof settle>) =>
  s.pairwise.length ? s.pairwise.map((d) => `${n(d.from)} → ${n(d.to)}: ${d.amount}`).join('; ') : 'никто никому'
console.log(`\nкто кому должен по турниру: ${debts(a)}`)
console.log(`кто кому должен дома:      ${debts(b)}`)
