// КАЛЬКУЛЯТОР ПУЛИ
//
// Партию писали на бумаге — вбиваем готовые числа и получаем «кто кому сколько
// должен». Без сдач и без истории.
//
// Конвенции здесь НЕ нужны, и это не упрощение: правила игры влияют на расчёт
// КАЖДОЙ СДАЧИ, а когда пулька уже написана, итоговая арифметика одна для всех
// школ. Единственное, что нужно знать, — курс перевода в висты.

import { useMemo, useState } from 'react'
import type { GameState, PlayerId, Seats } from '../engine/types'
import { ALL_PLAYERS, zeroScores, zeroWhists } from '../engine/types'
import { settle } from '../engine'
import { HOME_RULES } from '../engine/conventions'

interface Props {
  onBack?: () => void
}

// Курс перевода. Ленинградка удваивает очко пули, остальные школы — нет.
const RATES = [
  { id: 'leningrad', name: 'Ленинградка', hint: 'очко пули = 2 очка горы', pool: 20, mount: 10 },
  { id: 'sochi', name: 'Сочинка, классика', hint: 'очко пули = очко горы', pool: 10, mount: 10 },
] as const

// Прочитать введённое число: пустое поле и мусор считаем нулём
const num = (v: string): number => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function Calculator({ onBack }: Props) {
  const [seatCount, setSeatCount] = useState<3 | 4>(3)
  const [rateId, setRateId] = useState<string>(RATES[0].id)
  const [names, setNames] = useState<Record<PlayerId, string>>({ A: '', B: '', C: '', D: '' })
  const [pool, setPool] = useState<Record<PlayerId, string>>({ A: '', B: '', C: '', D: '' })
  const [mount, setMount] = useState<Record<PlayerId, string>>({ A: '', B: '', C: '', D: '' })
  // whists[from][to] — сколько from записал на to
  const [whists, setWhists] = useState<Record<string, string>>({})

  const seats = useMemo<Seats>(() => ALL_PLAYERS.slice(0, seatCount), [seatCount])
  const rate = RATES.find((r) => r.id === rateId) ?? RATES[0]

  const nameOf = (p: PlayerId, idx: number) => names[p].trim() || `Игрок ${idx + 1}`
  const whistKey = (from: PlayerId, to: PlayerId) => `${from}${to}`

  // Собираем из введённого обычное состояние партии и считаем тем же движком,
  // что и живые партии. Никакой отдельной арифметики для калькулятора нет.
  const state = useMemo<GameState>(() => {
    const p = zeroScores()
    const m = zeroScores()
    const w = zeroWhists()
    seats.forEach((s) => {
      p[s] = num(pool[s])
      m[s] = num(mount[s])
      seats.forEach((t) => {
        if (s !== t) w[s][t] = num(whists[whistKey(s, t)] ?? '')
      })
    })
    const players = { A: '', B: '', C: '', D: '' } as Record<PlayerId, string>
    seats.forEach((s, i) => (players[s] = nameOf(s, i)))
    return {
      players,
      seats,
      rules: { ...HOME_RULES, poolToVists: rate.pool, mountToVists: rate.mount },
      poolLimit: null,
      createdAt: 0,
      pool: p,
      mount: m,
      whists: w,
      firstHand: seats[0],
      raspasState: 'normal',
      eightRaspasCounter: zeroScores(),
      deals: [],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats, pool, mount, whists, names, rate])

  const result = settle(state)
  const anyInput =
    seats.some((s) => pool[s].trim() || mount[s].trim()) ||
    Object.values(whists).some((v) => v.trim())

  const cols = seatCount === 4 ? 'grid-cols-4' : 'grid-cols-3'
  const cell =
    'w-full px-2 py-2 bg-slate-900 border border-slate-700 rounded-lg text-center text-lg focus:outline-none focus:border-yellow-500'

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-3xl font-bold">Калькулятор пули</h1>
            <p className="text-slate-400 mt-1">
              Пульку писали на бумаге — вбейте числа, посчитаем итог
            </p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
            >
              ← Назад
            </button>
          )}
        </div>

        <div className="bg-slate-800 rounded-2xl p-5 space-y-5">
          {/* Состав и курс */}
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <div className="text-sm text-slate-300 mb-2">Сколько игроков</div>
              <div className="grid grid-cols-2 gap-2">
                {([3, 4] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setSeatCount(n)}
                    className={`py-3 rounded-lg font-semibold ${
                      seatCount === n
                        ? 'bg-yellow-500 text-slate-900'
                        : 'bg-slate-900 border border-slate-700'
                    }`}
                  >
                    {n === 3 ? 'Втроём' : 'Вчетвером'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-300 mb-2">Курс перевода в висты</div>
              <div className="grid grid-cols-2 gap-2">
                {RATES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRateId(r.id)}
                    className={`py-2 px-2 rounded-lg font-semibold text-sm ${
                      rateId === r.id
                        ? 'bg-yellow-500 text-slate-900'
                        : 'bg-slate-900 border border-slate-700'
                    }`}
                  >
                    {r.name}
                    <div className="text-xs font-normal opacity-80">{r.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Имена */}
          <div>
            <div className="text-sm text-slate-300 mb-2">Имена</div>
            <div className={`grid gap-2 ${cols}`}>
              {seats.map((p, idx) => (
                <input
                  key={p}
                  type="text"
                  value={names[p]}
                  onChange={(e) => setNames({ ...names, [p]: e.target.value })}
                  placeholder={`Игрок ${idx + 1}`}
                  className={cell}
                />
              ))}
            </div>
          </div>

          {/* Пуля и гора */}
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <div className="text-sm text-slate-300 mb-2">Пуля</div>
              <div className={`grid gap-2 ${cols}`}>
                {seats.map((p) => (
                  <input
                    key={p}
                    type="text"
                    inputMode="numeric"
                    value={pool[p]}
                    onChange={(e) => setPool({ ...pool, [p]: e.target.value })}
                    placeholder="0"
                    className={cell}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-300 mb-2">Гора</div>
              <div className={`grid gap-2 ${cols}`}>
                {seats.map((p) => (
                  <input
                    key={p}
                    type="text"
                    inputMode="numeric"
                    value={mount[p]}
                    onChange={(e) => setMount({ ...mount, [p]: e.target.value })}
                    placeholder="0"
                    className={cell}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Висты */}
          <div>
            <div className="text-sm text-slate-300 mb-2">
              Висты <span className="text-slate-500">— сколько записал на каждого соперника</span>
            </div>
            <div className="space-y-2">
              {seats.map((from, i) => (
                <div key={from} className="flex items-center gap-2 flex-wrap">
                  <div className="w-24 shrink-0 font-semibold truncate">{nameOf(from, i)}</div>
                  {seats
                    .filter((to) => to !== from)
                    .map((to) => (
                      <div key={to} className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">
                          на {nameOf(to, seats.indexOf(to))}
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={whists[whistKey(from, to)] ?? ''}
                          onChange={(e) =>
                            setWhists({ ...whists, [whistKey(from, to)]: e.target.value })
                          }
                          placeholder="0"
                          className="w-20 px-2 py-2 bg-slate-900 border border-slate-700 rounded-lg text-center focus:outline-none focus:border-yellow-500"
                        />
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Итог */}
        <div className="bg-slate-800 rounded-2xl p-5 mt-5">
          <h2 className="text-xl font-bold mb-3">Итог</h2>
          {!anyInput ? (
            <div className="text-slate-500">Введите числа — итог посчитается сам.</div>
          ) : (
            <>
              <div className={`grid gap-3 ${cols} mb-4`}>
                {seats.map((p, idx) => (
                  <div key={p} className="bg-slate-900 rounded-lg p-3 text-center">
                    <div className="text-sm text-slate-400 truncate">{nameOf(p, idx)}</div>
                    <div
                      className={`text-2xl font-bold ${
                        result.net[p] > 0
                          ? 'text-green-400'
                          : result.net[p] < 0
                            ? 'text-red-400'
                            : 'text-slate-300'
                      }`}
                    >
                      {result.net[p] > 0 ? '+' : ''}
                      {result.net[p]}
                    </div>
                  </div>
                ))}
              </div>

              {result.pairwise.length === 0 ? (
                <div className="text-slate-400">Никто никому ничего не должен.</div>
              ) : (
                <div className="space-y-1">
                  {result.pairwise.map((d, i) => (
                    <div key={i} className="text-lg">
                      <span className="font-semibold">{state.players[d.from]}</span>
                      <span className="text-slate-400"> должен </span>
                      <span className="font-semibold">{state.players[d.to]}</span>
                      <span className="text-yellow-500 font-bold"> {d.amount}</span>
                      <span className="text-slate-400"> вистов</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
