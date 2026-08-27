/**
 * РАЗБОР ПАРТИИ: что происходило со сдачами, распасами и первой рукой.
 *
 * Показывает по каждой сдаче: что записали, в каком состоянии распасов она
 * игралась, у кого была первая рука до и после, и как двигался счётчик круга
 * на 8-мерных. То есть ровно то, по чему видно, сработало правило или нет.
 *
 * Ключ берётся из файла .env в корне проекта (строка SERVICE_KEY=...).
 * Значение нигде не печатается.
 *
 * Два источника данных:
 *   1) файл-выгрузка из базы — ключ не нужен вообще;
 *   2) прямо из облака — тогда нужен SERVICE_KEY в .env.
 *
 * Запуск:
 *   npx tsx scripts/inspect-game.ts --file dump.json          — разбор из выгрузки
 *   npx tsx scripts/inspect-game.ts --file dump.json 30 40    — только сдачи 30-40
 *   npx tsx scripts/inspect-game.ts                           — список партий из облака
 *   npx tsx scripts/inspect-game.ts <id> 30 40                — разбор из облака
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyDeal, emptyStateFrom, minBidFor } from '../src/engine'
import { seatsOf } from '../src/engine/types'
import type { GameState, Deal, PlayerId, Seats } from '../src/engine/types'

const SUPABASE_URL = 'https://pulka-api-178-154-204-13.sslip.io'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readServiceKey(): string {
  if (process.env.SERVICE_KEY) return process.env.SERVICE_KEY
  try {
    const env = readFileSync(resolve(ROOT, '.env'), 'utf8')
    for (const line of env.split(/\r?\n/)) {
      const m = /^\s*SERVICE_KEY\s*=\s*(.+?)\s*$/.exec(line)
      if (m) return m[1].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* файла нет — сообщим ниже */
  }
  console.error('Не найден SERVICE_KEY.')
  console.error('Скопируйте .env.example в .env и впишите ключ service_role.')
  console.error('Файл закрыт .gitignore, в чат его вставлять не нужно.')
  process.exit(1)
}

// Клиент создаём лениво: при разборе из файла ключ не нужен и спрашивать его незачем
let client: ReturnType<typeof createClient> | null = null
const db = () => {
  if (!client) client = createClient(SUPABASE_URL, readServiceKey(), { db: { schema: 'pulka' } })
  return client
}

interface CloudGame {
  id: string
  players: Record<PlayerId, string>
  pool_limit: number
  finished: boolean
  created_at: string
  state: {
    pool: Record<PlayerId, number>
    mount: Record<PlayerId, number>
    whists: Record<PlayerId, Record<PlayerId, number>>
    firstHand: PlayerId
    raspasState: GameState['raspasState']
    eightRaspasCounter: Record<PlayerId, number>
    deals: Deal[]
    finishedManually?: boolean
    seats?: Seats
  }
}

const RASPAS_LABEL: Record<string, string> = {
  normal: 'обычная',
  afterFirst: 'после 1-го',
  afterSecond: 'после 2-го',
  eightRaspas: '8-МЕРНЫЕ',
}

function toGameState(c: CloudGame): GameState {
  return {
    players: c.players,
    seats: c.state.seats,
    poolLimit: c.pool_limit,
    createdAt: new Date(c.created_at).getTime(),
    pool: c.state.pool,
    mount: c.state.mount,
    whists: c.state.whists,
    firstHand: c.state.firstHand,
    raspasState: c.state.raspasState,
    eightRaspasCounter: c.state.eightRaspasCounter,
    deals: c.state.deals,
    finishedManually: c.state.finishedManually,
  }
}

// Что записали в сдаче — одной строкой
function describeDeal(deal: Deal, names: Record<PlayerId, string>): string {
  const who = (p: PlayerId) => names[p] || p
  switch (deal.type) {
    case 'game': {
      if (deal.contract.kind !== 'game') return 'игра (?)'
      const lvl = deal.contract.level
      const stal = deal.contract.suit === 'S' && lvl === 6 ? '♠' : ''
      const decisions = Object.entries(deal.vistDecisions)
        .filter(([p]) => p !== deal.player)
        .map(([p, d]) => `${who(p as PlayerId)}:${d === 'vist' ? 'вист' : d === 'pass' ? 'пас' : 'полвиста'}`)
        .join(' ')
      const ok = deal.playerTricks >= lvl ? 'СЫГРАЛ' : `БЕЗ ${lvl - deal.playerTricks}`
      return `${who(deal.player)} ${lvl}${stal} взял ${deal.playerTricks} — ${ok} | ${decisions}`
    }
    case 'misere':
      return `${who(deal.player)} МИЗЕР — ${deal.playerTricks === 0 ? 'сыграл' : `поймали ${deal.playerTricks}`}`
    case 'raspas': {
      const t = Object.entries(deal.tricks)
        .map(([p, n]) => `${who(p as PlayerId)}=${n}`)
        .join(' ')
      return `РАСПАС ур.${deal.level} | ${t}`
    }
    case 'giveup':
      return `${who(deal.player)} УХОД БЕЗ 3 на ${deal.contract.kind === 'game' ? deal.contract.level : '?'}`
    case 'adjust':
      return `правка: ${who(deal.player)} ${deal.target} ${deal.amount > 0 ? '+' : ''}${deal.amount} (${deal.note})`
  }
}

async function listGames() {
  const { data, error } = await db()
    .from('games')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Не удалось прочитать партии:', error.message)
    process.exit(1)
  }
  const games = (data ?? []) as CloudGame[]
  console.log(`Партий в облаке: ${games.length}\n`)
  for (const c of games) {
    const st = toGameState(c)
    const names = seatsOf(st).map((p) => st.players[p]).filter(Boolean).join(', ')
    const when = new Date(c.created_at).toLocaleString('ru-RU')
    const status = c.finished || c.state.finishedManually ? 'завершена' : 'идёт'
    console.log(`${c.id}`)
    console.log(`   ${when} · ${names} · сдач ${c.state.deals?.length ?? 0} · ${status}\n`)
  }
  console.log('Разбор: npx tsx scripts/inspect-game.ts <id> [от] [до]')
}

async function inspect(gameId: string, from: number, to: number) {
  const { data, error } = await db().from('games').select('*').eq('id', gameId).single()
  if (error || !data) {
    console.error('Партия не найдена:', error?.message)
    process.exit(1)
  }
  report(data as CloudGame, from, to)
}

// Разбор выгрузки из файла. Внутри может быть одна партия или список — берём ту,
// где больше всего сдач: обычно она и есть та, о которой идёт речь.
function inspectFile(path: string, from: number, to: number) {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8'))
  const list: CloudGame[] = Array.isArray(raw) ? raw : raw.games ?? [raw]
  if (list.length === 0) {
    console.error('В файле нет партий')
    process.exit(1)
  }
  const sorted = [...list].sort((a, b) => (b.state?.deals?.length ?? 0) - (a.state?.deals?.length ?? 0))
  if (list.length > 1) {
    console.log(`В файле партий: ${list.length}. Разбираю самую длинную.
`)
  }
  report(sorted[0], from, to)
}

function report(c: CloudGame, from: number, to: number) {
  const gameId = c.id
  const game = toGameState(c)
  const seats = seatsOf(game)
  const names = game.players

  console.log(`Партия ${gameId}`)
  console.log(`${new Date(c.created_at).toLocaleString('ru-RU')} · ${seats.map((p) => names[p]).join(', ')}`)
  console.log(`Сдач: ${game.deals.length}. Показываю с ${from} по ${to}.\n`)

  // Проигрываем партию с начала и печатаем, что происходило на каждой сдаче
  let state = emptyStateFrom(game, game.deals[0].firstHand)
  game.deals.forEach((deal, i) => {
    const n = i + 1
    const before = {
      raspas: state.raspasState,
      firstHand: state.firstHand,
      counter: { ...state.eightRaspasCounter },
    }
    const next = applyDeal(state, deal)

    if (n >= from && n <= to) {
      const handMoved = before.firstHand !== next.firstHand
      console.log(`── Сдача ${n} ──────────────────────────────`)
      console.log(`   ${describeDeal(deal, names)}`)
      const stored = (deal as { firstHand?: PlayerId }).firstHand
      const mismatch = stored && stored !== before.firstHand ? `  ⚠ В ЗАПИСИ БЫЛО: ${names[stored]}` : ''
      console.log(
        `   состояние ДО:    ${RASPAS_LABEL[before.raspas]} (мин ${minBidFor(before.raspas)}) · первая рука ${names[before.firstHand]}${mismatch}`,
      )
      console.log(
        `   состояние ПОСЛЕ: ${RASPAS_LABEL[next.raspasState]} (мин ${minBidFor(next.raspasState)}) · первая рука ${names[next.firstHand]} ${handMoved ? '← ПЕРЕШЛА' : '← ОСТАЛАСЬ'}`,
      )
      if (before.raspas === 'eightRaspas' || next.raspasState === 'eightRaspas') {
        const cnt = seats.map((p) => `${names[p]}=${next.eightRaspasCounter[p]}`).join(' ')
        console.log(`   круг на 8-мерных: ${cnt}`)
      }
      const money = seats
        .map((p) => `${names[p]}: пуля ${next.pool[p]} гора ${next.mount[p]}`)
        .join(' | ')
      console.log(`   ${money}`)
      console.log('')
    }
    state = next
  })
}

const args = process.argv.slice(2)
if (args[0] === '--file') {
  inspectFile(args[1], Number(args[2] ?? 1), Number(args[3] ?? 9999))
} else if (!args[0]) {
  listGames()
} else {
  inspect(args[0], Number(args[1] ?? 1), Number(args[2] ?? 9999))
}
