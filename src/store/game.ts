// Zustand-стор игры с сохранением в LocalStorage + синхронизация с облаком

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Deal, GameState, PlayerId } from '../engine/types'
import { applyDeal, undoLastDeal } from '../engine'
import { uploadGame } from '../supabase/sync'

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

// Дебаунс синхронизации: сохраняем не чаще раза в 2 секунды
let syncTimer: number | null = null
function scheduleSync(gameId: string, game: GameState) {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    uploadGame(gameId, game).catch(() => {})
  }, 1500)
}

interface Store {
  game: GameState | null
  gameId: string | null // UUID текущей игры для облачной синхронизации
  redoStack: Deal[]
  newGame: (params: {
    players: Record<PlayerId, string>
    poolLimit: number
    firstHand: PlayerId
  }) => void
  loadGame: (id: string, game: GameState) => void
  addDeal: (deal: Deal) => void
  undoDeal: () => void
  redoDeal: () => void
  resetGame: () => void
  recalculate: () => void
  // Прикрепить текущую локальную игру к облаку (даёт UUID и загружает)
  attachToCloud: () => Promise<string | null>
  // Пометить текущую партию как завершённую (прервать вручную)
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
      newGame: ({ players, poolLimit, firstHand }) => {
        const id = uuid()
        const game = initialGameState(players, poolLimit, firstHand)
        set({ game, gameId: id, redoStack: [] })
        scheduleSync(id, game)
      },
      loadGame: (id, game) => {
        set({ game, gameId: id, redoStack: [] })
      },
      addDeal: (deal) => {
        const g = get().game
        if (!g) return
        const newGame = applyDeal(g, deal)
        set({ game: newGame, redoStack: [] })
        const id = get().gameId
        if (id) scheduleSync(id, newGame)
      },
      undoDeal: () => {
        const g = get().game
        if (!g || g.deals.length === 0) return
        const lastDeal = g.deals[g.deals.length - 1]
        const newGame = undoLastDeal(g)
        set({
          game: newGame,
          redoStack: [...get().redoStack, lastDeal],
        })
        const id = get().gameId
        if (id) scheduleSync(id, newGame)
      },
      redoDeal: () => {
        const stack = get().redoStack
        const g = get().game
        if (!g || stack.length === 0) return
        const deal = stack[stack.length - 1]
        const newGame = applyDeal(g, deal)
        set({
          game: newGame,
          redoStack: stack.slice(0, -1),
        })
        const id = get().gameId
        if (id) scheduleSync(id, newGame)
      },
      resetGame: () => set({ game: null, gameId: null, redoStack: [] }),
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
        try {
          await uploadGame(id, g)
          return id
        } catch (err) {
          console.error('[attachToCloud] failed:', err)
          return id // всё равно возвращаем — при следующей сдаче syncScheduler попробует ещё раз
        }
      },
      // Пересчитать всё состояние из истории deals[] — на случай изменений движка.
      // Также гарантируем что redoStack инициализирован (после hydration может быть undefined).
      recalculate: () => {
        // Инициализация redoStack если undefined (после hydration старой версии)
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
        }
        set({ game: deals.reduce(applyDeal, initial) })
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
