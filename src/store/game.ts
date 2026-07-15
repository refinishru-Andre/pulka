// Zustand-стор игры с сохранением в LocalStorage

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Deal, GameState, PlayerId } from '../engine/types'
import { applyDeal, undoLastDeal } from '../engine'

// Версия логики расчёта. Инкрементируется при изменении формул — вызывает пересчёт всех игр.
const CALC_VERSION = 2

interface Store {
  game: GameState | null
  newGame: (params: {
    players: Record<PlayerId, string>
    poolLimit: number
    firstHand: PlayerId
  }) => void
  addDeal: (deal: Deal) => void
  undoDeal: () => void
  resetGame: () => void
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
      newGame: ({ players, poolLimit, firstHand }) => {
        set({ game: initialGameState(players, poolLimit, firstHand) })
      },
      addDeal: (deal) => {
        const g = get().game
        if (!g) return
        set({ game: applyDeal(g, deal) })
      },
      undoDeal: () => {
        const g = get().game
        if (!g || g.deals.length === 0) return
        set({ game: undoLastDeal(g) })
      },
      resetGame: () => set({ game: null }),
    }),
    {
      name: 'pulka-game-v1',
      storage: createJSONStorage(() => localStorage),
      version: CALC_VERSION,
      // При смене версии — пересчитываем всю игру из истории deals[]
      migrate: (persisted: unknown) => {
        const state = persisted as { game: GameState | null }
        if (!state?.game || state.game.deals.length === 0) return state
        // Replay всех сдач с чистого состояния
        const initial: GameState = {
          ...state.game,
          pool: { A: 0, B: 0, C: 0 },
          mount: { A: 0, B: 0, C: 0 },
          whists: {
            A: { A: 0, B: 0, C: 0 },
            B: { A: 0, B: 0, C: 0 },
            C: { A: 0, B: 0, C: 0 },
          },
          firstHand: state.game.deals[0].firstHand,
          raspasState: 'normal',
          eightRaspasCounter: { A: 0, B: 0, C: 0 },
          deals: [],
        }
        const replayed = state.game.deals.reduce(applyDeal, initial)
        return { game: replayed }
      },
    },
  ),
)
