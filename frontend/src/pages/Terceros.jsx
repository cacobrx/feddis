import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Alert, Button, Confirm, Empty, Field, Loading, Modal, PageHead, useAction, useApi, useForm } from '../components/ui'
import { CONDICION_IVA, fmtCuit } from '../lib/format'

const VACIO = { documento_alumno: '', nombre_alumno: '', razon_social: '', direccion: '', ciudad: '', cuit: '', condicion_iva: 'RI' }

export default function Terceros() {
  const { centro, centroId } = useSession()
  const { data, loading, error, reload } = useApi('/terceros', { centro_id: centroId })
  const [edit, setEdit] = useState(null)
  const [borrar, setBorrar] = useState(null)
  const [q, setQ] = useState('')
  const [run] = useAction()

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (data ?? []).filter((r) => !t || [r.documento_alumno, r.nombre_alumno, r.razon_social, r.cuit].some((x) => (x ?? '').toLowerCase().includes(t)))
  }, [data, q])

  return (
    <div className="page">
      <PageHead title="Datos de terceros" actions={<Button variant="primary" onClick={() => setEdit({ ...VACIO })}><Plus size={16} /> Agregar empresa</Button>}>
        Alumnos de {centro?.nombre} cuyas facturas se emiten a nombre de una empresa. Se aplica en forma automática al generar comprobantes.
      </PageHead>
      {error && <Alert kind="bad">{error}</Alert>}
      <div className="filters"><Field label="Buscar" className="wide" htmlFor="t-q"><input id="t-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Documento, alumno, empresa o CUIT" /></Field></div>
      <section className="panel">
        {loading && !data ? <Loading /> : !lista.length ? (
          <Empty title={data?.length ? 'Ningún registro coincide con la búsqueda' : 'Todavía no hay datos de terceros'}>
            {!data?.length && 'Agregá una empresa cuando un alumno necesite que se le facture a ella.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Alumno</th><th>Factura a</th><th>CUIT</th><th>Condición IVA</th><th>Domicilio</th><th></th></tr></thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nombre_alumno || <span className="muted">Sin nombre</span>}<div className="small muted">DNI {t.documento_alumno}</div></td>
                    <td>{t.razon_social}</td>
                    <td className="nowrap">{fmtCuit(t.cuit)}</td>
                    <td>{CONDICION_IVA[t.condicion_iva]}</td>
                    <td>{[t.direccion, t.ciudad].filter(Boolean).join(', ') || <span className="muted">—</span>}</td>
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      <button className="icon-btn" onClick={() => setEdit({ ...VACIO, ...t, nombre_alumno: t.nombre_alumno ?? '', direccion: t.direccion ?? '', ciudad: t.ciudad ?? '' })} aria-label="Editar" title="Editar"><Pencil size={16} /></button>
                      <button className="icon-btn" onClick={() => setBorrar(t)} aria-label="Eliminar" title="Eliminar"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {edit && <TerceroForm inicial={edit} centroId={centroId} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {borrar && (
        <Confirm title="Eliminar datos de terceros" danger confirmLabel="Eliminar" onClose={() => setBorrar(null)}
          onConfirm={async () => { if (await run(() => api.del(`/terceros/${borrar.id}`), 'Registro eliminado.')) reload() }}
          message={`Las próximas facturas de DNI ${borrar.documento_alumno} se emitirán al alumno y no a ${borrar.razon_social}. Los comprobantes ya generados no cambian.`} />
      )}
    </div>
  )
}

function TerceroForm({ inicial, centroId, onClose, onSaved }) {
  const { values: v, set, errors, fail } = useForm(inicial)
  const [run, busy] = useAction()
  const nuevo = !inicial.id

  const save = async (e) => {
    e.preventDefault()
    const payload = { ...v, centro_id: centroId, cuit: String(v.cuit).replace(/\D/g, ''), documento_alumno: String(v.documento_alumno).replace(/\D/g, '') }
    const ok = await run(() => (nuevo ? api.post('/terceros', payload) : api.put(`/terceros/${v.id}`, payload)),
      nuevo ? 'Empresa agregada.' : 'Cambios guardados.', fail)
    if (ok) onSaved()
  }
  const f = (k, label, props = {}) => (
    <Field label={label} error={errors[k]} htmlFor={`t-${k}`}>
      <input id={`t-${k}`} className="input" value={v[k] ?? ''} onChange={set(k)} aria-invalid={!!errors[k]} {...props} />
    </Field>
  )

  return (
    <Modal title={nuevo ? 'Agregar empresa' : 'Editar datos de terceros'} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" type="submit" form="t-form" loading={busy}>{nuevo ? 'Agregar empresa' : 'Guardar cambios'}</Button>
    </>}>
      <form id="t-form" onSubmit={save} className="grid-form">
        {f('documento_alumno', 'Documento del alumno', { required: true, inputMode: 'numeric' })}
        {f('nombre_alumno', 'Nombre del alumno')}
        {f('razon_social', 'Razón social de la empresa', { required: true })}
        {f('cuit', 'CUIT', { required: true, inputMode: 'numeric' })}
        <Field label="Condición IVA" error={errors.condicion_iva} htmlFor="t-iva">
          <select id="t-iva" className="select" value={v.condicion_iva} onChange={set('condicion_iva')}>
            {Object.entries(CONDICION_IVA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {f('direccion', 'Dirección')}
        {f('ciudad', 'Ciudad')}
      </form>
    </Modal>
  )
}
