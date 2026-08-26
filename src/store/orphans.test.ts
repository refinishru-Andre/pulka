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
