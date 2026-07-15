// Zustand-стор игры с сохранением в LocalStorage

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Deal, GameState, PlayerId } from '../engine/types'
import { applyDeal, undoLastDeal } from '../engine'

// Версия логики расчёта. Инкрементируется при изменении формул — вызывает пересчёт всех игр.
const CALC_VERSION = 2

interface Store {
  game: GameState | null
  redoStack: Deal[] // отменённые сдачи для «Вперёд»
  newGame: (params: {
    players: Record<PlayerId, string>
    poolLimit: number
    firstHand: PlayerId
  }) => void
  addDeal: (deal: Deal) => void
  undoDeal: () => void
  redoDeal: () => void
  resetGame: () => void
  recalculate: () => void
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
      redoStack: [],
      newGame: ({ players, poolLimit, firstHand }) => {
        set({ game: initialGameState(players, poolLimit, firstHand), redoStack: [] })
      },
      addDeal: (deal) => {
        const g = get().game
        if (!g) return
        // Новая сдача очищает redo — после развилки старая ветка бессмысленна
        set({ game: applyDeal(g, deal), redoStack: [] })
      },
      undoDeal: () => {
        const g = get().game
        if (!g || g.deals.length === 0) return
        // Кладём последнюю сдачу в redoStack и откатываем
        const lastDeal = g.deals[g.deals.length - 1]
        set({
          game: undoLastDeal(g),
          redoStack: [...get().redoStack, lastDeal],
        })
      },
      redoDeal: () => {
        const stack = get().redoStack
        const g = get().game
        if (!g || stack.length === 0) return
        const deal = stack[stack.length - 1]
        set({
          game: applyDeal(g, deal),
          redoStack: stack.slice(0, -1),
        })
      },
      resetGame: () => set({ game: null, redoStack: [] }),
      // Пересчитать всё состояние из истории deals[] — на случай изменений движка
      recalculate: () => {
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
