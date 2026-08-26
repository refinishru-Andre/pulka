/**
 * Вмораживает итоги сыгранных партий в облаке.
 *
 * Зачем. Обычно приложение не хранит результат: пуля/гора/висты пересчитываются
 * из deals[] при каждой загрузке партии. Значит любое изменение формул движка
 * задним числом меняет цифры уже сыгранных партий. Решение Андрея (2026-08-26):
 * сыгранная партия должна остаться такой, какой её увидели за столом — даже если
 * в ней была ошибка счёта. Скрипт проставляет партиям метку frozenAt, после чего
 * recomputeState() их не трогает.
 *
 * Что именно вмораживается: цифры, посчитанные СЕГОДНЯШНИМ движком — это то, что
 * Андрей видит в приложении сейчас. Не то, что лежит в облаке (там может быть
 * устаревший кеш от старых версий).
 *
 * Ключ доступа берётся из файла .env в корне проекта (строка SERVICE_KEY=...).
 * Значение нигде не печатается. .env закрыт .gitignore.
 *
 * Запуск:
 *   npx tsx scripts/freeze-games.ts            — отчёт, ничего не меняет
 *   npx tsx scripts/freeze-games.ts --apply    — вморозить
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recomputeState } from '../src/engine'
import { seatsOf } from '../src/engine/types'
import type { GameState, Deal, PlayerId, Seats } from '../src/engine/types'

const SUPABASE_URL = 'https://pulka-api-178-154-204-13.sslip.io'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Ключ: сначала из окружения, иначе из .env. Значение не логируем никогда.
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
  console.error('Создайте файл .env в папке проекта со строкой:')
  console.error('SERVICE_KEY=<ключ service_role из Supabase>')
  console.error('(файл закрыт .gitignore, в репозиторий не попадёт)')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const supabase = createClient(SUPABASE_URL, readServiceKey(), { db: { schema: 'pulka' } })

interface CloudGame {
  id: string
  players: Record<PlayerId, string>
  pool_limit: number
  first_hand_start: PlayerId
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
    frozenAt?: number
  }
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
    frozenAt: c.state.frozenAt,
  }
}

// Отличается ли то, что лежит в облаке, от того, что даёт сегодняшний движок
function diffSummary(cloud: GameState, fresh: GameState): string[] {
  const out: string[] = []
  for (const p of seatsOf(fresh)) {
    const name = fresh.players[p] || p
    if ((cloud.pool[p] ?? 0) !== fresh.pool[p]) {
      out.push(`пуля ${name}: в облаке ${cloud.pool[p] ?? 0} → сейчас ${fresh.pool[p]}`)
    }
    if ((cloud.mount[p] ?? 0) !== fresh.mount[p]) {
      out.push(`гора ${name}: в облаке ${cloud.mount[p] ?? 0} → сейчас ${fresh.mount[p]}`)
    }
    for (const q of seatsOf(fresh)) {
      if (p === q) continue
      const was = cloud.whists?.[p]?.[q] ?? 0
      const now = fresh.whists[p][q]
      if (was !== now) {
        out.push(`висты ${name}→${fresh.players[q] || q}: ${was} → ${now}`)
      }
    }
  }
  return out
}

async function main() {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Не удалось прочитать партии:', error.message)
    process.exit(1)
  }
  const games = (data ?? []) as CloudGame[]
  console.log(`Партий в облаке: ${games.length}`)
  console.log(APPLY ? 'Режим: ВМОРОЗИТЬ\n' : 'Режим: только отчёт (для записи добавьте --apply)\n')

  let alreadyFrozen = 0
  let toFreeze = 0
  let skippedUnfinished = 0
  let withDiff = 0

  for (const c of games) {
    const cloudState = toGameState(c)
    const names = seatsOf(cloudState)
      .map((p) => cloudState.players[p])
      .filter(Boolean)
      .join(', ')
    const date = new Date(c.created_at).toLocaleDateString('ru-RU')
    const head = `[${date}] ${names} · сдач ${c.state.deals?.length ?? 0}`

    if (cloudState.frozenAt) {
      alreadyFrozen++
      console.log(`${head} — уже вморожена, пропуск`)
      continue
    }
    const isFinished = c.finished || c.state.finishedManually === true
    if (!isFinished) {
      skippedUnfinished++
      console.log(`${head} — НЕ завершена, не вмораживаем (партия ещё идёт)`)
      continue
    }

    // Считаем сегодняшним движком — это то, что Андрей видит в приложении
    const fresh = recomputeState({ ...cloudState, frozenAt: undefined })
    const diff = diffSummary(cloudState, fresh)
    if (diff.length > 0) {
      withDiff++
      console.log(`${head} — вмораживаем; кеш в облаке был устаревшим:`)
      diff.forEach((d) => console.log(`    ${d}`))
    } else {
      console.log(`${head} — вмораживаем`)
    }
    toFreeze++

    if (APPLY) {
      const payload = {
        ...c.state,
        pool: fresh.pool,
        mount: fresh.mount,
        whists: fresh.whists,
        firstHand: fresh.firstHand,
        raspasState: fresh.raspasState,
        eightRaspasCounter: fresh.eightRaspasCounter,
        seats: fresh.seats,
        frozenAt: Date.now(),
      }
      const { error: upErr } = await supabase.from('games').update({ state: payload }).eq('id', c.id)
      if (upErr) console.error(`    ОШИБКА записи: ${upErr.message}`)
    }
  }

  console.log('\n--- Итого ---')
  console.log(`уже были вморожены: ${alreadyFrozen}`)
  console.log(`${APPLY ? 'вморожено' : 'к заморозке'}: ${toFreeze}`)
  console.log(`  из них с устаревшим кешем в облаке: ${withDiff}`)
  console.log(`не завершены, оставлены как есть: ${skippedUnfinished}`)
  if (!APPLY && toFreeze > 0) console.log('\nЧтобы записать: npx tsx scripts/freeze-games.ts --apply')
}

main()
