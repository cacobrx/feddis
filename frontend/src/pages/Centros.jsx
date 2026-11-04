import { useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Alert, Button, Empty, Field, Loading, Modal, PageHead, Switch, useAction, useApi, useForm } from '../components/ui'
import { MARCA } from '../lib/format'

export default function Centros() {
  const { refresh } = useSession()
  const { data, loading, error, reload } = useApi('/centros')
  const [edit, setEdit] = useState(null)
  return (
    <div className="page">
      <PageHead title="Centros" actions={<Button variant="primary" onClick={() => setEdit({ nombre: '', marca: 'EDDIS', codigo_eddis: '', activo: true })}><Plus size={16} /> Agregar centro</Button>}>
        Sedes de Eddis y Studio Beauty. El código en Eddis es el que se envía a la API de pagos.
      </PageHead>
      {error && <Alert kind="bad">{error}</Alert>}
      <section className="panel">
        {loading && !data ? <Loading /> : !data?.length ? <Empty title="No hay centros cargados" /> : (
          <table className="data">
            <thead><tr><th>Centro</th><th>Marca</th><th>Código en Eddis</th><th>CUIT</th><th className="num">Usuarios</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className={c.activo ? '' : 'is-disabled'}>
                  <td>{c.nombre}</td>
                  <td>{MARCA[c.marca]}</td>
                  <td>{c.codigo_eddis ?? <span className="muted">—</span>}</td>
                  <td>{c.tiene_cuit ? 'Cargado' : <span className="badge badge-warn">Falta</span>}</td>
                  <td className="num">{c.usuarios}</td>
                  <td>{c.activo ? <span className="badge badge-ok">Activo</span> : <span className="badge">Inactivo</span>}</td>
                  <td style={{ textAlign: 'right' }}><button className="icon-btn" onClick={() => setEdit({ ...c, codigo_eddis: c.codigo_eddis ?? '' })} aria-label="Editar" title="Editar"><Pencil size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {edit && <CentroForm inicial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); refresh() }} />}
    </div>
  )
}

function CentroForm({ inicial, onClose, onSaved }) {
  const { values: v, set, errors, fail } = useForm(inicial)
  const [run, busy] = useAction()
  const save = async (e) => {
    e.preventDefault()
    const ok = await run(() => (inicial.id ? api.put(`/centros/${inicial.id}`, v) : api.post('/centros', v)), inicial.id ? 'Cambios guardados.' : 'Centro agregado.', fail)
    if (ok) onSaved()
  }
  return (
    <Modal title={inicial.id ? `Editar ${inicial.nombre}` : 'Agregar centro'} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" type="submit" form="ce-form" loading={busy}>{inicial.id ? 'Guardar cambios' : 'Agregar centro'}</Button>
    </>}>
      <form id="ce-form" onSubmit={save} className="grid-form">
        <Field label="Nombre" error={errors.nombre} htmlFor="ce-n"><input id="ce-n" className="input" value={v.nombre} onChange={set('nombre')} required /></Field>
        <Field label="Marca" error={errors.marca} htmlFor="ce-m">
          <select id="ce-m" className="select" value={v.marca} onChange={set('marca')}><option value="EDDIS">Eddis</option><option value="SB">Studio Beauty</option></select>
        </Field>
        <Field label="Código en Eddis" error={errors.codigo_eddis} htmlFor="ce-c"><input id="ce-c" className="input" value={v.codigo_eddis} onChange={set('codigo_eddis')} /></Field>
        <div style={{ alignSelf: 'end', paddingBottom: 8 }}><Switch checked={v.activo} onChange={set('activo')} label="Activo" /></div>
      </form>
    </Modal>
  )
}
