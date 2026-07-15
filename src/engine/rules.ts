// Константы правил Питера с конвенциями Андрея
// См. SPEC.md разделы 2-6

import type { GameLevel } from './types'

// Стоимость сыгранной игры (в пулю)
export const POOL_COST: Record<GameLevel, number> = {
  6: 2,
  7: 4,
  8: 6,
  9: 8,
  10: 10,
}
export const MISERE_POOL_COST = 10

// Штраф за 1 недобранную взятку играющего (в гору) — Питер, ×2 к Сочи
export const MOUNT_PENALTY: Record<GameLevel, number> = {
  6: 4,
  7: 8,
  8: 12,
  9: 16,
  10: 20,
}

// Штраф за 1 взятку играющего на мизере (в гору)
export const MISERE_TRICK_PENALTY = 20

// Стоимость 1 взятки вистующего (в висты) — Питер
export const VIST_PER_TRICK: Record<GameLevel, number> = {
  6: 4,
  7: 8,
  8: 12,
  9: 16,
  10: 20,
}

// Обязательное количество взяток пары вистующих
export const VISTERS_DUTY: Record<GameLevel, number> = {
  6: 4,
  7: 2,
  8: 1,
  9: 0,
  10: 0,
}

// Штраф вистующему за 1 недобранную взятку (полуответственный вист) — половина стоимости игры
export const VISTER_PENALTY_PER_MISS: Record<GameLevel, number> = {
  6: 2,
  7: 4,
  8: 6,
  9: 0, // обязательств нет
  10: 0,
}

// Цена взятки на распасах по уровням
export const RASPAS_TRICK_COST: Record<1 | 2 | 3, number> = {
  1: 2,
  2: 4,
  3: 6,
}

// Минимальный заказ по состоянию раскладки
export const RASPAS_MIN_BID: Record<1 | 2 | 3, number> = {
  1: 6, // обычная (до первого распаса)
  2: 7, // после первого распаса
  3: 8, // после второго и на 8-мерных
}

// Финальный расчёт: коэффициенты перевода в висты (Питер)
export const POOL_TO_VISTS = 20 // 1 очко пули = 20 вистов
export const MOUNT_TO_VISTS = 10 // 1 очко горы = 10 вистов (гора уже удвоена в записи)
