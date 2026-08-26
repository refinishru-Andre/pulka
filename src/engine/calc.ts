// Движок расчёта одной сдачи → изменения в пуле/горе/вистах
//
// Все цены и правила берутся из конвенций партии (conventions.ts), а не из
// глобальных констант. Партия без конвенций считается пресетом «Дом» — это в
// точности прежнее поведение, что проверяется сверкой reference.test.ts.

import type { Deal, DealDelta, PlayerId, GameLevel, Seats } from './types'
import { PLAYERS, zeroScores } from './types'
import type { Rules } from './conventions'
import { HOME_RULES, ladderAt, halfVistTricks } from './conventions'

function emptyDelta(): DealDelta {
  return {
    pool: zeroScores(),
    mount: zeroScores(),
    whists: [],
  }
}

// Кто вистовал в этой сдаче — обычно двое.
//
// Втроём это все, кроме играющего. Вчетвером сдающий вне розыгрыша: он раздал
// 10-10-10 и прикуп, себе карт не оставил. Но есть исключение — при торговле
// «пас — полвиста — пас» вистовать может сам сдатчик (кодекс ФСПР 6.6). Тогда
// форма записывает его решение, и по наличию записи мы его и опознаём.
function visters(
  deal: { player: PlayerId; dealer: PlayerId; vistDecisions: Partial<Record<PlayerId, unknown>> },
  seats: Seats,
): PlayerId[] {
  return seats.filter((p) => {
    if (p === deal.player) return false
    if (seats.length < 4) return true
    // Вчетвером сдающий участвует, только если за ним записано решение
    return p !== deal.dealer || deal.vistDecisions[p] !== undefined
  })
}

// Расчёт «Игра» (сыграна или ремиз)
function calcGame(deal: Extract<Deal, { type: 'game' }>, seats: Seats, rules: Rules): DealDelta {
  const delta = emptyDelta()
  if (deal.contract.kind !== 'game') return delta // защита от неправильного заказа
  const level = deal.contract.level
  const suit = deal.contract.suit
  const player = deal.player
  const vs = visters(deal, seats)

  const vTricksTotal = vs.reduce((sum, v) => sum + (deal.vistersTricks[v] ?? 0), 0)
  const playerTricks = deal.playerTricks

  // СТАРЫЕ СДАЧИ. Признак 6♠ (Сталинград) больше не записывается: мы храним итог
  // сдачи, а не торговлю, и раз при Сталинграде оба обязаны вистовать — так и
  // отмечается руками. Но в уже сыгранных партиях метка `suit: 'S'` осталась, а
  // форма тогда сохраняла сырые решения (можно было выбрать «пас», потом нажать
  // «Сталинград» — в записи оставался «пас», а движок подменял его на «вист»).
  // Убрать подмену = пересчитать те партии по-другому, чего делать нельзя.
  // Поэтому она живёт здесь ровно для сдач с меткой. Новые сдачи метки не несут.
  const isStalingrad = level === 6 && suit === 'S'
  const effectiveDecisions = isStalingrad
    ? { ...deal.vistDecisions, ...Object.fromEntries(vs.map((v) => [v, 'vist' as const])) }
    : deal.vistDecisions

  // СПЕЦ-СЛУЧАЙ 1: все вистующие пасовали → игра автомат, без розыгрыша
  const allPassed = vs.every((v) => effectiveDecisions[v] === 'pass')
  if (allPassed) {
    delta.pool[player] += rules.poolCost[level]
    return delta
  }

  // СПЕЦ-СЛУЧАЙ 2: один пас + один полвиста → автомат.
  // Играющему пуля, полвистовому — половина нормы пары в вистах.
  const halfPlayer = vs.find((v) => effectiveDecisions[v] === 'half')
  const passPlayerForHalf = vs.find((v) => effectiveDecisions[v] === 'pass')
  if (halfPlayer && passPlayerForHalf && rules.halfVistLevels.includes(level)) {
    delta.pool[player] += rules.poolCost[level]
    const tricks = halfVistTricks(rules, level)
    if (tricks > 0) {
      delta.whists.push({
        from: halfPlayer,
        to: player,
        amount: tricks * rules.vistPerTrick[level],
      })
    }
    return delta
  }

  // Кто вистовал полноценно (не пас, включая полвиста)
  const activeVisters = vs.filter((v) => effectiveDecisions[v] !== 'pass')

  const success = playerTricks >= level
  const duty = rules.vistersDuty[level]
  const perMiss = rules.visterPenaltyPerMiss[level]
  const perTrick = rules.vistPerTrick[level]

  // Сдающий, вошедший вистующим (вчетвером), висты пишет, но за недобор взяток
  // НЕ отвечает — в гору не платит.
  const paysForMiss = (v: PlayerId) => !(seats.length === 4 && v === deal.dealer)

  // ---- ВИСТЫ ЗА ВЗЯТКИ: кому они достаются ----
  //
  // Это и есть разница «джентльменский / жлобский», и она НЕ про размер штрафа.
  //
  // Джентльменский: висты защиты делятся поровну между ОБОИМИ защитниками, в том
  // числе пасовавшим. Вистовал один, взятки взял он — половина всё равно уходит
  // напарнику.
  // Жлобский: пишет только тот, кто вистовал. Пасовавший не получает ничего,
  // даже за взятки, которые физически взял сам.
  if (rules.vistStyle === 'gentleman') {
    const share = vTricksTotal / vs.length
    if (share > 0) {
      vs.forEach((v) => delta.whists.push({ from: v, to: player, amount: share * perTrick }))
    }
  } else if (activeVisters.length === 1) {
    // Один вистует за всю пару — ему все взятки пары
    const solo = activeVisters[0]
    if (vTricksTotal > 0) {
      delta.whists.push({ from: solo, to: player, amount: vTricksTotal * perTrick })
    }
  } else {
    activeVisters.forEach((v) => {
      const myTricks = deal.vistersTricks[v] ?? 0
      if (myTricks > 0) {
        delta.whists.push({ from: v, to: player, amount: myTricks * perTrick })
      }
    })
  }

  // ---- ШТРАФ ЗА НЕДОБОР: кто и сколько платит в гору ----
  //
  // Это «ответственность». Полуответственный вист = половина цены игры за
  // каждую недобранную взятку (у нас это и есть perMiss). Платят только те, кто
  // вистовал: пасовавший в недоборе не виноват.
  //
  // От стиля виста штраф НЕ зависит: это разные оси. Каждый вистовавший пишет за
  // себя. На 8-9-10, где норма пары всего одна взятка и «ответственность несут
  // оба», каждый взявший ноль пишет ПОЛНУЮ половину стоимости игры (на восьмерной
  // по 6, а не по 3 на брата) — подтверждено разбором питерских правил.
  if (vTricksTotal < duty && activeVisters.length > 0) {
    if (activeVisters.length === 1) {
      // Один вистовал за пару — на нём весь недобор пары
      const solo = activeVisters[0]
      if (paysForMiss(solo)) delta.mount[solo] += (duty - vTricksTotal) * perMiss
    } else {
      // Вистуют оба — «пол взятки не считается».
      // Норма пары ≥ 2 (6-я, 7-я): у каждого своя норма duty/2, штраф тому, кто
      // недобрал СВОЮ. Норма пары = 1 (8-я, 9-я, а в турнире и 10-я): штраф
      // каждому, кто лично взял ноль, и на целую взятку.
      if (duty >= 2) {
        const dutyPerPlayer = duty / 2
        activeVisters.forEach((v) => {
          const myTricks = deal.vistersTricks[v] ?? 0
          if (myTricks < dutyPerPlayer && paysForMiss(v)) {
            delta.mount[v] += (dutyPerPlayer - myTricks) * perMiss
          }
        })
      } else {
        activeVisters.forEach((v) => {
          if ((deal.vistersTricks[v] ?? 0) === 0 && paysForMiss(v)) {
            delta.mount[v] += perMiss
          }
        })
      }
    }
  }

  if (success) {
    delta.pool[player] += rules.poolCost[level]
  } else {
    // Ремиз играющего (подсад) — недобор × штраф в гору
    const shortfall = level - playerTricks
    delta.mount[player] += shortfall * rules.mountPenalty[level]

    // Консоляция — каждому вистующему, включая пасовавшего.
    // Вчетвером её получает и сдающий, хотя в розыгрыше не участвовал.
    if (rules.consolation) {
      const consolation = shortfall * perTrick
      if (consolation > 0) {
        const receivers = new Set<PlayerId>(vs)
        if (rules.consolationToDealer && seats.length === 4) receivers.add(deal.dealer)
        receivers.forEach((v) => {
          if (v !== player) delta.whists.push({ from: v, to: player, amount: consolation })
        })
      }
    }
  }

  // Премия за «быстрые взятки» в прикупе — отдельная запись вистов, к десяти
  // разыгранным взяткам отношения не имеет. Пишется и когда сыграл, и когда сел.
  addPrikupBonus(delta, deal, seats, rules, level)

  return delta
}

// Премия за прикуп (кодекс ФСПР 6.4).
// Вчетвером её пишет сдатчик на играющего целиком. Втроём — каждый из двух
// соперников по половине, независимо от того, кто сдавал (хоть бы сам играющий).
function addPrikupBonus(
  delta: DealDelta,
  deal: Extract<Deal, { type: 'game' }>,
  seats: Seats,
  rules: Rules,
  level: GameLevel,
): void {
  if (!rules.prikupBonus) return
  const fast = deal.prikupFastTricks ?? 0
  if (fast <= 0) return
  const total = fast * rules.vistPerTrick[level]

  if (seats.length === 4) {
    delta.whists.push({ from: deal.dealer, to: deal.player, amount: total })
    return
  }
  const opponents = seats.filter((p) => p !== deal.player)
  opponents.forEach((p) => {
    delta.whists.push({ from: p, to: deal.player, amount: total / opponents.length })
  })
}

// Расчёт «Мизер». Премии за прикуп на мизере не бывает: быстрые взятки там не
// подарок, а приговор.
function calcMisere(deal: Extract<Deal, { type: 'misere' }>, rules: Rules): DealDelta {
  const delta = emptyDelta()
  if (deal.playerTricks === 0) {
    delta.pool[deal.player] += rules.miserePoolCost
  } else {
    delta.mount[deal.player] += deal.playerTricks * rules.misereTrickPenalty
  }
  return delta
}

// Расчёт «Распасы».
//
// Гора пишется либо за каждую свою взятку (ФСПР), либо с амнистией минимума —
// взявший меньше всех не пишет ничего (дом). На итог «кто кому сколько» выбор не
// влияет: он сдвигает горы всех игроков на одно и то же число. Разный только вид
// записи, и он должен совпадать с бумагой судьи.
//
// За 0 взяток — поблажка: минус цена 2 взяток с горы ИЛИ плюс цена 1 взятки в
// пулю. По деньгам это одно и то же (2 очка горы = 20 вистов = 1 очко пули).
// Сдающему поблажка может не даваться (ФСПР: «кроме СДАЮЩЕГО»).
function calcRaspas(deal: Extract<Deal, { type: 'raspas' }>, seats: Seats, rules: Rules): DealDelta {
  const delta = emptyDelta()
  const cost = ladderAt(rules.raspasCostLadder, deal.level - 1)
  const tricks = deal.tricks
  const min = Math.min(...seats.map((p) => tricks[p] ?? 0))

  seats.forEach((p) => {
    const mine = tricks[p] ?? 0
    const billed = rules.raspasWriteEveryTrick ? mine : mine - min
    if (billed > 0) delta.mount[p] += billed * cost

    if (mine === 0) {
      const excluded = rules.raspasZeroExcludesDealer && p === deal.dealer
      if (!excluded) {
        if (rules.raspasZeroBonus === 'mountMinus2') delta.mount[p] -= 2 * cost
        else if (rules.raspasZeroBonus === 'poolPlus1') delta.pool[p] += cost
      }
    }
  })
  return delta
}

// Расчёт «Уход без 3»: гора за 3 недобранные взятки, висты не пишутся
function calcGiveup(deal: Extract<Deal, { type: 'giveup' }>, rules: Rules): DealDelta {
  const delta = emptyDelta()
  if (deal.contract.kind !== 'game') return delta
  const level = deal.contract.level as GameLevel
  delta.mount[deal.player] += 3 * rules.mountPenalty[level]
  return delta
}

// Ручная корректировка: строка, которую вписал человек. Движок её не считает,
// а просто применяет как есть — на то она и ручная.
function calcAdjust(deal: Extract<Deal, { type: 'adjust' }>): DealDelta {
  const delta = emptyDelta()
  if (deal.target === 'pool') delta.pool[deal.player] += deal.amount
  else if (deal.target === 'mount') delta.mount[deal.player] += deal.amount
  else if (deal.to) delta.whists.push({ from: deal.player, to: deal.to, amount: deal.amount })
  return delta
}

// Основная функция. seats по умолчанию — стол на троих, rules — пресет «Дом»:
// так считаются все партии, записанные до появления конвенций.
export function calcDeal(deal: Deal, seats: Seats = PLAYERS, rules: Rules = HOME_RULES): DealDelta {
  switch (deal.type) {
    case 'game':
      return calcGame(deal, seats, rules)
    case 'misere':
      return calcMisere(deal, rules)
    case 'raspas':
      return calcRaspas(deal, seats, rules)
    case 'giveup':
      return calcGiveup(deal, rules)
    case 'adjust':
      return calcAdjust(deal)
  }
}
