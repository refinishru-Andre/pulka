// Zustand-стор игры с сохранением в LocalStorage + синхронизация с облаком

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Deal, GameState, PlayerId } from '../engine/types'
import { applyDeal, undoLastDeal } from '../engine'
import { uploadGame, type UploadResult } from '../supabase/sync'
import { PLAYERS } from '../engine/types'
import { stashOrphan } from './orphans'
import { setSyncState } from './sync-status'

// Версия логики расчёта. Инкрементируется при изменении формул — вызывает пересчёт всех игр.
const CALC_VERSION = 2

// Генерация UUID v4 (без внешних зависимостей)
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Синхронизация с облаком: дебаунс + автоповтор, пока не запишется.
//
// pending — последняя НЕзаписанная версия партии. Пока она не пуста, партия
// висит в состоянии «не сохранено», и мы повторяем попытку каждые RETRY_MS.
// Раньше попытка была ровно одна, а её провал уходил в консоль — при обрыве
// связи посреди партии сдачи оставались только на устройстве, и об этом
// никто не узнавал.
const DEBOUNCE_MS = 1500
const RETRY_MS = 20000

let syncTimer: number | null = null
let pending: { gameId: string; game: GameState } | null = null
let flushing = false

function armTimer(delay: number) {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    void flushSync()
  }, delay)
}

async function flushSync() {
  // Уже отправляем — эта попытка не нужна: текущая сама перевзведёт таймер,
  // если к её концу останется что-то незаписанное.
  if (flushing || !pending) return
  flushing = true
  const job = pending
  let result: UploadResult = 'failed'
  try {
    result = await uploadGame(job.gameId, job.game)
  } catch {
    result = 'failed'
  } finally {
    flushing = false
  }

  // Пока отправляли, могла появиться более свежая версия — её не считаем записанной
  if (result !== 'failed' && pending === job) pending = null
  setSyncState(result === 'ok' ? 'saved' : result === 'guest' ? 'guest' : 'failed')
  if (pending) armTimer(result === 'failed' ? RETRY_MS : DEBOUNCE_MS)
}

function scheduleSync(gameId: string, game: GameState) {
  pending = { gameId, game }
  setSyncState('saving')
  armTimer(DEBOUNCE_MS)
}

// Завершённую партию БД менять не даёт (rls_finished_protection.sql: UPDATE только
// пока finished = false). Поэтому её не отправляем повторно — иначе каждое открытие
// такой партии из списка упиралось бы в отказ RLS и поднимало ложную тревогу
// «не уходит в облако». Единственная разрешённая запись — сам перевод в завершённые
// (finishGame), он делается пока в облаке ещё finished = false.
function isGameFinished(g: GameState): boolean {
  return g.finishedManually === true || PLAYERS.every((p) => g.pool[p] >= g.poolLimit)
}

// Связь вернулась — не ждём очередного повтора
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (pending) armTimer(500)
  })
}

interface Store {
  game: GameState | null
  gameId: string | null // UUID текущей игры для облачной синхронизации
  redoStack: Deal[] // (устарело — сохраняем для миграции старых сессий)
  viewIndex: number | null // локальный курсор просмотра истории (null = смотрим финал). НЕ синхронизируется.
  newGame: (params: {
    players: Record<PlayerId, string>
    poolLimit: number
    firstHand: PlayerId
  }) => void
  loadGame: (id: string, game: GameState) => void
  addDeal: (deal: Deal) => void
  viewPrev: () => void // просмотр: назад
  viewNext: () => void // просмотр: вперёд
  viewReset: () => void // сброс просмотра к финалу
  deleteLastDeal: () => void // РЕАЛЬНОЕ удаление последней сдачи (с подтверждением в UI)
  resetGame: () => void
  discardGame: () => void // выбросить текущую партию БЕЗ откладывания в запас
  recalculate: () => void
  attachToCloud: () => Promise<string | null>
  finishGame: () => void
}

const initialGameState = (
  players: Record<PlayerId, string>,
  poolLimit: number,
  firstHand: PlayerId,
): GameState => ({
  players,
  poolLimit,
  createdAt: Date.now(),
  pool: { A: 0, B: 0, C: 0 },
  mount: { A: 0, B: 0, C: 0 },
  whists: {
    A: { A: 0, B: 0, C: 0 },
    B: { A: 0, B: 0, C: 0 },
    C: { A: 0, B: 0, C: 0 },
  },
  firstHand,
  raspasState: 'normal',
  eightRaspasCounter: { A: 0, B: 0, C: 0 },
  deals: [],
})

export const useGameStore = create<Store>()(
  persist(
    (set, get) => ({
      game: null,
      gameId: null,
      redoStack: [],
      viewIndex: null,
      newGame: ({ players, poolLimit, firstHand }) => {
        // Текущую партию откладываем про запас — вдруг она ещё не уехала в облако
        stashOrphan(get().gameId, get().game)
        const id = uuid()
        const game = initialGameState(players, poolLimit, firstHand)
        set({ game, gameId: id, redoStack: [], viewIndex: null })
        scheduleSync(id, game)
      },
      loadGame: (id, game) => {
        const cur = get()
        // Защита от отката. Облачная копия бывает БЕДНЕЕ локальной: связь оборвалась
        // на 5-й сдаче, а доиграли до 10-й. Открытие такой партии из списка раньше
        // затирало локальные сдачи облачными. Теперь локальная версия побеждает и
        // сама уезжает в облако.
        if (cur.gameId === id && cur.game && cur.game.deals.length > game.deals.length) {
          console.warn(
            `[loadGame] локально сдач ${cur.game.deals.length}, в облаке ${game.deals.length} — оставляем локальную версию`,
          )
          set({ viewIndex: null })
          // Завершённую БД всё равно не примет — о расхождении сообщит блок
          // «партии только на этом устройстве» в списке партий.
          if (!isGameFinished(cur.game)) scheduleSync(id, cur.game)
          return
        }
        if (cur.gameId !== id) stashOrphan(cur.gameId, cur.game)
        // Пересчитываем state из deals по актуальной логике движка (на случай изменения правил).
        // Загруженный из облака state мог быть с багами — deals[] это единственный источник истины.
        if (game.deals.length > 0) {
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
          const recalculated = game.deals.reduce(applyDeal, initial)
          set({ game: recalculated, gameId: id, redoStack: [], viewIndex: null })
          // Пересчитанный кеш возвращаем в облако — формулы движка могли измениться.
          // Завершённую партию БД менять не даёт, её просто помечаем как сохранённую.
          if (!isGameFinished(recalculated)) scheduleSync(id, recalculated)
          else setSyncState('saved')
        } else {
          set({ game, gameId: id, redoStack: [], viewIndex: null })
        }
      },
      addDeal: (deal) => {
        const g = get().game
        if (!g) return
        // Блокируем добавление на завершённой партии или во время просмотра
        const allClosed = PLAYERS.every((p) => g.pool[p] >= g.poolLimit)
        if (allClosed || g.finishedManually) return
        if (get().viewIndex !== null) return
        const newGame = applyDeal(g, deal)
        set({ game: newGame, redoStack: [], viewIndex: null })
        const id = get().gameId
        if (id) scheduleSync(id, newGame)
      },
      viewPrev: () => {
        const g = get().game
        if (!g) return
        const cur = get().viewIndex ?? g.deals.length
        const next = Math.max(0, cur - 1)
        set({ viewIndex: next === g.deals.length ? null : next })
      },
      viewNext: () => {
        const g = get().game
        if (!g) return
        const cur = get().viewIndex
        if (cur === null) return // уже на финале
        const next = cur + 1
        set({ viewIndex: next >= g.deals.length ? null : next })
      },
      viewReset: () => set({ viewIndex: null }),
      deleteLastDeal: () => {
        const g = get().game
        if (!g || g.deals.length === 0) return
        // Блокируем на завершённой партии
        const allClosed = PLAYERS.every((p) => g.pool[p] >= g.poolLimit)
        if (allClosed || g.finishedManually) return
        const newGame = undoLastDeal(g)
        set({ game: newGame, viewIndex: null })
        const id = get().gameId
        if (id) scheduleSync(id, newGame)
      },
      resetGame: () => {
        stashOrphan(get().gameId, get().game)
        set({ game: null, gameId: null, redoStack: [], viewIndex: null })
      },
      // Осознанный отказ от партии (кнопка 🗑 в списке потеряшек): в запас НЕ кладём,
      // иначе она вернётся туда же при следующем обновлении списка.
      discardGame: () => {
        // Снимаем с отправки только эту партию — чужой pending не трогаем
        if (pending && pending.gameId === get().gameId) {
          pending = null
          setSyncState('idle')
        }
        set({ game: null, gameId: null, redoStack: [], viewIndex: null })
      },
      finishGame: () => {
        const g = get().game
        if (!g) return
        const finished: GameState = { ...g, finishedManually: true }
        set({ game: finished })
        const id = get().gameId
        if (id) scheduleSync(id, finished)
      },
      attachToCloud: async () => {
        const g = get().game
        if (!g) return null
        // Если уже привязана — возвращаем существующий ID
        const existingId = get().gameId
        if (existingId) return existingId
        // Генерируем UUID, сохраняем и заливаем в облако
        const id = uuid()
        set({ gameId: id })
        const result = await uploadGame(id, g)
        setSyncState(result === 'ok' ? 'saved' : result === 'guest' ? 'guest' : 'failed')
        if (result === 'ok') return id
        // Не записалось — планировщик будет повторять сам, но наверх сообщаем
        // честно: null, чтобы интерфейс не написал «загружено в облако ✓».
        pending = { gameId: id, game: g }
        armTimer(RETRY_MS)
        return null
      },
      // Пересчитать всё состояние из истории deals[] — на случай изменений движка.
      // Также гарантируем что redoStack инициализирован (после hydration может быть undefined).
      recalculate: () => {
        // ВАЖНО: НЕ пушим в облако — иначе локальные данные могут затереть свежие облачные.
        // Облако обновляется только при явных действиях (addDeal, deleteLastDeal, finishGame, loadGame).
        if (!get().redoStack) set({ redoStack: [] })
        const g = get().game
        if (!g || g.deals.length === 0) return
        const deals = g.deals
        const initial: GameState = {
          ...g,
          pool: { A: 0, B: 0, C: 0 },
          mount: { A: 0, B: 0, C: 0 },
          whists: {
            A: { A: 0, B: 0, C: 0 },
            B: { A: 0, B: 0, C: 0 },
            C: { A: 0, B: 0, C: 0 },
          },
          firstHand: deals[0].firstHand,
          raspasState: 'normal',
          eightRaspasCounter: { A: 0, B: 0, C: 0 },
          deals: [],
          lastDelta: undefined,
        }
        const recalculated = deals.reduce(applyDeal, initial)
        set({ game: recalculated })
      },
    }),
    {
      name: 'pulka-game-v1',
      storage: createJSONStorage(() => localStorage),
      version: CALC_VERSION,
      // При КАЖДОЙ загрузке пересчитываем состояние из истории deals[] — deals
      // это единственный источник истины, pool/mount/whists — кеш.
      // Это гарантирует правильные числа даже при изменениях движка расчёта.
      onRehydrateStorage: () => (state) => {
        if (!state?.game || state.game.deals.length === 0) return
        const deals = state.game.deals
        const initial: GameState = {
          ...state.game,
          pool: { A: 0, B: 0, C: 0 },
          mount: { A: 0, B: 0, C: 0 },
          whists: {
            A: { A: 0, B: 0, C: 0 },
            B: { A: 0, B: 0, C: 0 },
            C: { A: 0, B: 0, C: 0 },
          },
          firstHand: deals[0].firstHand,
          raspasState: 'normal',
          eightRaspasCounter: { A: 0, B: 0, C: 0 },
          deals: [],
        }
        state.game = deals.reduce(applyDeal, initial)
      },
    },
  ),
)
