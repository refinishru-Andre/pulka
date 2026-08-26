// Синхронизация игр с облаком Supabase
// Стратегия: LocalStorage — источник истины, облако — резервная копия + переносимость.
// При изменении локально → upsert в облако. При загрузке — pull всех игр пользователя.

import { supabase } from './client'
import type { GameState, Deal } from '../engine/types'
import { applyDeal } from '../engine'

interface CloudGame {
  id: string
  owner_id: string
  players: Record<string, string>
  pool_limit: number
  first_hand_start: string
  state: {
    pool: Record<string, number>
    mount: Record<string, number>
    whists: Record<string, Record<string, number>>
    firstHand: string
    raspasState: string
    eightRaspasCounter: Record<string, number>
    deals: Deal[]
    finishedManually?: boolean
  }
  finished: boolean
  finished_at: string | null
  created_at: string
  updated_at: string
}

// Убрать поля, которые не нужны в облаке
function toCloudState(game: GameState) {
  return {
    pool: game.pool,
    mount: game.mount,
    whists: game.whists,
    firstHand: game.firstHand,
    raspasState: game.raspasState,
    eightRaspasCounter: game.eightRaspasCounter,
    deals: game.deals,
    finishedManually: game.finishedManually,
    // lastDelta не сохраняем, он вычисляется
  }
}

// Восстановить GameState из облачных данных
function fromCloud(cloud: CloudGame): GameState {
  return {
    players: cloud.players as GameState['players'],
    poolLimit: cloud.pool_limit,
    createdAt: new Date(cloud.created_at).getTime(),
    pool: cloud.state.pool as GameState['pool'],
    mount: cloud.state.mount as GameState['mount'],
    whists: cloud.state.whists as GameState['whists'],
    firstHand: cloud.state.firstHand as GameState['firstHand'],
    raspasState: cloud.state.raspasState as GameState['raspasState'],
    eightRaspasCounter: cloud.state.eightRaspasCounter as GameState['eightRaspasCounter'],
    deals: cloud.state.deals,
    finishedManually: cloud.state.finishedManually,
  }
}

// ============ ОБЛАЧНЫЕ ОПЕРАЦИИ ============

// Чем закончилась попытка записи в облако.
// 'guest'  — не вошли в коллекцию, партия живёт только на этом устройстве (это не ошибка);
// 'failed' — вошли, но записать не удалось (нет связи, сервер недоступен, RLS).
export type UploadResult = 'ok' | 'guest' | 'failed'

// Сохранить/обновить текущую игру в облаке.
// ВАЖНО: возвращает результат, а не void — вызывающий код обязан отличать
// «точно записано» от «не записано». Раньше ошибка молча уходила в консоль,
// и потеряшка удалялась из запаса даже когда загрузка не прошла.
export async function uploadGame(
  gameId: string,
  game: GameState,
): Promise<UploadResult> {
  // getSession() читает локальное хранилище и работает без связи —
  // в отличие от getUser(), который ходит на сервер и без сети упал бы.
  const session = (await supabase.auth.getSession()).data.session
  const user = session?.user
  if (!user) return 'guest' // не авторизован — не синхронизируем

  const allClosed = Object.values(game.pool).every((p) => p >= game.poolLimit)
  const finished = allClosed || game.finishedManually === true

  const payload = {
    id: gameId,
    owner_id: user.id,
    players: game.players,
    pool_limit: game.poolLimit,
    first_hand_start: game.deals[0]?.firstHand ?? game.firstHand,
    state: toCloudState(game),
    finished,
    finished_at: finished ? new Date().toISOString() : null,
  }

  try {
    const { error } = await supabase.from('games').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.error('[sync] upload failed:', error)
      return 'failed'
    }
    return 'ok'
  } catch (err) {
    // Обрыв связи бросает исключение, а не возвращает error
    console.error('[sync] upload threw:', err)
    return 'failed'
  }
}

export interface GamesFetch {
  ok: boolean // false = не смогли достучаться до облака (нет связи / не залогинен)
  items: { id: string; game: GameState; finished: boolean }[]
}

// Загрузить все игры пользователя из облака.
// ok отличает «в облаке пусто» от «облако недоступно» — это важно, чтобы
// не пугать человека сообщением «партия не сохранена» при обрыве связи.
export async function fetchGamesResult(): Promise<GamesFetch> {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { ok: false, items: [] }

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[sync] fetch failed:', error)
    return { ok: false, items: [] }
  }
  const items = (data as CloudGame[]).map((c) => {
    const raw = fromCloud(c)
    // Пересчитываем state из deals — cloud state мог быть с багами старой логики
    const game = raw.deals.length > 0 ? recomputeState(raw) : raw
    return { id: c.id, game, finished: c.finished }
  })
  return { ok: true, items }
}

// Короткая форма — когда разница «пусто / нет связи» не важна
export async function fetchGames(): Promise<{ id: string; game: GameState; finished: boolean }[]> {
  return (await fetchGamesResult()).items
}

// Пересчитать state из deals[] — гарантирует что pool/mount/whists соответствуют актуальной логике движка
function recomputeState(game: GameState): GameState {
  const initial: GameState = {
    ...game,
    pool: { A: 0, B: 0, C: 0 },
    mount: { A: 0, B: 0, C: 0 },
    whists: {
      A: { A: 0, B: 0, C: 0 },
      B: { A: 0, B: 0, C: 0 },
      C: { A: 0, B: 0, C: 0 },
    },
    firstHand: game.deals[0].firstHand,
    raspasState: 'normal',
    eightRaspasCounter: { A: 0, B: 0, C: 0 },
    deals: [],
    lastDelta: undefined,
  }
  return game.deals.reduce(applyDeal, initial)
}

// Удалить игру
export async function deleteGame(gameId: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return
  const { error } = await supabase.from('games').delete().eq('id', gameId)
  if (error) console.error('[sync] delete failed:', error)
}
