import { useMemo, useState } from 'react'
import { fmtCompact, fmtMoney, MESES } from '../lib/format'

/**
 * Barras apiladas: facturación por mes, un segmento por centro.
 * El color sigue al centro (orden fijo por id), nunca a su posición en el ranking.
 */
export default function BarChart({ series, colorOf, nameOf }) {
  const [hover, setHover] = useState(null)
  const W = 720, H = 280, M = { t: 12, r: 8, b: 26, l: 56 }
  const iw = W - M.l - M.r, ih = H - M.t - M.b

  const totals = useMemo(() => MESES.map((_, m) => series.reduce((s, x) => s + Math.max(0, x.meses[m]), 0)), [series])
  const max = Math.max(...totals, 1)
  const step = niceStep(max / 4)
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const band = iw / 12
  const bw = Math.min(34, band * 0.62)
  const y = (v) => M.t + ih - (v / top) * ih

  return (
    <div className="chart-box" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Facturación mensual por centro">
        <defs>
          {series.map((s) => (
            <pattern key={s.centro_id} id={`sim-${s.centro_id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--surface)" />
              <rect width="3" height="6" fill={colorOf(s.centro_id)} />
            </pattern>
          ))}
        </defs>
        <g className="grid">
          {ticks.map((t) => <line key={t} x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />)}
        </g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={M.l - 8} y={y(t) + 4} textAnchor="end">{fmtCompact(t)}</text>)}
          {MESES.map((m, i) => <text key={m} x={M.l + band * i + band / 2} y={H - 6} textAnchor="middle">{m}</text>)}
        </g>
        {MESES.map((_, m) => {
          const x = M.l + band * m + (band - bw) / 2
          let acc = 0
          // Por centro: primero lo real (relleno liso) y encima lo simulado (rayado del mismo color).
          const segs = series.flatMap((s) => {
            const sim = Math.max(0, s.meses_simulado?.[m] ?? 0)
            const real = Math.max(0, s.meses[m] - sim)
            return [{ id: s.centro_id, v: real, sim: false }, { id: s.centro_id, v: sim, sim: true }]
          }).filter((s) => s.v > 0).map((s) => {
            const y0 = y(acc), y1 = y(acc + s.v)
            acc += s.v
            return { ...s, y: y1, h: y0 - y1 }
          })
          return (
            <g key={m}>
              {segs.map((s, i) => {
                const isTop = i === segs.length - 1
                // 2px de separación entre segmentos; extremo superior redondeado.
                const h = Math.max(0, s.h - (isTop ? 0 : 2))
                const r = isTop ? Math.min(4, h) : 0
                return <path key={`${s.id}-${s.sim}`} d={roundedTop(x, s.y, bw, h, r)} fill={s.sim ? `url(#sim-${s.id})` : colorOf(s.id)}
                  stroke={s.sim ? colorOf(s.id) : 'none'} strokeWidth={s.sim ? 1 : 0} opacity={hover === null || hover === m ? 1 : 0.45} />
              })}
              <rect x={M.l + band * m} y={M.t} width={band} height={ih} fill="transparent"
                onMouseEnter={() => setHover(m)} onFocus={() => setHover(m)} tabIndex={0}
                aria-label={`${MESES[m]}: ${fmtMoney(totals[m])}`} />
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((M.l + band * hover + band / 2) / W) * 100}%`, top: 8, transform: hover > 8 ? 'translateX(-105%)' : 'translateX(8%)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{MESES[hover]} · {fmtMoney(totals[hover])}</div>
          {series.filter((s) => s.meses[hover] !== 0).map((s) => (
            <div key={s.centro_id}>
              <div className="row">
                <span><i style={{ background: colorOf(s.centro_id) }} />{nameOf(s.centro_id)}</span>
                <span className="num">{fmtMoney(s.meses[hover])}</span>
              </div>
              {(s.meses_simulado?.[hover] ?? 0) !== 0 && (
                <div className="row small" style={{ paddingLeft: 14 }}><span className="muted">de los cuales simulado</span><span className="num muted">{fmtMoney(s.meses_simulado[hover])}</span></div>
              )}
            </div>
          ))}
          {totals[hover] === 0 && <div className="muted">Sin facturación autorizada</div>}
        </div>
      )}
    </div>
  )
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

function roundedTop(x, y, w, h, r) {
  if (h <= 0) return ''
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}
