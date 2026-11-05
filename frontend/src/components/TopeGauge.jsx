import { Pencil } from 'lucide-react'
import { fmtMoney } from '../lib/format'

/**
 * Medidor del tope mensual del CUIT: lo ya facturado en el mes, lo seleccionado
 * ahora y, si se pasa, el excedente rayado. Es el control que evita superar el tope.
 */
export default function TopeGauge({ tope, seleccionado, cantidad, onEditarTope, children }) {
  const usado = tope.facturado
  const limite = tope.tope
  const total = usado + seleccionado
  const excede = total > limite + 0.001
  const escala = Math.max(limite, total, 1)
  const wUsado = (Math.min(usado, limite) / escala) * 100
  const wSel = (Math.max(0, Math.min(total, limite) - usado) / escala) * 100
  const wOver = (Math.max(0, total - Math.max(limite, usado)) / escala) * 100
  const restante = limite - total

  return (
    <div className={`tope ${excede ? 'is-over' : ''}`} aria-live="polite">
      <div className="tope-row">
        <div className="tope-figs">
          <div className="tope-fig">
            <small><span className="tope-key" style={{ background: 'var(--ink-2)' }} />Facturado en el mes</small>
            <strong>{fmtMoney(usado)}</strong>
          </div>
          <div className="tope-fig is-sel">
            <small><span className="tope-key" style={{ background: 'var(--accent)' }} />Seleccionado · {cantidad} {cantidad === 1 ? 'pago' : 'pagos'}</small>
            <strong>{fmtMoney(seleccionado)}</strong>
          </div>
          <div className={`tope-fig ${excede ? 'is-over' : ''}`}>
            <small>{excede ? 'Excede el tope en' : 'Queda disponible'}</small>
            <strong>{fmtMoney(Math.abs(restante))}</strong>
          </div>
        </div>
        {children}
      </div>
      <div className="tope-bar" role="img" aria-label={`Tope mensual ${fmtMoney(limite)}; facturado ${fmtMoney(usado)}; seleccionado ${fmtMoney(seleccionado)}`}>
        {wUsado > 0 && <span className="seg-usado" style={{ width: `${wUsado}%` }} />}
        {wSel > 0 && <span className="seg-sel" style={{ width: `${wSel}%` }} />}
        {wOver > 0 && <span className="seg-over" style={{ width: `${wOver}%` }} />}
      </div>
      <div className="tope-scale"><span>$ 0</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Tope de {tope.mes.split('-').reverse().join('/')}: {fmtMoney(limite)}
          {onEditarTope && <button type="button" className="icon-btn" onClick={onEditarTope} aria-label="Modificar tope de facturación" title="Modificar tope de facturación"><Pencil size={13} /></button>}
        </span></div>
    </div>
  )
}
