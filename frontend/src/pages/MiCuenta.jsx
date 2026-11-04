import { useState } from 'react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Button, Field, PageHead, useAction } from '../components/ui'
import { MARCA } from '../lib/format'

export default function MiCuenta() {
  const { usuario, centros, tema, setTema, refresh, esStaff } = useSession()
  const [pref, setPref] = useState(usuario.centro_preferido_id ?? '')
  const [run, busy] = useAction()

  return (
    <div className="page">
      <PageHead title="Mis preferencias">{usuario.nombre} {usuario.apellido} · DNI {usuario.documento} · ingresaste con {MARCA[usuario.sistema]}{esStaff ? ' · staff' : ''}</PageHead>
      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-body" style={{ display: 'grid', gap: 18 }}>
          <Field label="Tema de la interfaz" htmlFor="mc-tema" hint="También se cambia desde el ícono de sol o luna de la barra superior.">
            <select id="mc-tema" className="select" value={tema} onChange={(e) => setTema(e.target.value)}>
              <option value="sistema">Igual que el sistema operativo</option>
              <option value="claro">Claro</option>
              <option value="oscuro">Oscuro</option>
            </select>
          </Field>
          <Field label="Sede al ingresar" htmlFor="mc-sede" hint="La sede que se selecciona al abrir el sistema en un equipo nuevo.">
            <select id="mc-sede" className="select" value={pref} onChange={(e) => setPref(e.target.value)}>
              <option value="">La primera disponible</option>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
          <div>
            <Button variant="primary" loading={busy} onClick={async () => {
              if (await run(() => api.put('/auth/preferencias', { centro_preferido_id: pref ? Number(pref) : null }), 'Preferencias guardadas.')) refresh()
            }}>Guardar preferencias</Button>
          </div>
        </div>
      </section>
    </div>
  )
}
