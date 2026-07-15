// Треугольная визуализация пули на 3 игроков — по образцу gambler.ru
// Разделение на 3 сектора спицами из центра к серединам сторон.
// Слои от центра к краю: гора → пуля → висты (по краям).

import type { GameState, PlayerId, DealDelta } from '../engine/types'
import { PLAYERS } from '../engine/types'

interface Props {
  game: GameState
  lastDelta: DealDelta | null
  lastWhistDelta: Record<PlayerId, Record<PlayerId, number>>
  netVists: Record<PlayerId, number>
}

// Геометрия равностороннего треугольника
const VB_W = 900
const VB_H = 800
const CENTER = { x: 450, y: 430 }
const SIDE = 560
const H = SIDE * Math.sqrt(3) / 2 // высота

// Вершины
const A = { x: CENTER.x, y: CENTER.y - (2 * H) / 3 }
const B = { x: CENTER.x - SIDE / 2, y: CENTER.y + H / 3 }
const C = { x: CENTER.x + SIDE / 2, y: CENTER.y + H / 3 }

// Середины сторон
const mAB = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
const mAC = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 }
const mBC = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 }

// Секторы (четырёхугольники) для каждого игрока
const SECTORS: Record<PlayerId, { x: number; y: number }[]> = {
  A: [A, mAB, CENTER, mAC],
  B: [B, mBC, CENTER, mAB],
  C: [C, mAC, CENTER, mBC],
}

// Позиции меток внутри сектора (mountLbl ближе к центру, poolLbl в середине, nameLbl у вершины)
// Позиции рассчитаны по «t» от вершины к центру: 0.15 = ближе к вершине, 0.85 = ближе к центру
function labelPos(vertex: { x: number; y: number }, t: number) {
  return {
    x: vertex.x + (CENTER.x - vertex.x) * t,
    y: vertex.y + (CENTER.y - vertex.y) * t,
  }
}

// Позиция вистов снаружи вершины: от вершины наружу (за пределы треугольника),
// затем перпендикулярно оси «центр→вершина» в сторону соседа.
function whistPos(vertex: { x: number; y: number }, targetVertex: { x: number; y: number }, sideOffset: number) {
  // Ось «наружу» — от центра к вершине, нормализованная
  const ox = vertex.x - CENTER.x
  const oy = vertex.y - CENTER.y
  const olen = Math.hypot(ox, oy)
  const nx = ox / olen
  const ny = oy / olen
  // Перпендикуляр (2 варианта: (-ny, nx) и (ny, -nx)). Выбираем тот, что в сторону цели.
  const tx = targetVertex.x - vertex.x
  const ty = targetVertex.y - vertex.y
  const perp1x = -ny
  const perp1y = nx
  const perp2x = ny
  const perp2y = -nx
  // Скалярное произведение с направлением к цели — выбираем ту сторону
  const dot1 = perp1x * tx + perp1y * ty
  const px = dot1 > 0 ? perp1x : perp2x
  const py = dot1 > 0 ? perp1y : perp2y
  // Наружу от вершины на 55, потом перпендикулярно на sideOffset
  const OUT = 55
  return {
    x: vertex.x + nx * OUT + px * sideOffset,
    y: vertex.y + ny * OUT + py * sideOffset,
  }
}

const NAMES_ORDER: PlayerId[] = ['A', 'B', 'C']
const VERTEX: Record<PlayerId, { x: number; y: number }> = { A, B, C }

export function TrianglePool({ game, lastDelta, lastWhistDelta, netVists }: Props) {
  const sumPool = PLAYERS.reduce((s, p) => s + game.pool[p], 0)
  const targetSum = game.poolLimit * PLAYERS.length

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-auto">
      {/* Секторы */}
      {NAMES_ORDER.map((p) => {
        const isFirstHand = game.firstHand === p
        const changed = lastDelta && (lastDelta.pool[p] !== 0 || lastDelta.mount[p] !== 0)
        return (
          <polygon
            key={`sector-${p}`}
            points={SECTORS[p].map((pt) => `${pt.x},${pt.y}`).join(' ')}
            fill={isFirstHand ? '#3b3005' : changed ? '#1e2b3e' : '#1e293b'}
            stroke="#facc15"
            strokeWidth="1.5"
            opacity="0.9"
          />
        )
      })}

      {/* Внешний треугольник (жёлтая рамка) */}
      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`}
        fill="none"
        stroke="#facc15"
        strokeWidth="2.5"
      />

      {/* Центральный овал: сумма пуль */}
      <ellipse cx={CENTER.x} cy={CENTER.y} rx="52" ry="35" fill="#0f172a" stroke="#facc15" strokeWidth="2" />
      <text x={CENTER.x} y={CENTER.y - 3} textAnchor="middle" fill="#facc15" fontSize="20" fontWeight="bold">
        {sumPool}
      </text>
      <text x={CENTER.x} y={CENTER.y + 16} textAnchor="middle" fill="#94a3b8" fontSize="13">
        / {targetSum}
      </text>

      {/* Метки в каждом секторе */}
      {NAMES_ORDER.map((p) => {
        const isFirstHand = game.firstHand === p
        const vertex = VERTEX[p]
        // Ближе к центру — гора; в середине сектора — пуля; ближе к вершине — имя+итог
        const mountPos = labelPos(vertex, 0.62)
        const poolPos = labelPos(vertex, 0.4)
        const namePos = labelPos(vertex, 0.15)
        const netPos = labelPos(vertex, 0.24)
        return (
          <g key={`labels-${p}`}>
            {/* Имя игрока */}
            <text
              x={namePos.x}
              y={namePos.y}
              textAnchor="middle"
              fill={isFirstHand ? '#facc15' : '#e2e8f0'}
              fontSize="22"
              fontWeight="bold"
            >
              {game.players[p]}
            </text>
            {isFirstHand && (
              <text
                x={namePos.x}
                y={namePos.y - 24}
                textAnchor="middle"
                fill="#facc15"
                fontSize="11"
                fontWeight="bold"
              >
                ● 1 РУКА
              </text>
            )}
            {/* Итог игрока в вистах */}
            <text
              x={netPos.x}
              y={netPos.y}
              textAnchor="middle"
              fill={netVists[p] > 0 ? '#4ade80' : netVists[p] < 0 ? '#f87171' : '#94a3b8'}
              fontSize="15"
              fontWeight="bold"
            >
              {netVists[p] > 0 ? '+' : ''}
              {netVists[p]}
            </text>
            {/* Пуля (в средней части сектора) */}
            <text
              x={poolPos.x}
              y={poolPos.y}
              textAnchor="middle"
              fill="#4ade80"
              fontSize="32"
              fontWeight="bold"
            >
              {game.pool[p]}
            </text>
            <text
              x={poolPos.x}
              y={poolPos.y + 18}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="11"
            >
              пуля / {game.poolLimit}
            </text>
            {/* Дельта пули */}
            {lastDelta && lastDelta.pool[p] !== 0 && (
              <text
                x={poolPos.x + 32}
                y={poolPos.y}
                textAnchor="start"
                fill="#4ade80"
                fontSize="14"
                fontWeight="bold"
              >
                +{lastDelta.pool[p]}
              </text>
            )}
            {/* Гора (ближе к центру) */}
            <text
              x={mountPos.x}
              y={mountPos.y}
              textAnchor="middle"
              fill="#f87171"
              fontSize="24"
              fontWeight="bold"
            >
              {game.mount[p]}
            </text>
            <text
              x={mountPos.x}
              y={mountPos.y + 15}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="10"
            >
              гора
            </text>
            {lastDelta && lastDelta.mount[p] !== 0 && (
              <text
                x={mountPos.x + 26}
                y={mountPos.y}
                textAnchor="start"
                fill="#f87171"
                fontSize="12"
                fontWeight="bold"
              >
                +{lastDelta.mount[p]}
              </text>
            )}
          </g>
        )
      })}

      {/* Висты снаружи — 2 колонки у каждой вершины */}
      {NAMES_ORDER.map((p) => {
        const vertex = VERTEX[p]
        const neighbors = PLAYERS.filter((o) => o !== p)
        return (
          <g key={`whists-${p}`}>
            {neighbors.map((target) => {
              const targetVertex = VERTEX[target]
              const pos = whistPos(vertex, targetVertex, 60)
              const amount = game.whists[p][target]
              const delta = lastWhistDelta[p][target]
              return (
                <g key={`w-${p}-${target}`}>
                  <text x={pos.x} y={pos.y - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
                    → {game.players[target]}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 12}
                    textAnchor="middle"
                    fill="#60a5fa"
                    fontSize="20"
                    fontWeight="bold"
                  >
                    {amount}
                  </text>
                  {delta !== 0 && (
                    <text
                      x={pos.x}
                      y={pos.y + 30}
                      textAnchor="middle"
                      fill="#4ade80"
                      fontSize="12"
                      fontWeight="bold"
                    >
                      +{delta}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
