const BASE = import.meta.env.VITE_API ?? '/eddisfac2/api/index.php'

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Error ${status}`)
    this.status = status
    this.data = data
  }
}

async function request(method, path, { query, body } = {}) {
  let url = BASE + path
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    if ([...qs].length) url += '?' + qs
  }
  let res
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'eddisfac', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, { error: 'No hay conexión con el servidor. Revisá tu red e intentá de nuevo.' })
  }
  let data = null
  try { data = await res.json() } catch { /* respuesta vacía */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(res.status, data ?? { error: `El servidor respondió ${res.status}.` })
  }
  return data
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body = {}) => request('POST', path, { body }),
  put: (path, body = {}) => request('PUT', path, { body }),
  del: (path) => request('DELETE', path),
}
