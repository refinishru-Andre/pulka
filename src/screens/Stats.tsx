import { useEffect, useMemo, useState } from 'react'
import { fetchGames } from '../supabase/sync'
import { computeStats, type PlayerStats } from '../engine/stats'
import type { GameState } from '../engine/types'

interface Props {
  onBack: () => void
}

const SUIT_ICON: Record<string, string> = { S: '♠', C: '♣', D: '♦', H: '♥' }

export function Stats({ onBack }: Props) {
  const [games, setGames] = useState<GameState[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const list = await fetchGames()
      setGames(list.map((g) => g.game))
      setLoading(false)
    })()
  }, [])

  const stats = useMemo(() => computeStats(games), [games])
  const sortedPlayers = useMemo(
    () => Object.values(stats.players).sort((a, b) => b.vpd - a.vpd),
    [stats],
  )

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Статистика</h1>
            <div className="text-sm text-slate-400 mt-1">
              Завершённых партий: <b>{stats.gamesConsidered}</b>
              {stats.gamesInProgress > 0 && (
                <>
                  {' · '}
                  <span className="text-yellow-400">
                    Не завершённых: {stats.gamesInProgress} (не учтены)
                  </span>
                </>
              )}
              {' · '}Всего сдач: <b>{stats.totalDeals}</b>
            </div>
          </div>
          <button
            onClick={onBack}
            className="px-5 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
          >
            ← К партиям
          </button>
        </div>

        {loading && <div className="text-center text-slate-400 py-10">Загрузка...</div>}

        {!loading && sortedPlayers.length === 0 && (
          <div className="bg-slate-800 rounded-2xl p-10 text-center">
            <div className="text-lg text-slate-300 mb-2">Пока нет данных для статистики</div>
            <div className="text-sm text-slate-500">
              Нужна хотя бы одна завершённая партия. Заверши текущую через кнопку 🏁 в партии, или выиграй
              пулю у соперников.
            </div>
          </div>
        )}

        {!loading && sortedPlayers.length > 0 && (
          <div className="space-y-6">
            {/* Общий рейтинг */}
            <RankingTable players={sortedPlayers} />

            {/* H2H */}
            {stats.h2h.length > 0 && <H2HTable h2h={stats.h2h} />}

            {/* По каждому игроку — детальный блок */}
            {sortedPlayers.map((p) => (
              <PlayerDetail key={p.name} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RankingTable({ players }: { players: PlayerStats[] }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <div className="text-lg font-bold mb-3">Рейтинг игроков</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Игрок</th>
              <th className="text-right py-2 px-2">Партий</th>
              <th className="text-right py-2 px-2">Побед</th>
              <th className="text-right py-2 px-2">Winrate</th>
              <th className="text-right py-2 px-2" title="Vists Per Deal — среднее вистов за сдачу">
                VPD
              </th>
              <th className="text-right py-2 px-2">Всего вистов</th>
              <th className="text-right py-2 px-2">Стрик</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.name} className="border-b border-slate-700/50">
                <td className="py-2 px-2 text-slate-400">{i + 1}</td>
                <td className="py-2 px-2 font-semibold">{p.name}</td>
                <td className="py-2 px-2 text-right">{p.gamesTotal}</td>
                <td className="py-2 px-2 text-right">{p.gamesWon}</td>
                <td className="py-2 px-2 text-right">
                  {(p.winRate * 100).toFixed(0)}%
                </td>
                <td
                  className={`py-2 px-2 text-right font-bold ${
                    p.vpd > 0 ? 'text-green-400' : p.vpd < 0 ? 'text-red-400' : ''
                  }`}
                >
                  {p.vpd > 0 ? '+' : ''}
                  {p.vpd.toFixed(2)}
                </td>
                <td
                  className={`py-2 px-2 text-right ${
                    p.totalVists > 0 ? 'text-green-400' : p.totalVists < 0 ? 'text-red-400' : ''
                  }`}
                >
                  {p.totalVists > 0 ? '+' : ''}
                  {p.totalVists}
                </td>
                <td className="py-2 px-2 text-right">
                  {p.currentStreak > 0 ? (
                    <span className="text-green-400">+{p.currentStreak}</span>
                  ) : p.currentStreak < 0 ? (
                    <span className="text-red-400">{p.currentStreak}</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function H2HTable({ h2h }: { h2h: { a: string; b: string; gamesTogether: number; aBalance: number }[] }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <div className="text-lg font-bold mb-3">Кто у кого выигрывает (за всё время)</div>
      <div className="space-y-2">
        {h2h.map((rec, i) => {
          const winner = rec.aBalance > 0 ? rec.a : rec.b
          const loser = rec.aBalance > 0 ? rec.b : rec.a
          const amount = Math.abs(Math.round(rec.aBalance))
          return (
            <div
              key={i}
              className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3"
            >
              <div>
                <span className="font-semibold text-green-400">{winner}</span>
                <span className="text-slate-500 mx-2">выиграл у</span>
                <span className="font-semibold text-red-400">{loser}</span>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-yellow-500">{amount}</div>
                <div className="text-xs text-slate-500">{rec.gamesTogether} партий вместе</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlayerDetail({ p }: { p: PlayerStats }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-5">
      <div className="text-xl font-bold mb-4 flex items-center gap-3">
        <span>{p.name}</span>
        <span className={`text-base ${p.totalVists > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {p.totalVists > 0 ? '+' : ''}
          {p.totalVists} вистов за всё время
        </span>
      </div>

      {/* Разбивка заказов */}
      <div className="mb-5">
        <div className="text-sm text-slate-400 mb-2 uppercase font-semibold">Заказы игр</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs">
                <th className="text-left py-1 px-2">Уровень</th>
                <th className="text-right py-1 px-2">Заказал</th>
                <th className="text-right py-1 px-2">Сыграл</th>
                <th className="text-right py-1 px-2">Ремиз</th>
                <th className="text-right py-1 px-2">%</th>
                <th className="text-right py-1 px-2">Перебор</th>
                <th className="text-right py-1 px-2">Недобор</th>
              </tr>
            </thead>
            <tbody>
              {([6, 7, 8, 9, 10] as const).map((level) => {
                const o = p.ordersByLevel[level]
                if (o.total === 0) return null
                return (
                  <tr key={level} className="border-t border-slate-700/50">
                    <td className="py-1 px-2 font-semibold">{level}</td>
                    <td className="py-1 px-2 text-right">{o.total}</td>
                    <td className="py-1 px-2 text-right text-green-400">{o.played}</td>
                    <td className="py-1 px-2 text-right text-red-400">{o.remise}</td>
                    <td className="py-1 px-2 text-right font-bold">{(o.successRate * 100).toFixed(0)}%</td>
                    <td className="py-1 px-2 text-right text-slate-400">
                      {o.avgOverbid > 0 ? `+${o.avgOverbid.toFixed(1)}` : '—'}
                    </td>
                    <td className="py-1 px-2 text-right text-slate-400">
                      {o.avgUnderbid > 0 ? `−${o.avgUnderbid.toFixed(1)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Мизеры */}
        <div className="bg-slate-900 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase mb-2">Мизер</div>
          <div className="text-2xl font-bold mb-1">
            {p.miseres.played}
            <span className="text-sm text-slate-500 ml-2">из {p.miseres.total}</span>
          </div>
          <div className="text-sm text-green-400 mb-1">
            {p.miseres.total > 0 ? `${(p.miseres.successRate * 100).toFixed(0)}% сыгранных` : 'не заказывал'}
          </div>
          {p.miseres.caught > 0 && (
            <div className="text-sm text-red-400">поймали: {p.miseres.caught}</div>
          )}
        </div>

        {/* БК */}
        <div className="bg-slate-900 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase mb-2">БК-игры</div>
          <div className="text-2xl font-bold mb-1">
            {p.ntOrders.played}
            <span className="text-sm text-slate-500 ml-2">из {p.ntOrders.total}</span>
          </div>
          <div className="text-sm text-green-400">
            {p.ntOrders.total > 0
              ? `${(p.ntOrders.successRate * 100).toFixed(0)}% сыгранных`
              : 'не заказывал'}
          </div>
        </div>

        {/* Уходы без 3 */}
        <div className="bg-slate-900 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase mb-2">Уходы без 3</div>
          <div className="text-2xl font-bold">{p.giveups}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Вистование */}
        <div className="bg-slate-900 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase mb-2">Вист</div>
          <div className="text-sm space-y-1">
            <div>
              Вистовал: <b>{p.vist.total}</b>
            </div>
            <div>
              Пасовал: <b>{p.vist.passed}</b>
            </div>
            <div>
              Полвиста: <b>{p.vist.half}</b>
            </div>
          </div>
        </div>

        {/* Распасы */}
        <div className="bg-slate-900 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase mb-2">Распасы</div>
          <div className="text-sm space-y-1">
            <div>
              Всего: <b>{p.raspas.total}</b>
            </div>
            <div>
              Средние взятки: <b>{p.raspas.avgTricks.toFixed(2)}</b>
            </div>
            <div>
              Из них 8-мерных: <b>{p.raspas.eightMerCount}</b>
            </div>
            <div>
              «Чистых» (0 взяток): <b className="text-green-400">{p.raspas.zeroTricksCount}</b>
            </div>
          </div>
        </div>

        {/* Рекорды */}
        <div className="bg-slate-900 rounded-lg p-4">
          <div className="text-xs text-slate-500 uppercase mb-2">Рекорды</div>
          <div className="text-sm space-y-1">
            <div>
              Макс выигрыш пули: <b className="text-green-400">+{p.maxWinInGame}</b>
            </div>
            <div>
              Макс проигрыш: <b className="text-red-400">{p.maxLossInGame}</b>
            </div>
            <div>
              Самая длинная пуля: <b>{p.longestGameDeals} сдач</b>
            </div>
          </div>
        </div>
      </div>

      {/* По мастям */}
      <div>
        <div className="text-sm text-slate-400 mb-2 uppercase font-semibold">По мастям</div>
        <div className="grid grid-cols-4 gap-2">
          {(['S', 'C', 'D', 'H'] as const).map((suit) => {
            const o = p.suitOrders[suit]
            const redSuit = suit === 'D' || suit === 'H'
            return (
              <div key={suit} className="bg-slate-900 rounded-lg p-3 text-center">
                <div className={`text-2xl mb-1 ${redSuit ? 'text-red-400' : 'text-slate-200'}`}>
                  {SUIT_ICON[suit]}
                </div>
                <div className="text-lg font-bold">
                  {o.played}
                  <span className="text-xs text-slate-500 ml-1">/{o.total}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {o.total > 0 ? `${(o.successRate * 100).toFixed(0)}%` : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
