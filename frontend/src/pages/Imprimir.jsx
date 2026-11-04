import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'
import { api } from '../lib/api'
import { CONDICION_IVA, fmtCuit, fmtDate, pad } from '../lib/format'

/*
 * Representación impresa del comprobante electrónico (RG 1415 y modificatorias, RG 4291 código QR,
 * Ley 27.743 Régimen de Transparencia Fiscal al Consumidor para comprobantes B).
 */

const LETRA = { 1: 'A', 3: 'A', 6: 'B', 8: 'B', 11: 'C', 13: 'C' }
const DOC_TIPO = { 80: 'CUIT', 96: 'DNI', 99: 'Doc.' }
const money = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const $ = (n) => money.format(Number(n) || 0)
const COPIAS = { ORIGINAL: 'ORIGINAL', DUPLICADO: 'DUPLICADO', TRIPLICADO: 'TRIPLICADO' }

/** URL del código QR de ARCA (RG 4291): JSON en base64 con los datos del comprobante y el CAE. */
function urlQr(c) {
  const datos = {
    ver: 1,
    fecha: c.fecha,
    cuit: Number(c.emisor.cuit),
    ptoVta: c.punto_venta,
    tipoCmp: c.tipo,
    nroCmp: c.numero,
    importe: Number(c.importe_total),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: c.receptor_doc_tipo,
    nroDocRec: Number(String(c.receptor_doc_nro).replace(/\D/g, '')) || 0,
    tipoCodAut: 'E',
    codAut: Number(c.cae),
  }
  return 'https://www.afip.gob.ar/fe/qr/?p=' + btoa(JSON.stringify(datos))
}

/** Renglones del detalle: uno por pago; en la nota de crédito, uno que referencia a la factura anulada. */
function renglones(c) {
  let items
  if (c.clase === 'NOTA_CREDITO' || !c.pagos.length) {
    const ref = c.asociado ? `${c.asociado.tipo_nombre} ${pad(c.asociado.punto_venta, 5)}-${pad(c.asociado.numero, 8)} del ${fmtDate(c.asociado.fecha)}` : ''
    items = [{ codigo: '', descripcion: c.clase === 'NOTA_CREDITO' ? `Anulación de ${ref}` : 'Servicios educativos', total: c.importe_total }]
  } else {
    items = c.pagos.map((p) => ({ codigo: p.nro_cuota != null ? `C${p.nro_cuota}` : '', descripcion: p.concepto || `Pago ${p.pago_id_eddis}`, total: p.importe }))
  }
  // Para la factura A, el precio se informa neto de IVA; el redondeo se ajusta en el último renglón.
  if (LETRA[c.tipo] === 'A') {
    let acumulado = 0
    items = items.map((it, i) => {
      const neto = i === items.length - 1 ? Math.round((c.importe_neto - acumulado) * 100) / 100 : Math.round((it.total / (1 + c.alicuota / 100)) * 100) / 100
      acumulado += neto
      return { ...it, neto }
    })
  }
  return items
}

function Comprobante({ c, copia }) {
  const letra = LETRA[c.tipo] ?? '?'
  const sinValidez = c.simulado ? 'SIMULADO — SIN VALIDEZ FISCAL' : c.modo_prueba ? 'HOMOLOGACIÓN — SIN VALIDEZ FISCAL' : null
  const [qr, setQr] = useState(null)
  const items = useMemo(() => renglones(c), [c])
  const e = c.emisor

  useEffect(() => {
    if (sinValidez) return
    QRCode.toDataURL(urlQr(c), { margin: 0, width: 220, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null))
  }, [c, sinValidez])

  const titulo = c.clase === 'NOTA_CREDITO' ? 'NOTA DE CRÉDITO' : 'FACTURA'

  return (
    <article className="fc-hoja">
      {sinValidez && <div className="fc-marca" aria-hidden="true">{sinValidez}</div>}
      <div className="fc-copia">{COPIAS[copia]}</div>

      <header className="fc-cabecera">
        <div className="fc-emisor">
          <h1>{e.nombre_fantasia || e.razon_social}</h1>
          <p><b>Razón social:</b> {e.razon_social}</p>
          <p><b>Domicilio comercial:</b> {[e.domicilio, e.ciudad].filter(Boolean).join(' - ') || '—'}</p>
          <p><b>Condición frente al IVA:</b> {CONDICION_IVA[e.condicion_iva] === 'Monotributo' ? 'Responsable Monotributo' : e.condicion_iva === 'EXENTO' ? 'IVA Sujeto Exento' : CONDICION_IVA[e.condicion_iva]}</p>
        </div>
        <div className="fc-letra">
          <span>{letra}</span>
          <small>COD. {pad(c.tipo, 3)}</small>
        </div>
        <div className="fc-datos">
          <h2>{titulo}</h2>
          <p><b>Punto de venta:</b> {pad(c.punto_venta, 5)} <b style={{ marginLeft: 10 }}>Comp. nro:</b> {pad(c.numero, 8)}</p>
          <p><b>Fecha de emisión:</b> {fmtDate(c.fecha)}</p>
          <p><b>CUIT:</b> {fmtCuit(e.cuit)}</p>
          <p><b>Ingresos Brutos:</b> {e.ingresos_brutos || <span className="fc-falta">sin cargar</span>}</p>
          <p><b>Fecha de inicio de actividades:</b> {e.inicio_actividades ? fmtDate(e.inicio_actividades) : <span className="fc-falta">sin cargar</span>}</p>
        </div>
      </header>

      <section className="fc-banda fc-periodo">
        <span><b>Período facturado desde:</b> {fmtDate(c.fecha)}</span>
        <span><b>Hasta:</b> {fmtDate(c.fecha)}</span>
        <span><b>Fecha de vto. para el pago:</b> {fmtDate(c.fecha)}</span>
      </section>

      <section className="fc-banda fc-receptor">
        <p><b>{DOC_TIPO[c.receptor_doc_tipo] ?? 'Doc.'}:</b> {c.receptor_doc_tipo === 80 ? fmtCuit(c.receptor_doc_nro) : c.receptor_doc_nro}</p>
        <p><b>Apellido y nombre / Razón social:</b> {c.receptor_nombre}</p>
        <p><b>Condición frente al IVA:</b> {c.receptor_condicion_iva === 'MONOTRIBUTO' ? 'Responsable Monotributo' : c.receptor_condicion_iva === 'EXENTO' ? 'IVA Sujeto Exento' : CONDICION_IVA[c.receptor_condicion_iva]}</p>
        <p><b>Domicilio:</b> {[c.receptor_domicilio, c.receptor_ciudad].filter(Boolean).join(' - ') || '—'}</p>
        <p><b>Condición de venta:</b> Contado</p>
        {c.es_tercero && c.alumno_nombre && <p><b>Alumno:</b> {c.alumno_nombre} (DNI {c.alumno_documento})</p>}
        {c.asociado && <p className="fc-full"><b>Comprobante asociado:</b> {c.asociado.tipo_nombre} {pad(c.asociado.punto_venta, 5)}-{pad(c.asociado.numero, 8)} del {fmtDate(c.asociado.fecha)}</p>}
      </section>

      <table className="fc-detalle">
        <thead>
          {letra === 'A' ? (
            <tr><th>Código</th><th className="fc-desc">Producto / Servicio</th><th>Cant.</th><th>U. medida</th><th>Precio unit.</th><th>% Bonif</th><th>Subtotal</th><th>Alícuota IVA</th><th>Subtotal c/IVA</th></tr>
          ) : (
            <tr><th>Código</th><th className="fc-desc">Producto / Servicio</th><th>Cant.</th><th>U. medida</th><th>Precio unit.</th><th>% Bonif</th><th>Imp. bonif.</th><th>Subtotal</th></tr>
          )}
        </thead>
        <tbody>
          {items.map((it, i) => letra === 'A' ? (
            <tr key={i}><td>{it.codigo}</td><td className="fc-desc">{it.descripcion}</td><td>1,00</td><td>unidades</td><td>{$(it.neto)}</td><td>0,00</td><td>{$(it.neto)}</td><td>{money.format(c.alicuota)}%</td><td>{$(it.total)}</td></tr>
          ) : (
            <tr key={i}><td>{it.codigo}</td><td className="fc-desc">{it.descripcion}</td><td>1,00</td><td>unidades</td><td>{$(it.total)}</td><td>0,00</td><td>0,00</td><td>{$(it.total)}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="fc-pie-totales">
        {letra === 'B' && (
          <div className="fc-transparencia">
            <b>Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</b>
            <p>IVA contenido: $ {$(c.importe_iva)}</p>
            <p>Otros impuestos nacionales indirectos: $ 0,00</p>
          </div>
        )}
        <dl className="fc-totales">
          {letra === 'A' ? (
            <>
              <dt>Importe neto gravado: $</dt><dd>{$(c.importe_neto)}</dd>
              <dt>IVA {money.format(c.alicuota)}%: $</dt><dd>{$(c.importe_iva)}</dd>
              <dt>Importe otros tributos: $</dt><dd>0,00</dd>
            </>
          ) : (
            <>
              <dt>Subtotal: $</dt><dd>{$(c.importe_total)}</dd>
              <dt>Importe otros tributos: $</dt><dd>0,00</dd>
            </>
          )}
          <dt className="fc-total">Importe total: $</dt><dd className="fc-total">{$(c.importe_total)}</dd>
        </dl>
      </div>

      <footer className="fc-autorizacion">
        <div className="fc-qr">
          {sinValidez ? <div className="fc-qr-vacio">Sin código QR:<br />comprobante sin validez fiscal</div> : qr ? <img src={qr} alt="Código QR del comprobante (ARCA)" /> : null}
        </div>
        <div className="fc-leyenda">
          <b>{sinValidez ? 'Comprobante sin validez fiscal' : 'Comprobante autorizado'}</b>
          <p>{sinValidez ? (c.simulado ? 'El CAE fue generado por simulación y no fue emitido por ARCA.' : 'Autorizado en el entorno de homologación de ARCA.') : 'Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación.'}</p>
        </div>
        <dl className="fc-cae">
          <dt>CAE N°:</dt><dd>{c.cae}</dd>
          <dt>Fecha de vto. de CAE:</dt><dd>{fmtDate(c.venc_cae)}</dd>
        </dl>
      </footer>
    </article>
  )
}

export default function Imprimir() {
  const [params] = useSearchParams()
  const ids = params.get('ids') ?? ''
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [copias, setCopias] = useState(['ORIGINAL'])

  useEffect(() => {
    document.title = 'Imprimir comprobantes'
    api.get('/impresion/comprobantes', { ids }).then(setData).catch((e) => setError(e.message))
  }, [ids])

  const toggleCopia = (k) => setCopias((s) => (s.includes(k) ? s.filter((x) => x !== k) : Object.keys(COPIAS).filter((x) => x === k || s.includes(x))))

  if (error) return <div className="fc-barra"><p>{error}</p></div>
  if (!data) return <div className="fc-barra"><p>Preparando comprobantes…</p></div>

  return (
    <div className="fc-raiz">
      <div className="fc-barra">
        <strong>{data.comprobantes.length} {data.comprobantes.length === 1 ? 'comprobante' : 'comprobantes'}</strong>
        {data.omitidos > 0 && <span className="fc-aviso">{data.omitidos} sin autorizar no se incluyen: solo se imprimen comprobantes con CAE.</span>}
        <span className="fc-copias">
          {Object.keys(COPIAS).map((k) => (
            <label key={k}><input type="checkbox" checked={copias.includes(k)} onChange={() => toggleCopia(k)} disabled={copias.length === 1 && copias.includes(k)} /> {COPIAS[k].toLowerCase()}</label>
          ))}
        </span>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!data.comprobantes.length}><Printer size={16} /> Imprimir</button>
      </div>
      {data.comprobantes.length === 0 && <div className="fc-barra"><p>No hay comprobantes autorizados para imprimir.</p></div>}
      {data.comprobantes.flatMap((c) => copias.map((k) => <Comprobante key={`${c.id}-${k}`} c={c} copia={k} />))}
    </div>
  )
}
