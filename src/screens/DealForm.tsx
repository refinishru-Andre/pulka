import { useMemo, useState } from 'react'
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

// ============ ОСНОВНОЙ КОМПОНЕНТ ============

export function DealForm({ minBid, raspasState, onClose }: Props) {
  const game = useGameStore((s) => s.game)!
  const addDeal = useGameStore((s) => s.addDeal)

  const [dealType, setDealType] = useState<DealType>('game')

  // Состояние всех форм — поднято сюда, чтобы submit-кнопка могла быть в footer
  const initialLevel = Math.max(6, minBid) as GameLevel
  const [gamePlayer, setGamePlayer] = useState<PlayerId>('A')
  const [gameLevel, setGameLevel] = useState<GameLevel>(initialLevel)
  const [gameSuit, setGameSuit] = useState<Suit>('S')
  const [gamePlayerTricks, setGamePlayerTricks] = useState<number>(initialLevel)
  const [gameVisterTricks, setGameVisterTricks] = useState<Record<PlayerId, number>>({
    A: 0, B: 0, C: 0,
  })
  const [gameVistDecisions, setGameVistDecisions] = useState<Record<PlayerId, VistDecision>>({
    A: 'vist', B: 'vist', C: 'vist',
  })

  const [misPlayer, setMisPlayer] = useState<PlayerId>('A')
  const [misBlind, setMisBlind] = useState(false)
  const [misTricks, setMisTricks] = useState(0)

  const [raspasTricks, setRaspasTricks] = useState<Record<PlayerId, number>>({
    A: 0, B: 0, C: 0,
  })

  const [giveupPlayer, setGiveupPlayer] = useState<PlayerId>('A')
  const [giveupLevel, setGiveupLevel] = useState<GameLevel>(initialLevel)
  const [giveupSuit, setGiveupSuit] = useState<Suit>('S')

  // Валидация и построение сдачи
  const { canSubmit, buildDeal } = useMemo(() => {
    if (dealType === 'game') {
      const visters = PLAYERS.filter((p) => p !== gamePlayer)
      // Сталинград форсирует вист обоих на 6♠
      const isStalingrad = gameLevel === 6 && gameSuit === 'S'
      const effectiveDecisions = isStalingrad
        ? { ...gameVistDecisions, ...Object.fromEntries(visters.map((v) => [v, 'vist' as const])) }
        : gameVistDecisions
      // Автомат-сценарии: оба пас; или полвиста + пас
      const allPass = visters.every((v) => effectiveDecisions[v] === 'pass')
      const halfAndPass =
        visters.some((v) => effectiveDecisions[v] === 'half') &&
        visters.some((v) => effectiveDecisions[v] === 'pass') &&
        (gameLevel === 6 || gameLevel === 7)
      const isAuto = allPass || halfAndPass
      const vTotal = visters.reduce((s, v) => s + gameVisterTricks[v], 0)
      const need = 10 - gamePlayerTricks
      const ok = isAuto || vTotal === need
      const contract: Contract = { kind: 'game', level: gameLevel, suit: gameSuit }
      return {
        canSubmit: ok,
        buildDeal: (): Deal => ({
          type: 'game',
          dealer: prevClockwise(game.firstHand),
          firstHand: game.firstHand,
          player: gamePlayer,
          contract,
          // Для автомат-сценариев ставим playerTricks=level и vistersTricks=0
          playerTricks: isAuto ? gameLevel : gamePlayerTricks,
          vistersTricks: isAuto ? { A: 0, B: 0, C: 0 } : gameVisterTricks,
          vistDecisions: gameVistDecisions,
        }),
      }
    }
    if (dealType === 'misere') {
      return {
        canSubmit: true,
        buildDeal: (): Deal => ({
          type: 'misere',
          dealer: prevClockwise(game.firstHand),
          firstHand: game.firstHand,
          player: misPlayer,
          blind: misBlind,
          playerTricks: misTricks,
        }),
      }
    }
    if (dealType === 'raspas') {
      const total = raspasTricks.A + raspasTricks.B + raspasTricks.C
      return {
        canSubmit: total === 10,
        buildDeal: (): Deal => ({
          type: 'raspas',
          dealer: prevClockwise(game.firstHand),
          firstHand: game.firstHand,
          level: raspasLevelFor(raspasState),
          tricks: raspasTricks,
        }),
      }
    }
    // giveup
    return {
      canSubmit: true,
      buildDeal: (): Deal => ({
        type: 'giveup',
        dealer: prevClockwise(game.firstHand),
        firstHand: game.firstHand,
        player: giveupPlayer,
        contract: { kind: 'game', level: giveupLevel, suit: giveupSuit },
      }),
    }
  }, [
    dealType, game.firstHand, gamePlayer, gameLevel, gameSuit, gamePlayerTricks,
    gameVisterTricks, gameVistDecisions, misPlayer, misBlind, misTricks,
    raspasTricks, raspasState, giveupPlayer, giveupLevel, giveupSuit,
  ])

  const handleSubmit = () => {
    if (!canSubmit) return
    addDeal(buildDeal())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-800 rounded-2xl max-w-4xl w-full flex flex-col" style={{ maxHeight: '95vh' }}>
        {/* HEADER (не скроллится) */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">Записать сдачу</h2>
            <div className="text-xs text-slate-400">
              Первая рука: <span className="font-semibold text-yellow-500">{game.players[game.firstHand]}</span>
              <span className="ml-3">Мин: <span className="font-semibold text-slate-200">{minBid}</span></span>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-lg"
            >
              ✕
            </button>
          </div>

          {/* Выбор типа */}
          <div className="grid grid-cols-4 gap-2">
            {(['game', 'misere', 'raspas', 'giveup'] as DealType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDealType(t)}
                className={`py-2 rounded-lg font-semibold text-sm transition ${
                  dealType === t
                    ? 'bg-yellow-500 text-slate-900'
                    : 'bg-slate-900 border border-slate-700 hover:border-slate-500'
                }`}
              >
                {t === 'game' && 'Игра'}
                {t === 'misere' && 'Мизер'}
                {t === 'raspas' && `Распас ${RASPAS_TRICK_COST[raspasLevelFor(raspasState)]}/вз`}
                {t === 'giveup' && 'Без 3'}
              </button>
            ))}
          </div>
        </div>

        {/* BODY (скроллится) */}
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {dealType === 'game' && (
            <GameFormFields
              minBid={minBid}
              gamePlayer={gamePlayer}
              setGamePlayer={setGamePlayer}
              gameLevel={gameLevel}
              setGameLevel={setGameLevel}
              gameSuit={gameSuit}
              setGameSuit={setGameSuit}
              gamePlayerTricks={gamePlayerTricks}
              setGamePlayerTricks={setGamePlayerTricks}
              gameVisterTricks={gameVisterTricks}
              setGameVisterTricks={setGameVisterTricks}
              gameVistDecisions={gameVistDecisions}
              setGameVistDecisions={setGameVistDecisions}
            />
          )}
          {dealType === 'misere' && (
            <MisereFormFields
              misPlayer={misPlayer}
              setMisPlayer={setMisPlayer}
              misBlind={misBlind}
              setMisBlind={setMisBlind}
              misTricks={misTricks}
              setMisTricks={setMisTricks}
            />
          )}
          {dealType === 'raspas' && (
            <RaspasFormFields
              level={raspasLevelFor(raspasState)}
              tricks={raspasTricks}
              setTricks={setRaspasTricks}
            />
          )}
          {dealType === 'giveup' && (
            <GiveupFormFields
              minBid={minBid}
              giveupPlayer={giveupPlayer}
              setGiveupPlayer={setGiveupPlayer}
              giveupLevel={giveupLevel}
              setGiveupLevel={setGiveupLevel}
              giveupSuit={giveupSuit}
              setGiveupSuit={setGiveupSuit}
            />
          )}
        </div>

        {/* FOOTER (fixed внизу модалки) */}
        <div className="px-5 py-3 border-t border-slate-700">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold text-lg"
          >
            {canSubmit ? 'Записать' : 'Заполните все поля'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ ПОДКОМПОНЕНТЫ (только UI, состояние снаружи) ============

function GameFormFields(props: {
  minBid: number
  gamePlayer: PlayerId
  setGamePlayer: (p: PlayerId) => void
  gameLevel: GameLevel
  setGameLevel: (l: GameLevel) => void
  gameSuit: Suit
  setGameSuit: (s: Suit) => void
  gamePlayerTricks: number
  setGamePlayerTricks: (n: number) => void
  gameVisterTricks: Record<PlayerId, number>
  setGameVisterTricks: (v: Record<PlayerId, number>) => void
  gameVistDecisions: Record<PlayerId, VistDecision>
  setGameVistDecisions: (d: Record<PlayerId, VistDecision>) => void
}) {
  const game = useGameStore((s) => s.game)!
  const {
    minBid, gamePlayer, setGamePlayer, gameLevel, setGameLevel, gameSuit, setGameSuit,
    gamePlayerTricks, setGamePlayerTricks, gameVisterTricks, setGameVisterTricks,
    gameVistDecisions, setGameVistDecisions,
  } = props

  const visters = PLAYERS.filter((p) => p !== gamePlayer)
  const need = 10 - gamePlayerTricks
  const entered = visters.reduce((s, v) => s + gameVisterTricks[v], 0)
  const tricksOk = entered === need
  const availableLevels = GAME_LEVELS.filter((l) => l >= minBid)
  const isStalingrad = gameLevel === 6 && gameSuit === 'S'
  // Автомат-сценарии: без розыгрыша, играющему пуля автоматом
  const effVistDecisions = isStalingrad
    ? { ...gameVistDecisions, ...Object.fromEntries(visters.map((v) => [v, 'vist' as const])) }
    : gameVistDecisions
  const allPassAuto = visters.every((v) => effVistDecisions[v] === 'pass')
  const halfAndPassAuto =
    visters.some((v) => effVistDecisions[v] === 'half') &&
    visters.some((v) => effVistDecisions[v] === 'pass') &&
    (gameLevel === 6 || gameLevel === 7)
  const isAuto = allPassAuto || halfAndPassAuto

  return (
    <div className="space-y-3">
      {/* Играющий */}
      <div>
        <div className="text-xs text-slate-400 mb-1">Играющий</div>
        <div className="grid grid-cols-3 gap-2">
          {PLAYERS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setGamePlayer(p)
                setGameVisterTricks({ A: 0, B: 0, C: 0 })
              }}
              className={`py-2 rounded-lg font-semibold ${
                gamePlayer === p ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {game.players[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Заказ: уровень + масть в 2 ряда */}
      <div>
        <div className="text-xs text-slate-400 mb-1">Заказ</div>
        <div className="grid grid-cols-5 gap-2 mb-2">
          {availableLevels.map((l) => (
            <button
              key={l}
              onClick={() => setGameLevel(l)}
              className={`py-2 rounded-lg font-semibold ${
                gameLevel === l ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
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
              onClick={() => setGameSuit(s)}
              className={`py-2 rounded-lg font-semibold text-lg ${
                gameSuit === s ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              } ${s === 'H' || s === 'D' ? 'text-red-400' : ''}`}
            >
              {SUIT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Взятки играющего — только если требуется розыгрыш */}
      {!isAuto && (
        <div>
          <div className="text-xs text-slate-400 mb-1">
            Взял играющий {gamePlayerTricks >= gameLevel
              ? `· сыграл${gamePlayerTricks > gameLevel ? ` +${gamePlayerTricks - gameLevel}` : ''}`
              : `· недобор ${gameLevel - gamePlayerTricks}`}
          </div>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => {
                  setGamePlayerTricks(i)
                  setGameVisterTricks({ A: 0, B: 0, C: 0 })
                }}
                className={`py-2 rounded-lg font-semibold text-sm ${
                  gamePlayerTricks === i ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Вистовали */}
      <div>
        <div className="text-xs text-slate-400 mb-1">
          Как вистовали
          {isStalingrad && (
            <span className="ml-2 text-yellow-500 font-semibold">· Сталинград: оба обязаны</span>
          )}
        </div>
        <div className="space-y-1">
          {visters.map((v) => {
            const effective = isStalingrad ? 'vist' : gameVistDecisions[v]
            return (
              <div key={v} className="grid grid-cols-4 gap-2 items-center">
                <div className="font-semibold text-sm">{game.players[v]}</div>
                {(['vist', 'pass', 'half'] as VistDecision[]).map((d) => {
                  const disabled = (d === 'half' && gameLevel > 7) || (isStalingrad && d !== 'vist')
                  return (
                    <button
                      key={d}
                      onClick={() => !disabled && setGameVistDecisions({ ...gameVistDecisions, [v]: d })}
                      disabled={disabled}
                      className={`py-1.5 rounded-lg text-sm ${
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

      {/* Автомат-сценарий: показываем инфо-плашку вместо полей */}
      {isAuto && (
        <div className="px-3 py-2 bg-slate-900 rounded-lg text-sm text-slate-300">
          {allPassAuto && (
            <>Оба вистующих пасовали — игра автоматом. Играющему пуля +{gameLevel === 6 ? 2 : gameLevel === 7 ? 4 : gameLevel === 8 ? 6 : gameLevel === 9 ? 8 : 10}.</>
          )}
          {halfAndPassAuto && (
            <>Полвиста — игра без розыгрыша. Играющему пуля, полвистовому висты за {gameLevel === 6 ? 2 : 1} взятки.</>
          )}
        </div>
      )}

      {/* Взятки вистующих */}
      {!isAuto && need > 0 && (
        <div>
          <div className={`text-xs mb-1 ${tricksOk ? 'text-slate-400' : 'text-red-400'}`}>
            Взятки вистующих — распределить {need} ({entered}/{need})
          </div>
          <div className="grid grid-cols-2 gap-2">
            {visters.map((v) => (
              <div key={v} className="bg-slate-900 rounded-lg p-2">
                <div className="text-xs mb-1">{game.players[v]}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setGameVisterTricks({
                        ...gameVisterTricks,
                        [v]: Math.max(0, gameVisterTricks[v] - 1),
                      })
                    }
                    className="w-9 h-9 rounded-lg bg-slate-700 text-lg font-bold"
                  >
                    −
                  </button>
                  <div className="text-xl font-bold flex-1 text-center">{gameVisterTricks[v]}</div>
                  <button
                    onClick={() =>
                      setGameVisterTricks({
                        ...gameVisterTricks,
                        [v]: Math.min(need, gameVisterTricks[v] + 1),
                      })
                    }
                    className="w-9 h-9 rounded-lg bg-slate-700 text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MisereFormFields(props: {
  misPlayer: PlayerId
  setMisPlayer: (p: PlayerId) => void
  misBlind: boolean
  setMisBlind: (b: boolean) => void
  misTricks: number
  setMisTricks: (n: number) => void
}) {
  const game = useGameStore((s) => s.game)!
  const { misPlayer, setMisPlayer, misBlind, setMisBlind, misTricks, setMisTricks } = props

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-slate-400 mb-1">Играющий</div>
        <div className="grid grid-cols-3 gap-2">
          {PLAYERS.map((p) => (
            <button
              key={p}
              onClick={() => setMisPlayer(p)}
              className={`py-2 rounded-lg font-semibold ${
                misPlayer === p ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {game.players[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-400 mb-1">Тип</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMisBlind(false)}
            className={`py-2 rounded-lg font-semibold ${
              !misBlind ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
            }`}
          >
            Обычный мизер
          </button>
          <button
            onClick={() => setMisBlind(true)}
            className={`py-2 rounded-lg font-semibold ${
              misBlind ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
            }`}
          >
            Без прикупа
          </button>
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-400 mb-1">
          Взял (поймали) —{' '}
          {misTricks === 0 ? 'сыграл (10 в пулю)' : `поймали (${misTricks * 20} в гору)`}
        </div>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              onClick={() => setMisTricks(i)}
              className={`py-2 rounded-lg font-semibold text-sm ${
                misTricks === i ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function RaspasFormFields(props: {
  level: 1 | 2 | 3
  tricks: Record<PlayerId, number>
  setTricks: (t: Record<PlayerId, number>) => void
}) {
  const game = useGameStore((s) => s.game)!
  const { level, tricks, setTricks } = props
  const total = tricks.A + tricks.B + tricks.C
  const tricksOk = total === 10
  const cost = RASPAS_TRICK_COST[level]
  const levelLabel = level === 1 ? 'обычный' : level === 2 ? '2-й' : '8-мерный'

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 bg-slate-900 rounded-lg text-sm">
        Распас {levelLabel} · цена {cost} за взятку · амнистия минимума
      </div>

      <div>
        <div className={`text-xs mb-1 ${tricksOk ? 'text-slate-400' : 'text-red-400'}`}>
          Взятки каждого — сумма {total}/10
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PLAYERS.map((p) => (
            <div key={p} className="bg-slate-900 rounded-lg p-2">
              <div className="text-xs mb-1 truncate">{game.players[p]}</div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTricks({ ...tricks, [p]: Math.max(0, tricks[p] - 1) })}
                  className="w-9 h-9 rounded-lg bg-slate-700 text-lg font-bold"
                >
                  −
                </button>
                <div className="text-xl font-bold flex-1 text-center">{tricks[p]}</div>
                <button
                  onClick={() => setTricks({ ...tricks, [p]: Math.min(10, tricks[p] + 1) })}
                  className="w-9 h-9 rounded-lg bg-slate-700 text-lg font-bold"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GiveupFormFields(props: {
  minBid: number
  giveupPlayer: PlayerId
  setGiveupPlayer: (p: PlayerId) => void
  giveupLevel: GameLevel
  setGiveupLevel: (l: GameLevel) => void
  giveupSuit: Suit
  setGiveupSuit: (s: Suit) => void
}) {
  const game = useGameStore((s) => s.game)!
  const {
    minBid, giveupPlayer, setGiveupPlayer, giveupLevel, setGiveupLevel, giveupSuit, setGiveupSuit,
  } = props
  const availableLevels = GAME_LEVELS.filter((l) => l >= minBid)

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-slate-400 mb-1">Играющий</div>
        <div className="grid grid-cols-3 gap-2">
          {PLAYERS.map((p) => (
            <button
              key={p}
              onClick={() => setGiveupPlayer(p)}
              className={`py-2 rounded-lg font-semibold ${
                giveupPlayer === p ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {game.players[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-400 mb-1">Заказ</div>
        <div className="grid grid-cols-5 gap-2 mb-2">
          {availableLevels.map((l) => (
            <button
              key={l}
              onClick={() => setGiveupLevel(l)}
              className={`py-2 rounded-lg font-semibold ${
                giveupLevel === l ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
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
              onClick={() => setGiveupSuit(s)}
              className={`py-2 rounded-lg font-semibold text-lg ${
                giveupSuit === s ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              } ${s === 'H' || s === 'D' ? 'text-red-400' : ''}`}
            >
              {SUIT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Хелпер: предыдущий по часовой (сдающий = предыдущий от первой руки)
function prevClockwise(p: PlayerId): PlayerId {
  const idx = PLAYERS.indexOf(p)
  return PLAYERS[(idx + PLAYERS.length - 1) % PLAYERS.length]
}
