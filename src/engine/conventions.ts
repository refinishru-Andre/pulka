// Конвенции партии — полный набор правил, по которым она считается.
//
// Смысл: движок не должен знать «как играет Андрей» или «как играют на турнире».
// Он берёт правила из самой партии. Набор вмораживается при создании и в середине
// партии не меняется — иначе половина сдач посчиталась бы по одному, половина по
// другому.
//
// У партий, сыгранных до появления этого файла, поля rules нет. Для них
// подставляется пресет «Дом» — он побитово повторяет прежнее поведение движка
// (константы из rules.ts). Проверяется тестами: 46 старых тестов зелёные.

import type { GameLevel } from './types'

export type VistStyle = 'zhlob' | 'gentleman'
//
// ВАЖНО: это про то, КОМУ достаются висты, и НЕ про размер штрафа в гору.
// Размер штрафа — отдельное понятие, «ответственность»: полуответственный вист
// (Питер) = половина цены игры за недобранную взятку, ответственный (Сочи) =
// полная. У нас это поле visterPenaltyPerMiss.
//
// Стиль работает ТОЛЬКО в раскладе «один вистовал, другой пасовал»:
//   gentleman — висты пары делятся поровну между обоими защитниками, пасовавший
//               получает свою половину;
//   zhlob     — всё забирает вистовавший, пасовавшему ноль.
// Если вистуют ОБА, делить нечего: каждый пишет свои взятки, и оба стиля дают
// один и тот же результат.

export type RaspasZeroBonus = 'mountMinus2' | 'poolPlus1' | 'none'
// mountMinus2 — минус цена 2 взяток с горы
// poolPlus1   — плюс цена 1 взятки в пулю
// По деньгам это одно и то же: 2 очка горы = 20 вистов = 1 очко пули.
// Разница только в форме записи — чтобы совпадать с бумагой судьи.

export interface Rules {
  id: string // 'home' | 'fspr' | произвольный для своих наборов
  name: string // как показывать человеку

  // ---------- Стол ----------
  // Размер пули. null = без предела: играют на время, считают по последней сдаче.
  poolLimit: number | null
  // Перекрытие: лишние очки пули переходят соседям по часовой (передающий
  // получает висты). Возможно только когда предел задан.
  poolOverflowTransfers: boolean
  // Первая рука ОСТАЁТСЯ на месте, если на 8-мерных распасах заказанная игра
  // не сыграна (ремиз 8+, пойманный мизер, уход без трёх). Иначе сдача всегда
  // идёт по часовой, что бы ни случилось.
  firstHandStaysOnFailedHighGame: boolean

  // ---------- Стоимости ----------
  poolCost: Record<GameLevel, number> // в пулю за сыгранную
  mountPenalty: Record<GameLevel, number> // в гору за 1 недобранную (подсад)
  vistPerTrick: Record<GameLevel, number> // вист за 1 взятку вистующего
  miserePoolCost: number // в пулю за сыгранный мизер
  misereTrickPenalty: number // в гору за 1 пойманную взятку на мизере

  // ---------- Вист ----------
  vistStyle: VistStyle
  vistersDuty: Record<GameLevel, number> // обязательные взятки ПАРЫ
  visterPenaltyPerMiss: Record<GameLevel, number> // вистующему за 1 недобранную
  // Консоляция при подсаде: каждому вистующему недобор × цену виста.
  consolation: boolean
  // Вчетвером её получает и сдающий, хотя в розыгрыше не участвовал.
  consolationToDealer: boolean
  // Контракты, на которых допускается уход за полвиста. Число засчитываемых
  // взяток не задаётся отдельно: это половина нормы пары (на 6-й 4/2 = 2,
  // на 7-й 2/2 = 1). Кодекс называет то же самое «уход второго за две / за одну».
  halfVistLevels: GameLevel[]
  // Сдающий вчетвером может вистовать (торговля «пас — полвиста — пас»).
  // При подсаде пишет все висты, но за недобор взяток НЕ отвечает.
  dealerMayVist: boolean

  // ---------- Распасы ----------
  // Цена взятки по кругам. Последнее значение повторяется дальше:
  // [2,4,6] это 2-4-6-6-6…
  raspasCostLadder: number[]
  // Минимальный заказ после N распасов. Индекс 0 = обычная игра, последнее
  // значение повторяется: дом [6,7,8] = 6-7-8-8…, ФСПР [6,7] = 6-7-7-7…
  minBidLadder: number[]
  // true  — в гору за КАЖДУЮ свою взятку
  // false — амнистия минимума: взявший меньше всех не пишет ничего.
  // На итог «кто кому сколько» это не влияет (сдвигает горы всех на одно
  // число), но вид записи разный.
  raspasWriteEveryTrick: boolean
  raspasZeroBonus: RaspasZeroBonus
  // Сдающему поблажка за 0 взяток не даётся.
  raspasZeroExcludesDealer: boolean
  // Вчетвером сдатчик открывает прикуп по карте, ходит первые два хода и
  // пишет взятки на общих основаниях. Максимум 2 взятки, сумма по всем = 10.
  dealerPlaysRaspasPrikup: boolean
  // Выход из распасов даёт только ЗАВИСТОВАННАЯ сыгранная игра.
  // «8 пик — пас — пас» тогда не выход, хотя игра сыграна.
  exitRequiresVisted: boolean
  // Сыгранный мизер гасит распасы. В ФСПР нет: мизер не вистуется в принципе,
  // а выход даёт только завистованная игра.
  misereBreaksRaspas: boolean

  // ---------- Прикуп ----------
  // Премия за «быстрые взятки»: Т или КД одной масти = 1, ТК одной масти = 2,
  // два туза = 3 — по цене виста заказанной игры. Вчетвером пишет сдатчик на
  // играющего целиком, втроём каждый соперник половину (независимо от того,
  // кто сдавал). Пишется и когда сыграл, и когда сел. На мизере не бывает.
  prikupBonus: boolean

  // ---------- Прочее ----------
  allowGiveup: boolean // уход «без трёх, без вистов»
}

// ============================================================================
// ПРЕСЕТ «ДОМ» — правила Андрея. Обязан повторять поведение движка до появления
// конвенций: по нему считаются все партии, у которых поля rules нет.
// ============================================================================
export const HOME_RULES: Rules = {
  id: 'home',
  name: 'Дом (Андрей)',

  poolLimit: 21,
  poolOverflowTransfers: true,
  firstHandStaysOnFailedHighGame: true,

  poolCost: { 6: 2, 7: 4, 8: 6, 9: 8, 10: 10 },
  mountPenalty: { 6: 4, 7: 8, 8: 12, 9: 16, 10: 20 },
  vistPerTrick: { 6: 4, 7: 8, 8: 12, 9: 16, 10: 20 },
  miserePoolCost: 10,
  misereTrickPenalty: 20,

  vistStyle: 'zhlob',
  vistersDuty: { 6: 4, 7: 2, 8: 1, 9: 1, 10: 0 }, // десятерная не вистуется — проверяется
  visterPenaltyPerMiss: { 6: 2, 7: 4, 8: 6, 9: 8, 10: 0 },
  consolation: true,
  consolationToDealer: false, // дома играют втроём, сдающий и так вистует
  halfVistLevels: [6, 7],
  dealerMayVist: false,

  raspasCostLadder: [2, 4, 6],
  minBidLadder: [6, 7, 8],
  raspasWriteEveryTrick: false, // амнистия минимума
  raspasZeroBonus: 'mountMinus2',
  raspasZeroExcludesDealer: false,
  dealerPlaysRaspasPrikup: false,
  exitRequiresVisted: false,
  misereBreaksRaspas: true,

  prikupBonus: false,

  allowGiveup: true,
}

// ============================================================================
// ПРЕСЕТ «ФСПР» — Спортивный кодекс ФСПР, система «Ленинградская», Раздел 6.
// Разбор и обоснование каждого пункта — в QUESTIONS-FSPR.md.
// ============================================================================
export const FSPR_RULES: Rules = {
  id: 'fspr',
  name: 'ФСПР (турнир)',

  poolLimit: null, // играют на время, предел не задаётся
  poolOverflowTransfers: false, // без предела перекрывать нечего
  firstHandStaysOnFailedHighGame: false, // сдача всегда по часовой (6.5)

  poolCost: { 6: 2, 7: 4, 8: 6, 9: 8, 10: 10 },
  mountPenalty: { 6: 4, 7: 8, 8: 12, 9: 16, 10: 20 },
  vistPerTrick: { 6: 4, 7: 8, 8: 12, 9: 16, 10: 20 },
  miserePoolCost: 10,
  misereTrickPenalty: 20,

  vistStyle: 'gentleman', // 6.6
  vistersDuty: { 6: 4, 7: 2, 8: 1, 9: 1, 10: 1 }, // десятерная вистуется (6.6)
  visterPenaltyPerMiss: { 6: 2, 7: 4, 8: 6, 9: 8, 10: 10 },
  consolation: true,
  consolationToDealer: true, // сдатчик получает за подсад
  halfVistLevels: [6, 7], // 6.6
  dealerMayVist: true, // «пас — полвиста — пас» (6.6)

  raspasCostLadder: [2, 4, 6], // 2-4-6-6-6 (6.5)
  minBidLadder: [6, 7], // выход затруднённый 7-7-7-7 (6.5)
  raspasWriteEveryTrick: true, // «запись в гору за каждую взятку» (6.5)
  raspasZeroBonus: 'mountMinus2',
  raspasZeroExcludesDealer: true, // «кроме СДАЮЩЕГО» (6.5)
  dealerPlaysRaspasPrikup: true, // (6.5)
  exitRequiresVisted: true, // (6.5)
  misereBreaksRaspas: false, // мизер не вистуется, значит не выход

  prikupBonus: true, // (6.4)

  allowGiveup: false, // «уход без трёх, без вистов» не допускается (6.6)
}

export const PRESETS: Rules[] = [HOME_RULES, FSPR_RULES]

// Правила партии. Партии без поля rules — домашние, до появления конвенций.
export function rulesOf(game: { rules?: Rules }): Rules {
  return game.rules ?? HOME_RULES
}

// Значение «лесенки» на N-м шаге: последнее значение повторяется дальше.
// Цена взятки на 5-м распасе подряд = raspasCostLadder[последний] = 6.
export function ladderAt(ladder: number[], step: number): number {
  if (ladder.length === 0) return 0
  return ladder[Math.min(step, ladder.length - 1)]
}

// Сколько взяток засчитывается ушедшему за полвиста — половина нормы пары.
// На 6-й: 4 / 2 = 2. На 7-й: 2 / 2 = 1.
export function halfVistTricks(rules: Rules, level: GameLevel): number {
  return rules.vistersDuty[level] / 2
}
