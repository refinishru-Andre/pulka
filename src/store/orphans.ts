// «Осиротевшие» партии — те, что остались только в памяти этого устройства
// и не попали в облако (играли без входа, или в момент игры не было связи).
//
// Зачем: локально приложение держит ТОЛЬКО ОДНУ текущую партию. Раньше запуск
// новой партии затирал предыдущую — и если та не успела уйти в облако, она
// пропадала совсем. Теперь перед заменой партия откладывается сюда, а список
// партий предлагает загрузить её в облако.

import type { GameState } from '../engine/types'

const KEY = 'pulka-orphans-v1'
const MAX = 20

export interface Orphan {
  id: string
  game: GameState
  savedAt: number
}

export function listOrphans(): Orphan[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((o): o is Orphan => !!o?.id && !!o?.game?.deals)
  } catch {
    return []
  }
}

function write(list: Orphan[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)))
  } catch {
    /* переполнение хранилища — не роняем приложение */
  }
}

// Отложить партию про запас. Пустые (без сдач) не храним, дубли по id обновляем.
export function stashOrphan(id: string | null, game: GameState | null) {
  if (!id || !game || game.deals.length === 0) return
  const list = listOrphans().filter((o) => o.id !== id)
  list.push({ id, game, savedAt: Date.now() })
  write(list)
}

export function dropOrphan(id: string) {
  write(listOrphans().filter((o) => o.id !== id))
}

// Убрать из запаса всё, что уже есть в облаке
export function dropSynced(cloudIds: Set<string>) {
  const list = listOrphans()
  const kept = list.filter((o) => !cloudIds.has(o.id))
  if (kept.length !== list.length) write(kept)
}
