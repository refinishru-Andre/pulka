// Честный статус записи текущей партии в облако.
//
// Зачем: раньше ошибка загрузки уходила в console.error, а на экране горело
// зелёное «Синхронизировано с облаком» — оно показывало лишь факт входа, а не
// то, что последняя сдача доехала. За столом обрыв связи был не виден.
//
// Здесь только состояние для индикатора. Сама отправка и повторы — в game.ts.

import { create } from 'zustand'

export type SyncState =
  | 'idle' // партии нет / записывать нечего
  | 'guest' // не вошли в коллекцию: партия только на этом устройстве
  | 'saving' // есть незаписанные изменения, отправляем
  | 'saved' // всё уехало в облако
  | 'failed' // вошли, но записать не удалось (нет связи / сервер недоступен)

interface SyncStatusStore {
  state: SyncState
  savedAt: number | null // когда последний раз успешно записали
  failedSince: number | null // с какого момента не удаётся записать
  setState: (s: SyncState) => void
  reset: () => void
}

export const useSyncStatus = create<SyncStatusStore>((set, get) => ({
  state: 'idle',
  savedAt: null,
  failedSince: null,
  setState: (s) =>
    set({
      state: s,
      savedAt: s === 'saved' ? Date.now() : get().savedAt,
      // отметку о начале проблем ставим один раз и снимаем только при успехе
      failedSince:
        s === 'failed' ? (get().failedSince ?? Date.now()) : s === 'saved' ? null : get().failedSince,
    }),
  reset: () => set({ state: 'idle', savedAt: null, failedSince: null }),
}))

// Для вызова из не-React кода (стор игры)
export const setSyncState = (s: SyncState) => useSyncStatus.getState().setState(s)
