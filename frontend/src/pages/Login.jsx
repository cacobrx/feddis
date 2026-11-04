import { useState } from 'react'
import { useSession } from '../context/Session'
import { Alert, Button, Field } from '../components/ui'
import Logo from '../components/Logo'

export default function Login() {
  const { login } = useSession()
  const [documento, setDocumento] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(documento.trim(), clave)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <div className="marcas" style={{ gap: 28 }}>
          <Logo marca="EDDIS" inverse height={28} />
          <Logo marca="SB" inverse height={28} />
        </div>
        <div>
          <h1>De los pagos de alumnos a la factura autorizada.</h1>
          <p>Elegí los pagos del mes, controlá el tope del CUIT y autorizá los comprobantes en ARCA para cada centro de Eddis y Studio Beauty.</p>
        </div>
        <div className="ticket">
          <div className="t-row"><span>Factura B</span><span>00003-00001284</span></div>
          <div className="t-row"><span>Peluquería profesional · cuota 4</span><span>$ 78.500,00</span></div>
          <div className="t-row"><span>IVA 21% incluido</span><span>$ 13.623,97</span></div>
          <div className="t-big"><span>Total</span><span>$ 78.500,00</span></div>
          <div className="t-cae">CAE 74218830519246 · vence 13/11</div>
        </div>
        <small style={{ color: '#aab3ef' }}>Eddisfac · SBFac</small>
      </section>

      <section className="login-form">
        <div>
          <h1 style={{ fontSize: 24 }}>Ingresar</h1>
          <p className="muted" style={{ marginTop: 6 }}>Usá tu documento y la clave de Eddis. Si no tenés usuario en Eddis, usá la de Studio Beauty.</p>
        </div>
        <form onSubmit={submit} noValidate>
          <Field label="Documento" htmlFor="doc">
            <input id="doc" className="input" inputMode="numeric" autoComplete="username" value={documento}
              onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </Field>
          <Field label="Clave" htmlFor="clave">
            <input id="clave" className="input" type="password" autoComplete="current-password" value={clave}
              onChange={(e) => setClave(e.target.value)} required />
          </Field>
          {error && <Alert kind="bad">{error}</Alert>}
          <Button variant="primary" type="submit" loading={busy} disabled={!documento || !clave}>Ingresar</Button>
        </form>
      </section>
    </div>
  )
}
