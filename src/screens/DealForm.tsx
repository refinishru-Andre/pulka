import { useMemo, useState } from 'react'
import { useGameStore } from '../store/game'
import type { Deal, PlayerId, GameLevel, VistDecision, Contract, RaspasState } from '../engine/types'
import { seatsOf } from '../engine/types'
import { raspasLevelFor, raspasCostFor, prevClockwise, rulesOf, halfVistTricks } from '../engine'

type DealType = 'game' | 'misere' | 'raspas' | 'giveup' | 'adjust'
type AdjustTarget = 'mount' | 'pool' | 'whists'

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

  // Кто за столом и по каким правилам считаем — берём из партии
  const seats = seatsOf(game)
  const rules = rulesOf(game)
  const dealer = prevClockwise(game.firstHand, seats)
  const [dealType, setDealType] = useState<DealType>('game')

  // Состояние всех форм — поднято сюда, чтобы submit-кнопка могла быть в footer
  const initialLevel = Math.max(6, minBid) as GameLevel
  const [gamePlayer, setGamePlayer] = useState<PlayerId>(game.firstHand)
  // Вчетвером сдающий может вступить вистующим при торговле «пас — полвиста — пас»
  const [dealerVists, setDealerVists] = useState(false)
  // «Быстрые взятки» в прикупе для премии сдатчику: Т/КД = 1, ТК = 2, два туза = 3
  const [prikupFast, setPrikupFast] = useState(0)
  const [gameLevel, setGameLevel] = useState<GameLevel>(initialLevel)
  // Масть не спрашиваем и не храним — она не влияет ни на одну формулу.
  // Сталинград (6♠, оба обязаны вистовать) тоже не отмечаем: мы записываем ИТОГ
  // сдачи, а не торговлю. Раз оба обязаны — оба и вистовали, так и ставим руками.
  // Отдельного признака для этого не нужно (решение Андрея, 2026-08-26).
  const [gamePlayerTricks, setGamePlayerTricks] = useState<number>(initialLevel)
  const [gameVisterTricks, setGameVisterTricks] = useState<Record<PlayerId, number>>({
    A: 0, B: 0, C: 0, D: 0,
  })
  const [gameVistDecisions, setGameVistDecisions] = useState<Record<PlayerId, VistDecision>>({
    A: 'vist', B: 'vist', C: 'vist', D: 'vist',
  })

  const [misPlayer, setMisPlayer] = useState<PlayerId>(game.firstHand)
  const [misTricks, setMisTricks] = useState(0)

  const [raspasTricks, setRaspasTricks] = useState<Record<PlayerId, number>>({
    A: 0, B: 0, C: 0, D: 0,
  })

  // Ручная корректировка: штраф судьи, поправка ошибки, любая договорённость,
  // которую движок не знает. Величина ничем не ограничена.
  const [adjPlayer, setAdjPlayer] = useState<PlayerId>(game.firstHand)
  const [adjTarget, setAdjTarget] = useState<AdjustTarget>('mount')
  const [adjTo, setAdjTo] = useState<PlayerId>(prevClockwise(game.firstHand, seats))
  const [adjAmount, setAdjAmount] = useState('')
  const [adjNote, setAdjNote] = useState('')

  const [giveupPlayer, setGiveupPlayer] = useState<PlayerId>(game.firstHand)
  const [giveupLevel, setGiveupLevel] = useState<GameLevel>(initialLevel)

  // Валидация и построение сдачи
  const { canSubmit, buildDeal } = useMemo(() => {
    if (dealType === 'game') {
      const visters = vistersFor(seats, dealer, gamePlayer, dealerVists)
      // Автомат-сценарии: все вистующие пас; или полвиста + пас
      const allPass = visters.every((v) => gameVistDecisions[v] === 'pass')
      const halfAndPass =
        visters.some((v) => gameVistDecisions[v] === 'half') &&
        visters.some((v) => gameVistDecisions[v] === 'pass') &&
        rules.halfVistLevels.includes(gameLevel)
      const isAuto = allPass || halfAndPass
      const vTotal = visters.reduce((sum, v) => sum + gameVisterTricks[v], 0)
      const need = 10 - gamePlayerTricks
      const ok = isAuto || vTotal === need
      const contract: Contract = { kind: 'game', level: gameLevel }
      return {
        canSubmit: ok,
        buildDeal: (): Deal => ({
          type: 'game',
          dealer,
          firstHand: game.firstHand,
          player: gamePlayer,
          contract,
          // Для автомат-сценариев ставим playerTricks=level и vistersTricks=0
          playerTricks: isAuto ? gameLevel : gamePlayerTricks,
          // Пишем только участников сдачи, а не все четыре места
          vistersTricks: pickBy(visters, (v) => (isAuto ? 0 : gameVisterTricks[v])),
          vistDecisions: pickBy(visters, (v) => gameVistDecisions[v]),
          ...(rules.prikupBonus && prikupFast > 0 ? { prikupFastTricks: prikupFast } : {}),
        }),
      }
    }
    if (dealType === 'misere') {
      return {
        canSubmit: true,
        buildDeal: (): Deal => ({
          type: 'misere',
          dealer,
          firstHand: game.firstHand,
          player: misPlayer,
          blind: false, // тип мизера не влияет на расчёт
          playerTricks: misTricks,
        }),
      }
    }
    if (dealType === 'raspas') {
      // Вчетвером сдающий тоже берёт взятки — он ходит картами прикупа
      const players = raspasPlayers(seats, dealer, rules.dealerPlaysRaspasPrikup)
      const total = players.reduce((sum, p) => sum + raspasTricks[p], 0)
      return {
        canSubmit: total === 10,
        buildDeal: (): Deal => ({
          type: 'raspas',
          dealer,
          firstHand: game.firstHand,
          level: raspasLevelFor(raspasState),
          tricks: pickBy(players, (p) => raspasTricks[p]),
        }),
      }
    }
    if (dealType === 'adjust') {
      const amount = Number(adjAmount.replace(',', '.'))
      const valid =
        Number.isFinite(amount) &&
        amount !== 0 &&
        adjNote.trim().length > 0 &&
        (adjTarget !== 'whists' || adjTo !== adjPlayer)
      return {
        canSubmit: valid,
        buildDeal: (): Deal => ({
          type: 'adjust',
          dealer,
          firstHand: game.firstHand,
          player: adjPlayer,
          target: adjTarget,
          ...(adjTarget === 'whists' ? { to: adjTo } : {}),
          amount,
          note: adjNote.trim(),
        }),
      }
    }
    // giveup
    return {
      canSubmit: true,
      buildDeal: (): Deal => ({
        type: 'giveup',
        dealer,
        firstHand: game.firstHand,
        player: giveupPlayer,
        contract: { kind: 'game', level: giveupLevel },
      }),
    }
  }, [
    dealType, game.firstHand, seats, dealer, rules, dealerVists, prikupFast,
    gamePlayer, gameLevel, gamePlayerTricks,
    gameVisterTricks, gameVistDecisions, misPlayer, misTricks,
    adjPlayer, adjTarget, adjTo, adjAmount, adjNote,
    raspasTricks, raspasState, giveupPlayer, giveupLevel,
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
          <div className={`grid gap-2 ${rules.allowGiveup ? 'grid-cols-5' : 'grid-cols-4'}`}>
            {(rules.allowGiveup
              ? (['game', 'misere', 'raspas', 'giveup', 'adjust'] as DealType[])
              : (['game', 'misere', 'raspas', 'adjust'] as DealType[])
            ).map((t) => (
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
                {t === 'raspas' && `Распас ${raspasCostFor(raspasState, rules)}/вз`}
                {t === 'giveup' && 'Без 3'}
                {t === 'adjust' && '✏️ Правка'}
              </button>
            ))}
          </div>
        </div>

        {/* BODY (скроллится) */}
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {dealType === 'game' && (
            <GameFormFields
              minBid={minBid}
              dealerVists={dealerVists}
              setDealerVists={setDealerVists}
              prikupFast={prikupFast}
              setPrikupFast={setPrikupFast}
              gamePlayer={gamePlayer}
              setGamePlayer={setGamePlayer}
              gameLevel={gameLevel}
              setGameLevel={setGameLevel}
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
            />
          )}
          {dealType === 'adjust' && (
            <AdjustFormFields
              adjPlayer={adjPlayer}
              setAdjPlayer={setAdjPlayer}
              adjTarget={adjTarget}
              setAdjTarget={setAdjTarget}
              adjTo={adjTo}
              setAdjTo={setAdjTo}
              adjAmount={adjAmount}
              setAdjAmount={setAdjAmount}
              adjNote={adjNote}
              setAdjNote={setAdjNote}
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
  dealerVists: boolean
  setDealerVists: (v: boolean) => void
  prikupFast: number
  setPrikupFast: (n: number) => void
  gamePlayer: PlayerId
  setGamePlayer: (p: PlayerId) => void
  gameLevel: GameLevel
  setGameLevel: (l: GameLevel) => void
  gamePlayerTricks: number
  setGamePlayerTricks: (n: number) => void
  gameVisterTricks: Record<PlayerId, number>
  setGameVisterTricks: (v: Record<PlayerId, number>) => void
  gameVistDecisions: Record<PlayerId, VistDecision>
  setGameVistDecisions: (d: Record<PlayerId, VistDecision>) => void
}) {
  const game = useGameStore((s) => s.game)!
  const {
    minBid, dealerVists, setDealerVists, prikupFast, setPrikupFast,
    gamePlayer, setGamePlayer, gameLevel, setGameLevel,
    gamePlayerTricks, setGamePlayerTricks, gameVisterTricks, setGameVisterTricks,
    gameVistDecisions, setGameVistDecisions,
  } = props

  const seats = seatsOf(game)
  const rules = rulesOf(game)
  const dealer = prevClockwise(game.firstHand, seats)
  const fourHanded = seats.length === 4
  const canPlay = seats.filter((p) => !fourHanded || p !== dealer)
  const visters = vistersFor(seats, dealer, gamePlayer, dealerVists)
  const need = 10 - gamePlayerTricks
  const entered = visters.reduce((s, v) => s + gameVisterTricks[v], 0)
  const tricksOk = entered === need
  const availableLevels = GAME_LEVELS.filter((l) => l >= minBid)
  // Автомат-сценарии: без розыгрыша, играющему пуля автоматом
  const allPassAuto = visters.every((v) => gameVistDecisions[v] === 'pass')
  const halfAndPassAuto =
    visters.some((v) => gameVistDecisions[v] === 'half') &&
    visters.some((v) => gameVistDecisions[v] === 'pass') &&
    rules.halfVistLevels.includes(gameLevel)
  const isAuto = allPassAuto || halfAndPassAuto

  return (
    <div className="space-y-3">
      {/* Играющий */}
      <div>
        <div className="text-xs text-slate-400 mb-1">
          Играющий
          {fourHanded && (
            <span className="ml-2 text-slate-500">
              сдаёт {game.players[dealer]} — в розыгрыше не участвует
            </span>
          )}
        </div>
        <div className={`grid gap-2 ${canPlay.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {canPlay.map((p) => (
            <button
              key={p}
              onClick={() => {
                setGamePlayer(p)
                setGameVisterTricks({ A: 0, B: 0, C: 0, D: 0 })
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

      {/* Заказ. Масть не спрашиваем — на расчёт влияет только уровень 6–10. */}
      <div>
        <div className="text-xs text-slate-400 mb-1">Заказ</div>
        <div className="grid grid-cols-5 gap-2">
          {availableLevels.map((l) => (
            <button
              key={l}
              onClick={() => setGameLevel(l)}
              className={`py-3 rounded-lg font-bold text-lg ${
                gameLevel === l ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {l}
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
                  setGameVisterTricks({ A: 0, B: 0, C: 0, D: 0 })
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

      {/* Сдающий вступает вистующим — торговля «пас — полвиста — пас» */}
      {fourHanded && rules.dealerMayVist && (
        <button
          onClick={() => setDealerVists(!dealerVists)}
          className={`w-full py-2 rounded-lg text-sm font-semibold ${
            dealerVists
              ? 'bg-yellow-500 text-slate-900'
              : 'bg-slate-900 border border-slate-700 text-slate-300'
          }`}
        >
          {dealerVists ? '✓ ' : ''}
          Вистует и сдающий ({game.players[dealer]})
        </button>
      )}

      {/* Премия сдатчику за быстрые взятки в прикупе */}
      {rules.prikupBonus && (
        <div>
          <div className="text-xs text-slate-400 mb-1">
            Быстрые взятки в прикупе
            <span className="ml-2 text-slate-500">
              Т или КД одной масти — 1, ТК одной масти — 2, два туза — 3
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setPrikupFast(n)}
                className={`py-2 rounded-lg font-semibold ${
                  prikupFast === n
                    ? 'bg-yellow-500 text-slate-900'
                    : 'bg-slate-900 border border-slate-700'
                }`}
              >
                {n === 0 ? 'нет' : n}
              </button>
            ))}
          </div>
          {prikupFast > 0 && (
            <div className="text-xs text-slate-500 mt-1">
              {fourHanded
                ? `${game.players[dealer]} пишет ${prikupFast * rules.vistPerTrick[gameLevel]} вистов на играющего`
                : `каждый соперник пишет ${(prikupFast * rules.vistPerTrick[gameLevel]) / 2} вистов на играющего`}
            </div>
          )}
        </div>
      )}

      {/* Вистовали */}
      <div>
        <div className="text-xs text-slate-400 mb-1">Как вистовали</div>
        <div className="space-y-1">
          {visters.map((v) => {
            const effective = gameVistDecisions[v]
            return (
              <div key={v} className="grid grid-cols-4 gap-2 items-center">
                <div className="font-semibold text-sm">{game.players[v]}</div>
                {(['vist', 'pass', 'half'] as VistDecision[]).map((d) => {
                  const disabled = d === 'half' && !rules.halfVistLevels.includes(gameLevel)
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
            <>
              Все вистующие пасовали — игра автоматом. Играющему пуля +
              {rules.poolCost[gameLevel]}.
            </>
          )}
          {halfAndPassAuto && (
            <>
              Полвиста — игра без розыгрыша. Играющему пуля, полвистовому висты за{' '}
              {halfVistTricks(rules, gameLevel)} взятки.
            </>
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
  misTricks: number
  setMisTricks: (n: number) => void
}) {
  const game = useGameStore((s) => s.game)!
  const { misPlayer, setMisPlayer, misTricks, setMisTricks } = props
  const seats = seatsOf(game)
  const rules = rulesOf(game)
  const dealer = prevClockwise(game.firstHand, seats)
  const canPlay = seats.filter((p) => seats.length < 4 || p !== dealer)

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-slate-400 mb-1">Играющий</div>
        <div className={`grid gap-2 ${canPlay.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {canPlay.map((p) => (
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
        <div className="text-xs text-slate-400 mb-1">
          Взял (поймали) —{' '}
          {misTricks === 0
            ? `сыграл (${rules.miserePoolCost} в пулю)`
            : `поймали (${misTricks * rules.misereTrickPenalty} в гору)`}
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
  const seats = seatsOf(game)
  const rules = rulesOf(game)
  const dealer = prevClockwise(game.firstHand, seats)
  const players = raspasPlayers(seats, dealer, rules.dealerPlaysRaspasPrikup)
  const total = players.reduce((sum, p) => sum + tricks[p], 0)
  const tricksOk = total === 10
  const cost = rules.raspasCostLadder[Math.min(level - 1, rules.raspasCostLadder.length - 1)]
  const levelLabel = level === 1 ? 'обычный' : level === 2 ? '2-й' : '8-мерный'

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 bg-slate-900 rounded-lg text-sm">
        Распас {levelLabel} · цена {cost} за взятку ·{' '}
        {rules.raspasWriteEveryTrick ? 'в гору за каждую взятку' : 'амнистия минимума'}
        {players.length === 4 && (
          <div className="text-xs text-slate-400 mt-1">
            Сдаёт {game.players[dealer]} — ходит картами прикупа и пишет взятки наравне со всеми
          </div>
        )}
      </div>

      <div>
        <div className={`text-xs mb-1 ${tricksOk ? 'text-slate-400' : 'text-red-400'}`}>
          Взятки каждого — сумма {total}/10
        </div>
        <div className={`grid gap-2 ${players.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {players.map((p) => (
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
}) {
  const game = useGameStore((s) => s.game)!
  const {
    minBid, giveupPlayer, setGiveupPlayer, giveupLevel, setGiveupLevel,
  } = props
  const availableLevels = GAME_LEVELS.filter((l) => l >= minBid)
  const seats = seatsOf(game)
  const dealer = prevClockwise(game.firstHand, seats)
  const canPlay = seats.filter((p) => seats.length < 4 || p !== dealer)

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-slate-400 mb-1">Играющий</div>
        <div className={`grid gap-2 ${canPlay.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {canPlay.map((p) => (
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
        <div className="grid grid-cols-5 gap-2">
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

      </div>
    </div>
  )
}

// Кто вистует в этой сдаче. Втроём — все, кроме играющего. Вчетвером сдающий вне
// розыгрыша, но может вступить сам (торговля «пас — полвиста — пас»).
function vistersFor(
  seats: PlayerId[],
  dealer: PlayerId,
  player: PlayerId,
  dealerVists: boolean,
): PlayerId[] {
  return seats.filter((p) => {
    if (p === player) return false
    if (seats.length < 4) return true
    return p !== dealer || dealerVists
  })
}

// Кто пишет взятки на распасе. Вчетвером сдающий участвует: он открывает прикуп
// по карте и делает первые два хода.
function raspasPlayers(seats: PlayerId[], dealer: PlayerId, dealerPlays: boolean): PlayerId[] {
  if (seats.length < 4 || dealerPlays) return seats
  return seats.filter((p) => p !== dealer)
}

// Собрать запись только по участникам сдачи, без пустых мест
function pickBy<T>(keys: PlayerId[], value: (p: PlayerId) => T): Partial<Record<PlayerId, T>> {
  const out: Partial<Record<PlayerId, T>> = {}
  keys.forEach((k) => (out[k] = value(k)))
  return out
}

// ============================================================================
// РУЧНАЯ КОРРЕКТИРОВКА
//
// Отдельная строка в истории: кому, куда, сколько и почему. Нужна там, где
// движок не знает правила — штраф судьи за нарушение, поправка ошибки записи,
// договорённость за столом. Величина ничем не ограничена и может быть
// отрицательной. Причину требуем обязательно: без неё через месяц никто не
// вспомнит, откуда взялась цифра.
// ============================================================================

function AdjustFormFields(props: {
  adjPlayer: PlayerId
  setAdjPlayer: (p: PlayerId) => void
  adjTarget: AdjustTarget
  setAdjTarget: (t: AdjustTarget) => void
  adjTo: PlayerId
  setAdjTo: (p: PlayerId) => void
  adjAmount: string
  setAdjAmount: (v: string) => void
  adjNote: string
  setAdjNote: (v: string) => void
}) {
  const game = useGameStore((s) => s.game)!
  const seats = seatsOf(game)
  const {
    adjPlayer, setAdjPlayer, adjTarget, setAdjTarget, adjTo, setAdjTo,
    adjAmount, setAdjAmount, adjNote, setAdjNote,
  } = props

  const amount = Number(adjAmount.replace(',', '.'))
  const amountOk = Number.isFinite(amount) && amount !== 0
  const cols = seats.length === 4 ? 'grid-cols-4' : 'grid-cols-3'

  const targetLabel: Record<AdjustTarget, string> = {
    mount: 'Гора',
    pool: 'Пуля',
    whists: 'Висты',
  }

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 bg-slate-900 rounded-lg text-sm text-slate-300">
        Запись «руками» — движок её не считает, а пишет как сказано. Для штрафов
        судьи, поправок и договорённостей.
      </div>

      <div>
        <div className="text-xs text-slate-400 mb-1">Кому</div>
        <div className={`grid gap-2 ${cols}`}>
          {seats.map((p) => (
            <button
              key={p}
              onClick={() => setAdjPlayer(p)}
              className={`py-2 rounded-lg font-semibold truncate ${
                adjPlayer === p ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {game.players[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-400 mb-1">Куда</div>
        <div className="grid grid-cols-3 gap-2">
          {(['mount', 'pool', 'whists'] as AdjustTarget[]).map((t) => (
            <button
              key={t}
              onClick={() => setAdjTarget(t)}
              className={`py-2 rounded-lg font-semibold ${
                adjTarget === t ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 border border-slate-700'
              }`}
            >
              {targetLabel[t]}
            </button>
          ))}
        </div>
      </div>

      {adjTarget === 'whists' && (
        <div>
          <div className="text-xs text-slate-400 mb-1">На кого записать</div>
          <div className={`grid gap-2 ${cols}`}>
            {seats.map((p) => (
              <button
                key={p}
                onClick={() => setAdjTo(p)}
                disabled={p === adjPlayer}
                className={`py-2 rounded-lg font-semibold truncate ${
                  adjTo === p
                    ? 'bg-yellow-500 text-slate-900'
                    : 'bg-slate-900 border border-slate-700 disabled:opacity-30'
                }`}
              >
                {game.players[p]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-slate-400 mb-1">
          Сколько <span className="text-slate-500">— минус списывает</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={adjAmount}
            onChange={(e) => setAdjAmount(e.target.value)}
            placeholder="например 10 или −6"
            className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-xl font-bold focus:outline-none focus:border-yellow-500"
          />
          <button
            onClick={() => setAdjAmount(amountOk ? String(-amount) : '-')}
            className="px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 font-bold text-lg"
            title="Сменить знак"
          >
            ±
          </button>
        </div>
        {amountOk && (
          <div className="text-xs text-slate-400 mt-1">
            {game.players[adjPlayer]}: {targetLabel[adjTarget].toLowerCase()}{' '}
            {amount > 0 ? '+' : ''}
            {amount}
            {adjTarget === 'whists' && adjTo !== adjPlayer && ` на ${game.players[adjTo]}`}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs text-slate-400 mb-1">Причина — обязательно</div>
        <input
          type="text"
          value={adjNote}
          onChange={(e) => setAdjNote(e.target.value)}
          placeholder="ход вне очереди / ошибка записи / договорились"
          className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-yellow-500"
        />
      </div>
    </div>
  )
}
