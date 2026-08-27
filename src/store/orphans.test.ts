// Правило, по которому партия считается «не сохранённой в облаке».
// Сценарий из жизни: связь оборвалась на 5-й сдаче, доиграли до 10-й.
// Сверка только по id такую партию пропускала — и облачная копия с 5 сдачами
// затирала местную с 10.

import { describe, it, expect } from 'vitest'
import { isMissingFromCloud } from './orphans'

describe('isMissingFromCloud', () => {
  it('партии нет в облаке вообще — не сохранена', () => {
    expect(isMissingFromCloud(10, undefined)).toBe(true)
  })

  it('в облаке столько же сдач — сохранена', () => {
    expect(isMissingFromCloud(10, 10)).toBe(false)
  })

  it('в облаке меньше сдач — НЕ сохранена (обрыв связи посреди партии)', () => {
    expect(isMissingFromCloud(10, 5)).toBe(true)
  })

  it('в облаке больше сдач — считаем сохранённой, облачная версия свежее', () => {
    expect(isMissingFromCloud(5, 10)).toBe(false)
  })

  it('пустая партия, которой нет в облаке', () => {
    expect(isMissingFromCloud(0, undefined)).toBe(true)
  })
})

// ============================================================================
// Просмотр истории: границы отматывания
//
// Ошибка, найденная Андреем 27.08.2026: стрелка «вперёд» с предпоследней сдачи
// прыгала сразу на текущий момент, и последняя сдача проскакивала. На экране это
// выглядело так, будто первая рука перескочила через игрока.
// ============================================================================

import { describe as describeView, it as itView, expect as expectView } from 'vitest'

// Логика границ просмотра, вынесенная из стора один в один
function prev(cur: number | null, dealsCount: number): number | null {
  if (dealsCount === 0) return null
  const c = cur ?? dealsCount
  return Math.max(1, c - 1)
}
function next(cur: number | null, dealsCount: number): number | null {
  if (dealsCount === 0) return null
  if (cur === null) return null
  return Math.min(dealsCount, cur + 1)
}

describeView('Просмотр истории — границы', () => {
  itView('назад не уходит дальше первой сдачи', () => {
    expectView(prev(3, 8)).toBe(2)
    expectView(prev(2, 8)).toBe(1)
    expectView(prev(1, 8)).toBe(1) // упёрлись
  })

  itView('вперёд доходит до ПОСЛЕДНЕЙ сдачи и не перепрыгивает её', () => {
    expectView(next(6, 8)).toBe(7)
    expectView(next(7, 8)).toBe(8) // раньше здесь был прыжок на текущий момент
    expectView(next(8, 8)).toBe(8) // упёрлись
  })

  itView('с текущего момента вперёд некуда', () => {
    expectView(next(null, 8)).toBeNull()
  })

  itView('в пустой партии просмотра нет', () => {
    expectView(prev(null, 0)).toBeNull()
    expectView(next(null, 0)).toBeNull()
  })
})
