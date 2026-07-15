import { useState } from 'react'
import { useGameStore } from '../store/game'
import type { Deal, PlayerId, GameLevel, Suit, VistDecision, Contract, RaspasState } from '../engine/types'
import { PLAYERS, SUITS, SUIT_LABEL } from '../engine/types'
import { raspasLevelFor, RASPAS_TRICK_COST } from '../engine'

type DealType = 'game' | 'misere' | 'raspas' | 'giveup'

interface Props {
  minBid: number
  raspasState: RaspasState
  onClose: () => void
}

const GAME_LEVELS: GameLevel[] = [6, 7, 8, 9, 10]

export function DealForm({ minBid, raspasState, onClose }: Props) {
  const game = useGameStore((s) => s.game)!
  const addDeal = useGameStore((s) => s.addDeal)

  const [dealType, setDealType] = useState<DealType>('game')

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Записать сдачу</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 text-xl"
            >
              ✕
            </button>
          </div>

          {/* Первая рука */}
          <div className="mb-4 px-4 py-2 bg-slate-900 rounded-lg text-sm">
            <span className="text-slate-400">Первая рука: </span>
            <span className="font-semibold text-yellow-500">{game.players[game.firstHand]}</span>
            <span className="text-slate-400 ml-4">Мин. заказ: </span>
            <span className="font-semibold">{minBid}</span>
          </div>

          {/* Выбор типа */}
          <div className="grid grid-cols-4 gap-2 mb-6">
            {(['game', 'misere', 'raspas', 'giveup'] as DealType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDealType(t)}
                className={`py-4 rounded-lg font-semibold transition ${
                  dealType === t
                    ? 'bg-yellow-500 text-slate-900'
                    : 'bg-slate-900 border border-slate-700 hover:border-slate-500'
                }`}
              >
                {t === 'game' && 'Игра'}
                {t === 'misere' && 'Мизер'}
                {t === 'raspas' && `Распас (${RASPAS_TRICK_COST[raspasLevelFor(raspasState)]}/взятка)`}
                {t === 'giveup' && 'Уход без 3'}
              </button>
            ))}
          </div>

          {dealType === 'game' && (
            <GameDealForm
              minBid={minBid}
              onSubmit={(deal) => {
                addDeal(deal)
                onClose()
              }}
            />
          )}
          {dealType === 'misere' && (
            <MisereDealForm
              onSubmit={(deal) => {
                addDeal(deal)
                onClose()
              }}
            />
          )}
          {dealType === 'raspas' && (
            <RaspasDealForm
              level={raspasLevelFor(raspasState)}
              onSubmit={(deal) => {
                addDeal(deal)
                onClose()
              }}
            />
          )}
          {dealType === 'giveup' && (
            <GiveupDealForm
              minBid={minBid}
              onSubmit={(deal) => {
                addDeal(deal)
                onClose()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ============ ИГРА ============

function GameDealForm({
  minBid,
  onSubmit,
}: {
  minBid: number
  onSubmit: (deal: Deal) => void
}) {
  const game = useGameStore((s) => s.game)!
  const [player, setPlayer] = useState<PlayerId>('A')
  const [level, setLevel] = useState<GameLevel>(Math.max(6, minBid) as GameLevel)
  const [suit, setSuit] = useState<Suit>('S')
  const [playerTricks, setPlayerTricks] = useState<number>(6)
  const [visterTricks, setVisterTricks] = useState<Record<PlayerId, number>>({ A: 0, B: 0, C: 0 })
  const [vistDecisions, setVistDecisions] = useState<Record<PlayerId, VistDecision>>({
    A: 'vist',
    B: 'vist',
    C: 'vist',
  })

  const visters = PLAYERS.filter((p) => p !== player)
  const vistersTotalTricks = 10 - playerTricks
  const setEnteredTricks = visters.reduce((s, v) => s + visterTricks[v], 0)
  const tricksOk = setEnteredTricks === vistersTotalTricks

  const availableLevels = GAME_LEVELS.filter((l) => l >= minBid)

  // При смене играющего — reset взяток
  const changePlayer = (p: PlayerId) => {
    setPlayer(p)
    setVisterTricks({ A: 0, B: 0, C: 0 })
  }

  const handleSubmit = () => {
    if (!tricksOk) return
    const contract: Contract = { kind: 'game', level, suit }
    onSubmit({
      type: 'game',
      dealer: prevClockwise(game.firstHand),
      firstHand: game.firstHand,
      player,
      contract,
      playerTricks,
      vistersTricks: visterTricks,
      vistDecisions,
    })
  }

  return (
    <div className="space-y-5">
      {/* Играющий */}
      <div>
        <div className="text-sm text-slate-400 mb-2">Играющий</div>
        <div className="grid grid-cols-3 gap-2">
          {PLAYERS.map((p) => (
            <button
              key={p}
              onClick={() => changePlayer(p)}
              className={`py-3 rounded-lg font-semibold ${
                player === p ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {game.players[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Заказ */}
      <div>
        <div className="text-sm text-slate-400 mb-2">Заказ</div>
        <div className="grid grid-cols-5 gap-2 mb-2">
          {availableLevels.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`py-3 rounded-lg font-semibold ${
                level === l ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {SUITS.map((s) => (
            <button
              key={s}
              onClick={() => setSuit(s)}
              className={`py-3 rounded-lg font-semibold text-xl ${
                suit === s ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              } ${s === 'H' || s === 'D' ? 'text-red-400' : ''}`}
            >
              {SUIT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Взятки играющего */}
      <div>
        <div className="text-sm text-slate-400 mb-2">Взял играющий</div>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              onClick={() => {
                setPlayerTricks(i)
                setVisterTricks({ A: 0, B: 0, C: 0 })
              }}
              className={`py-3 rounded-lg font-semibold ${
                playerTricks === i ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Заказано {level}, {playerTricks >= level ? `сыграл${playerTricks > level ? ` +${playerTricks - level}` : ''}` : `недобор ${level - playerTricks}`}
        </div>
      </div>

      {/* Вистовали */}
      <div>
        <div className="text-sm text-slate-400 mb-2">
          Как вистовали
          {level === 6 && suit === 'S' && (
            <span className="ml-2 text-yellow-500 font-semibold">· Сталинград: оба обязаны вистовать</span>
          )}
        </div>
        <div className="space-y-2">
          {visters.map((v) => {
            const stalingrad = level === 6 && suit === 'S'
            const effective = stalingrad ? 'vist' : vistDecisions[v]
            return (
              <div key={v} className="grid grid-cols-4 gap-2 items-center">
                <div className="font-semibold">{game.players[v]}</div>
                {(['vist', 'pass', 'half'] as VistDecision[]).map((d) => {
                  const disabled = (d === 'half' && level > 7) || (stalingrad && d !== 'vist')
                  return (
                    <button
                      key={d}
                      onClick={() => !disabled && setVistDecisions({ ...vistDecisions, [v]: d })}
                      disabled={disabled}
                      className={`py-2 rounded-lg text-sm ${
                        effective === d
                          ? 'bg-yellow-500 text-slate-900'
                          : 'bg-slate-900 border border-slate-700 disabled:opacity-30'
                      }`}
                    >
                      {d === 'vist' && 'Вист'}
                      {d === 'pass' && 'Пас'}
                      {d === 'half' && 'Полвиста'}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Взятки вистующих */}
      {vistersTotalTricks > 0 && (
        <div>
          <div className="text-sm text-slate-400 mb-2">
            Взятки вистующих (нужно распределить {vistersTotalTricks})
          </div>
          <div className="grid grid-cols-2 gap-3">
            {visters.map((v) => (
              <div key={v} className="bg-slate-900 rounded-lg p-3">
                <div className="text-sm mb-2">{game.players[v]}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setVisterTricks({ ...visterTricks, [v]: Math.max(0, visterTricks[v] - 1) })
                    }
                    className="w-10 h-10 rounded-lg bg-slate-700 text-xl font-bold"
                  >
                    −
                  </button>
                  <div className="text-2xl font-bold flex-1 text-center">{visterTricks[v]}</div>
                  <button
                    onClick={() =>
                      setVisterTricks({
                        ...visterTricks,
                        [v]: Math.min(vistersTotalTricks, visterTricks[v] + 1),
                      })
                    }
                    className="w-10 h-10 rounded-lg bg-slate-700 text-xl font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className={`text-sm mt-2 ${tricksOk ? 'text-green-400' : 'text-red-400'}`}>
            Распределено {setEnteredTricks} из {vistersTotalTricks}
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!tricksOk}
        className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-lg"
      >
        Записать
      </button>
    </div>
  )
}

// ============ МИЗЕР ============

function MisereDealForm({ onSubmit }: { onSubmit: (deal: Deal) => void }) {
  const game = useGameStore((s) => s.game)!
  const [player, setPlayer] = useState<PlayerId>('A')
  const [blind, setBlind] = useState(false)
  const [playerTricks, setPlayerTricks] = useState(0)

  const handleSubmit = () => {
    onSubmit({
      type: 'misere',
      dealer: prevClockwise(game.firstHand),
      firstHand: game.firstHand,
      player,
      blind,
      playerTricks,
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm text-slate-400 mb-2">Играющий</div>
        <div className="grid grid-cols-3 gap-2">
          {PLAYERS.map((p) => (
            <button
              key={p}
              onClick={() => setPlayer(p)}
              className={`py-3 rounded-lg font-semibold ${
                player === p ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {game.players[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm text-slate-400 mb-2">Тип</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setBlind(false)}
            className={`py-3 rounded-lg font-semibold ${
              !blind ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
            }`}
          >
            Обычный мизер
          </button>
          <button
            onClick={() => setBlind(true)}
            className={`py-3 rounded-lg font-semibold ${
              blind ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
            }`}
          >
            Без прикупа
          </button>
        </div>
      </div>

      <div>
        <div className="text-sm text-slate-400 mb-2">Взял (поймали)</div>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              onClick={() => setPlayerTricks(i)}
              className={`py-3 rounded-lg font-semibold ${
                playerTricks === i ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {playerTricks === 0 ? 'Сыграл (10 в пулю)' : `Поймали (${playerTricks * 20} в гору)`}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-lg"
      >
        Записать
      </button>
    </div>
  )
}

// ============ РАСПАСЫ ============

function RaspasDealForm({
  level,
  onSubmit,
}: {
  level: 1 | 2 | 3
  onSubmit: (deal: Deal) => void
}) {
  const game = useGameStore((s) => s.game)!
  const [tricks, setTricks] = useState<Record<PlayerId, number>>({ A: 0, B: 0, C: 0 })
  const total = tricks.A + tricks.B + tricks.C
  const tricksOk = total === 10

  const cost = RASPAS_TRICK_COST[level]
  const levelLabel = level === 1 ? 'обычный' : level === 2 ? '2-й' : '8-мерный'

  const handleSubmit = () => {
    if (!tricksOk) return
    onSubmit({
      type: 'raspas',
      dealer: prevClockwise(game.firstHand),
      firstHand: game.firstHand,
      level,
      tricks,
    })
  }

  return (
    <div className="space-y-5">
      <div className="px-4 py-3 bg-slate-900 rounded-lg text-sm">
        Распас {levelLabel}, цена {cost} за взятку. Сумма взяток = 10, амнистия минимума.
      </div>

      <div>
        <div className="text-sm text-slate-400 mb-2">Взятки каждого игрока</div>
        <div className="grid grid-cols-3 gap-3">
          {PLAYERS.map((p) => (
            <div key={p} className="bg-slate-900 rounded-lg p-3">
              <div className="text-sm mb-2 truncate">{game.players[p]}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTricks({ ...tricks, [p]: Math.max(0, tricks[p] - 1) })}
                  className="w-10 h-10 rounded-lg bg-slate-700 text-xl font-bold"
                >
                  −
                </button>
                <div className="text-2xl font-bold flex-1 text-center">{tricks[p]}</div>
                <button
                  onClick={() => setTricks({ ...tricks, [p]: Math.min(10, tricks[p] + 1) })}
                  className="w-10 h-10 rounded-lg bg-slate-700 text-xl font-bold"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className={`text-sm mt-2 ${tricksOk ? 'text-green-400' : 'text-red-400'}`}>
          Сумма: {total} / 10
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!tricksOk}
        className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-lg"
      >
        Записать
      </button>
    </div>
  )
}

// ============ УХОД БЕЗ 3 ============

function GiveupDealForm({ minBid, onSubmit }: { minBid: number; onSubmit: (deal: Deal) => void }) {
  const game = useGameStore((s) => s.game)!
  const [player, setPlayer] = useState<PlayerId>('A')
  const [level, setLevel] = useState<GameLevel>(Math.max(6, minBid) as GameLevel)
  const [suit, setSuit] = useState<Suit>('S')

  const availableLevels = GAME_LEVELS.filter((l) => l >= minBid)

  const handleSubmit = () => {
    const contract: Contract = { kind: 'game', level, suit }
    onSubmit({
      type: 'giveup',
      dealer: prevClockwise(game.firstHand),
      firstHand: game.firstHand,
      player,
      contract,
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm text-slate-400 mb-2">Играющий</div>
        <div className="grid grid-cols-3 gap-2">
          {PLAYERS.map((p) => (
            <button
              key={p}
              onClick={() => setPlayer(p)}
              className={`py-3 rounded-lg font-semibold ${
                player === p ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {game.players[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm text-slate-400 mb-2">Заказ</div>
        <div className="grid grid-cols-5 gap-2 mb-2">
          {availableLevels.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`py-3 rounded-lg font-semibold ${
                level === l ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {SUITS.map((s) => (
            <button
              key={s}
              onClick={() => setSuit(s)}
              className={`py-3 rounded-lg font-semibold text-xl ${
                suit === s ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              } ${s === 'H' || s === 'D' ? 'text-red-400' : ''}`}
            >
              {SUIT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-lg"
      >
        Записать
      </button>
    </div>
  )
}

// Хелпер: предыдущий по часовой (сдающий = предыдущий от первой руки)
function prevClockwise(p: PlayerId): PlayerId {
  const idx = PLAYERS.indexOf(p)
  return PLAYERS[(idx + PLAYERS.length - 1) % PLAYERS.length]
}
