// КАЛЬКУЛЯТОР ПУЛИ
//
// Партию писали на бумаге — вбиваем готовые числа и получаем «кто кому сколько
// должен». Без сдач и без истории.
//
// Конвенции здесь НЕ нужны, и это не упрощение: правила игры влияют на расчёт
// КАЖДОЙ СДАЧИ, а когда пулька уже написана, итоговая арифметика одна для всех
// школ. Единственное, что нужно знать, — курс перевода в висты.

import { useEffect, useMemo, useState } from 'react'
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

// Поле ввода числа. Специально светлее и с рамкой: в остальном приложении
// тёмные плашки — это кнопки, и поле ввода принимали за кнопку.
//
// ВАЖНО: объявлено НА УРОВНЕ ФАЙЛА, а не внутри Calculator. Компонент, созданный
// внутри другого компонента, React считает новым типом на каждой перерисовке и
// пересоздаёт — поле теряло бы фокус после первой же введённой цифры.
function NumField({
  value,
  onChange,
  width = 'w-full',
}: {
  value: string
  onChange: (v: string) => void
  width?: string
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      className={`${width} px-3 py-2 bg-slate-700 border-2 border-slate-500 rounded-lg text-center text-lg font-bold text-white placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-yellow-500 focus:bg-slate-600`}
    />
  )
}

// Введённое храним на устройстве: закрыл страницу случайно — числа не пропали.
const STORE_KEY = 'pulka-calc-v1'

interface Saved {
  seatCount: 3 | 4
  rateId: string
  names: Record<PlayerId, string>
  pool: Record<PlayerId, string>
  mount: Record<PlayerId, string>
  whists: Record<string, string>
}

function loadSaved(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function Calculator({ onBack }: Props) {
  const saved = useMemo(loadSaved, [])
  const [seatCount, setSeatCount] = useState<3 | 4>(saved.seatCount ?? 3)
  const [rateId, setRateId] = useState<string>(saved.rateId ?? RATES[0].id)
  const empty = { A: '', B: '', C: '', D: '' }
  const [names, setNames] = useState<Record<PlayerId, string>>(saved.names ?? empty)
  const [pool, setPool] = useState<Record<PlayerId, string>>(saved.pool ?? empty)
  const [mount, setMount] = useState<Record<PlayerId, string>>(saved.mount ?? empty)
  // whists[from][to] — сколько from записал на to
  const [whists, setWhists] = useState<Record<string, string>>(saved.whists ?? {})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ seatCount, rateId, names, pool, mount, whists }),
    )
  }, [seatCount, rateId, names, pool, mount, whists])

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

  // Итог одним куском текста — чтобы отдать людям за соседним столом
  const resultText = (): string => {
    const lines: string[] = ['Пулька — итог']
    seats.forEach((p, i) => {
      lines.push(
        `${nameOf(p, i)}: пуля ${num(pool[p])}, гора ${num(mount[p])}, итог ${
          result.net[p] > 0 ? '+' : ''
        }${result.net[p]}`,
      )
    })
    lines.push('')
    if (result.pairwise.length === 0) lines.push('Никто никому ничего не должен')
    else
      result.pairwise.forEach((d) =>
        lines.push(`${state.players[d.from]} должен ${state.players[d.to]} ${d.amount} вистов`),
      )
    lines.push('')
    lines.push(`Курс: ${rate.name} (${rate.hint})`)
    return lines.join(String.fromCharCode(10))
  }

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(resultText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const clearAll = () => {
    setNames(empty)
    setPool(empty)
    setMount(empty)
    setWhists({})
  }
  const anyInput =
    seats.some((s) => pool[s].trim() || mount[s].trim()) ||
    Object.values(whists).some((v) => v.trim())

  const cols = seatCount === 4 ? 'grid-cols-4' : 'grid-cols-3'

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Калькулятор пули</h1>
            <p className="text-slate-400 mt-1">
              Пульку писали на бумаге — впишите числа, посчитаем итог
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

          {/* Таблица как в пульке: столбец на игрока, сверху вниз гора, пуля, висты */}
          <div className="overflow-x-auto">
            <div className="text-sm text-slate-300 mb-3">
              Впишите числа из пульки. Пустое поле — ноль.
            </div>
            <table className="w-full border-separate border-spacing-2">
              <thead>
                <tr>
                  <th className="w-28" />
                  {seats.map((p, idx) => (
                    <th key={p} className="min-w-32">
                      <input
                        type="text"
                        value={names[p]}
                        onChange={(e) => setNames({ ...names, [p]: e.target.value })}
                        placeholder={`Игрок ${idx + 1}`}
                        className="w-full px-3 py-2 bg-slate-700 border-2 border-slate-500 rounded-lg text-center text-base font-bold text-white placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-yellow-500 focus:bg-slate-600"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-right text-sm text-slate-400 pr-1">Гора</td>
                  {seats.map((p) => (
                    <td key={p}>
                      <NumField value={mount[p]} onChange={(v) => setMount({ ...mount, [p]: v })} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="text-right text-sm text-slate-400 pr-1">Пуля</td>
                  {seats.map((p) => (
                    <td key={p}>
                      <NumField value={pool[p]} onChange={(v) => setPool({ ...pool, [p]: v })} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td
                    colSpan={seats.length + 1}
                    className="pt-3 text-sm text-slate-300 border-t border-slate-700"
                  >
                    Висты — сколько записано на игрока в каждом столбце
                  </td>
                </tr>
                {seats.map((target, i) => (
                  <tr key={target}>
                    <td className="text-right text-sm text-slate-400 pr-1 truncate">
                      на {nameOf(target, i)}
                    </td>
                    {seats.map((from) =>
                      from === target ? (
                        <td key={from} className="text-center text-slate-600 text-xl">
                          —
                        </td>
                      ) : (
                        <td key={from}>
                          <NumField
                            value={whists[whistKey(from, target)] ?? ''}
                            onChange={(v) =>
                              setWhists({ ...whists, [whistKey(from, target)]: v })
                            }
                          />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Итог */}
        <div className="bg-slate-800 rounded-2xl p-5 mt-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-xl font-bold">Итог</h2>
            {anyInput && (
              <div className="flex gap-2">
                <button
                  onClick={copyResult}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold"
                  title="Скопировать итог текстом — можно отправить в переписке"
                >
                  {copied ? '✓ Скопировано' : '📋 Скопировать итог'}
                </button>
                <button
                  onClick={clearAll}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
                  title="Очистить все поля"
                >
                  Очистить
                </button>
              </div>
            )}
          </div>
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
