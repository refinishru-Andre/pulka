/**
 * Пересчитывает state всех партий в облаке по актуальной логике движка.
 * Использует service_role_key чтобы обойти RLS.
 *
 * Запуск: SERVICE_KEY=xxx npx tsx scripts/recalc-cloud.ts [gameId]
 */
import { createClient } from '@supabase/supabase-js'
import { applyDeal } from '../src/engine'
import type { GameState, Deal, PlayerId } from '../src/engine/types'

const SUPABASE_URL = 'https://pulka-api-178-154-204-13.sslip.io'
const SERVICE_KEY = process.env.SERVICE_KEY
if (!SERVICE_KEY) {
  console.error('SERVICE_KEY env var required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'pulka' },
})

const targetId = process.argv[2]

interface CloudGame {
  id: string
  players: Record<PlayerId, string>
  pool_limit: number
  first_hand_start: PlayerId
  state: {
    pool: Record<PlayerId, number>
    mount: Record<PlayerId, number>
    whists: Record<PlayerId, Record<PlayerId, number>>
    firstHand: PlayerId
    raspasState: string
    eightRaspasCounter: Record<PlayerId, number>
    deals: Deal[]
    finishedManually?: boolean
  }
}

async function main() {
  let query = supabase.from('games').select('*')
  if (targetId) query = query.eq('id', targetId)
  const { data, error } = await query
  if (error) throw error
  console.log(`Found ${data.length} game(s)`)

  for (const cloudGame of data as CloudGame[]) {
    if (!cloudGame.state.deals || cloudGame.state.deals.length === 0) {
      console.log(`Skip ${cloudGame.id.slice(0, 8)} — no deals`)
      continue
    }
    const initial: GameState = {
      players: cloudGame.players,
      poolLimit: cloudGame.pool_limit,
      createdAt: 0,
      pool: { A: 0, B: 0, C: 0 },
      mount: { A: 0, B: 0, C: 0 },
      whists: {
        A: { A: 0, B: 0, C: 0 },
        B: { A: 0, B: 0, C: 0 },
        C: { A: 0, B: 0, C: 0 },
      },
      firstHand: cloudGame.state.deals[0].firstHand,
      raspasState: 'normal',
      eightRaspasCounter: { A: 0, B: 0, C: 0 },
      deals: [],
      finishedManually: cloudGame.state.finishedManually,
    }
    const recalc = cloudGame.state.deals.reduce(applyDeal, initial)
    const newState = {
      pool: recalc.pool,
      mount: recalc.mount,
      whists: recalc.whists,
      firstHand: recalc.firstHand,
      raspasState: recalc.raspasState,
      eightRaspasCounter: recalc.eightRaspasCounter,
      deals: recalc.deals,
      finishedManually: recalc.finishedManually,
    }
    const { error: upErr } = await supabase
      .from('games')
      .update({ state: newState })
      .eq('id', cloudGame.id)
    if (upErr) {
      console.error(`Failed ${cloudGame.id.slice(0, 8)}:`, upErr.message)
    } else {
      console.log(
        `Recalculated ${cloudGame.id.slice(0, 8)}: pool ${JSON.stringify(recalc.pool)}, mount ${JSON.stringify(recalc.mount)}`,
      )
    }
  }
  console.log('Done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
