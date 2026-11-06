<?php
declare(strict_types=1);

/*
 * Adaptadores de las APIs externas. Cada función documenta el contrato que espera.
 * Con la configuración "modo_simulacion" = 1 se responden datos de prueba deterministas,
 * para poder operar el sistema completo antes de conectar los servicios reales.
 */

const CONF_SECRETAS = ['token_pagos_eddis', 'token_arca', 'token_usuarios'];

function conf_all(bool $refresh = false): array
{
    static $cache = null;
    if ($cache === null || $refresh) {
        $cache = [];
        foreach (q_all('SELECT clave, valor, secreto FROM configuracion') as $r) {
            $cache[$r['clave']] = (int)$r['secreto'] === 1 ? decrypt_secret($r['valor']) : $r['valor'];
        }
    }
    return $cache;
}

function conf(string $k, string $default = ''): string
{
    $v = conf_all()[$k] ?? null;
    return $v === null || $v === '' ? $default : (string)$v;
}

function simulacion(): bool
{
    return conf('modo_simulacion', '0') === '1';
}

/** La simulación solo reemplaza a los servicios que no tienen URL configurada. */
function simular(string $claveUrl): bool
{
    return simulacion() && conf($claveUrl) === '';
}

function http_json(string $method, string $url, ?string $token = null, ?array $payload = null, array $query = [], int $timeout = 0): array
{
    if ($url === '') throw new ExternalApiError('La URL del servicio no está configurada. Completala en Utilidades → Configuración.');
    if ($query) $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($query);

    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($token) $headers[] = 'Authorization: Bearer ' . $token;
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => max(3, $timeout ?: (int)conf('timeout_segundos', '20')),
        CURLOPT_CONNECTTIMEOUT => 8,
    ]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $host = parse_url($url, PHP_URL_HOST) ?: $url;
    if ($raw === false) throw new ExternalApiError("No hubo respuesta de {$host}: {$err}");
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) {
        // Algunos servidores anteponen avisos de PHP al JSON: se intenta leer desde el primer objeto.
        $i = strpos((string)$raw, '{');
        if ($i !== false && $i > 0) $data = json_decode(substr((string)$raw, $i), true);
    }
    if ($status >= 500) throw new ExternalApiError("{$host} respondió con error {$status}.");
    if (!is_array($data)) throw new ExternalApiError("{$host} devolvió una respuesta que no es JSON (HTTP {$status}).");
    $data['_http_status'] = $status;
    return $data;
}

/* ------------------------------------------------------------------ *
 * Validación de usuarios
 * POST {url_validacion_eddis | url_validacion_sb}
 *   { "documento": "...", "clave": "..." }
 * → { "existe": bool, "valido": bool, "nombre": "", "apellido": "", "autorizado_facturar": bool }
 * ------------------------------------------------------------------ */
function api_validar_usuario(string $sistema, string $documento, string $clave): array
{
    if (simular($sistema === 'EDDIS' ? 'url_validacion_eddis' : 'url_validacion_sb')) {
        // Eddis conoce los documentos que no empiezan con 4; Studio Beauty, los que sí.
        $existe = $sistema === 'EDDIS' ? !str_starts_with($documento, '4') : str_starts_with($documento, '4');
        return [
            'existe' => $existe,
            'valido' => $existe && $clave === 'demo',
            'nombre' => null,
            'apellido' => null,
            'autorizado_facturar' => $documento !== '99999999',
        ];
    }
    $url = conf($sistema === 'EDDIS' ? 'url_validacion_eddis' : 'url_validacion_sb');
    $r = http_json('POST', $url, null, ['documento' => $documento, 'clave' => $clave]);
    return [
        'existe' => ($r['_http_status'] ?? 200) !== 404 && (bool)($r['existe'] ?? false),
        'valido' => (bool)($r['valido'] ?? false),
        'nombre' => $r['nombre'] ?? null,
        'apellido' => $r['apellido'] ?? null,
        'autorizado_facturar' => (bool)($r['autorizado_facturar'] ?? false),
    ];
}

/* ------------------------------------------------------------------ *
 * Usuarios y centros de Eddis y Studio Beauty (api_fac_feddis.php de Eddis)
 * POST {url_api_eddis}  Authorization: Bearer {token_api_eddis}
 *   { "accion": "validar" | "usuarios" | "usuario" | "centros", "sistema": "ar" | "set", ... }
 * Eddis compara la clave (md5 contra claveint): el hash nunca llega a este sistema.
 * usuario = { id, nombre, apellido, documento, email, centro, otroscentros, facturacion, tiene_clave }
 * ------------------------------------------------------------------ */
function api_eddis(string $marca, string $accion, array $datos = []): array
{
    $token = conf('token_api_eddis');
    if (conf('url_api_eddis') === '') {
        throw new ExternalApiError('Falta la URL de la API de usuarios de Eddis. Completala en Utilidades → Configuración.');
    }
    $sistema = $marca === 'SB' ? conf('pais_sistema_sb', 'set') : conf('pais_sistema', 'ar');
    // El token va también en el cuerpo: algunos servidores no pasan el encabezado Authorization a PHP.
    $r = http_json('POST', conf('url_api_eddis'), $token, ['accion' => $accion, 'sistema' => $sistema, 'token' => $token] + $datos);
    $status = $r['_http_status'] ?? 200;
    if ($status >= 400) {
        $nombre = $marca === 'SB' ? 'Studio Beauty' : 'Eddis';
        throw new ExternalApiError("La API de {$nombre} respondió {$status}: " . ($r['error'] ?? 'sin detalle') . '.');
    }
    return $r;
}

/** Valida documento y clave en la base de la marca. → { existe, valido, usuario|null } */
function origen_validar(string $marca, string $documento, string $clave): array
{
    $r = api_eddis($marca, 'validar', ['documento' => $documento, 'clave' => $clave]);
    return ['existe' => (bool)($r['existe'] ?? false), 'valido' => (bool)($r['valido'] ?? false), 'usuario' => $r['usuario'] ?? null];
}

/** Filas de edd_users con ese documento (puede haber varias). */
function origen_usuarios_por_documento(string $origen, string $documento): array
{
    return (array)(api_eddis($origen, 'usuarios', ['documento' => $documento])['usuarios'] ?? []);
}

function origen_usuario_por_id(string $origen, int $id): ?array
{
    return api_eddis($origen, 'usuario', ['id' => $id])['usuario'] ?? null;
}

/** Centros de edd_centro: los de esos ids, o todos los activos si $ids es null. → [ {id, nombre, activo} ] */
function origen_centros(string $marca, ?array $ids): array
{
    if ($ids !== null && !$ids) return [];
    return (array)(api_eddis($marca, 'centros', $ids === null ? [] : ['ids' => array_values($ids)])['centros'] ?? []);
}

/* ------------------------------------------------------------------ *
 * Pagos del sistema de gestión Eddis (api_pagos.php de Eddis)
 * GET {url_pagos_eddis}?centro={edd_centro.id}&fechadesde=AAAA-MM-DD&fechahasta=AAAA-MM-DD
 *     &cuota99=0|1&importe99=0&paissistema=ar
 * → { "respuesta": 200, "data": [ { "id", "centro", "idalu", "legajo", "alumno", "documento", "idcur",
 *       "curso", "cuota", "fechapago", "importe", "fpago", "direccion", "email", "ciudad", "iva" } ] }
 * Reglas de la API: centro 9999 = Central (pagos por MercadoPago de todos los centros);
 * con cuota99=0 excluye los pagos por MercadoPago; importe = importe + importe2 si la cuota es < 90.
 * ------------------------------------------------------------------ */
// La API de pagos arma los datos fila por fila y puede tardar más de 30 segundos.
const TIMEOUT_PAGOS = 120;

function api_pagos(array $centro, string $desde, string $hasta, bool $cuota99 = false): array
{
    if (simular('url_pagos_eddis')) return sim_pagos($centro, $desde, $hasta);

    $codigo = trim((string)$centro['codigo_eddis']);
    if (!ctype_digit($codigo)) {
        throw new HttpError(409, "El centro {$centro['nombre']} no tiene un código de Eddis numérico (edd_centro.id). Cargalo en Utilidades → Centros.");
    }
    $r = http_json('GET', conf('url_pagos_eddis'), conf('token_pagos_eddis'), null, [
        'centro' => $codigo,
        'fechadesde' => $desde,
        'fechahasta' => $hasta,
        'cuota99' => $cuota99 ? 1 : 0,
        'importe99' => 0,
        // La misma API sirve a Eddis y a Studio Beauty: paissistema elige la base (ar → eddis_ar, set → eddis_set).
        'paissistema' => $centro['marca'] === 'SB' ? conf('pais_sistema_sb', 'set') : conf('pais_sistema', 'ar'),
    ], TIMEOUT_PAGOS);
    if ((int)($r['respuesta'] ?? 200) !== 200) {
        throw new ExternalApiError('La API de pagos de Eddis respondió con código ' . ($r['respuesta'] ?? '?') . '.');
    }
    $lista = $r['data'] ?? $r['pagos'] ?? (array_is_list($r) ? $r : []);
    $origen = $codigo === '9999' ? 'CENTRAL' : 'PROPIO';
    $out = [];
    foreach ($lista as $p) {
        if (!isset($p['id'], $p['importe'])) continue;
        $cuota = isset($p['cuota']) ? (int)$p['cuota'] : (isset($p['nro_cuota']) ? (int)$p['nro_cuota'] : null);
        $curso = trim((string)($p['curso'] ?? $p['concepto'] ?? ''));
        $out[] = [
            'id' => (string)$p['id'],
            'fecha' => substr((string)($p['fechapago'] ?? $p['fecha'] ?? ''), 0, 10),
            'documento' => preg_replace('/\D/', '', (string)($p['documento'] ?? '')),
            'alumno' => trim((string)($p['alumno'] ?? '')),
            'nro_cuota' => $cuota,
            'concepto' => $cuota === 99 ? 'Derecho de examen' . ($curso !== '' ? " · {$curso}" : '') : ($curso !== '' ? "{$curso} · cuota {$cuota}" : "Cuota {$cuota}"),
            'importe' => round((float)$p['importe'], 2),
            'origen' => strtoupper((string)($p['origen'] ?? $origen)) === 'CENTRAL' ? 'CENTRAL' : 'PROPIO',
            'forma_pago' => trim((string)($p['fpago'] ?? '')) ?: null,
            'legajo' => trim((string)($p['legajo'] ?? '')) ?: null,
        ];
    }
    return $out;
}

/* ------------------------------------------------------------------ *
 * Usuarios autorizados (combo de alta)
 * GET {url_usuarios} → { "usuarios": [ { "documento", "nombre", "apellido" } ] }
 * ------------------------------------------------------------------ */
function api_usuarios_disponibles(): array
{
    if (simulacion()) {
        return [
            ['documento' => '11111111', 'nombre' => 'Gustavo', 'apellido' => 'Administrador'],
            ['documento' => '22222222', 'nombre' => 'Carla', 'apellido' => 'Ríos'],
            ['documento' => '33333333', 'nombre' => 'Martín', 'apellido' => 'Paz'],
            ['documento' => '44444444', 'nombre' => 'Valentina', 'apellido' => 'Suárez'],
            ['documento' => '45555555', 'nombre' => 'Rocío', 'apellido' => 'Medina'],
            ['documento' => '36666666', 'nombre' => 'Diego', 'apellido' => 'Herrera'],
            ['documento' => '37777777', 'nombre' => 'Florencia', 'apellido' => 'Castro'],
        ];
    }
    $r = http_json('GET', conf('url_usuarios'), conf('token_usuarios'));
    $lista = $r['usuarios'] ?? (array_is_list($r) ? $r : []);
    return array_values(array_filter(array_map(fn($u) => [
        'documento' => preg_replace('/\D/', '', (string)($u['documento'] ?? '')),
        'nombre' => (string)($u['nombre'] ?? ''),
        'apellido' => (string)($u['apellido'] ?? ''),
    ], $lista), fn($u) => $u['documento'] !== ''));
}

/* ------------------------------------------------------------------ *
 * ARCA (a través de la API que resuelve WSAA/WSFE)
 * POST {url_arca}/autorizar  { cuit, punto_venta, tipo, concepto, fecha, receptor{...}, importes{...}, asociado{...}, homologacion }
 *   → { "resultado": "A"|"R", "numero", "cae", "cae_vencimiento", "errores": ["..."] }
 * GET  {url_arca}/consultar?cuit&punto_venta&tipo&numero&homologacion
 *   → { "encontrado": bool, "comprobante": { ... } }
 * GET  {url_arca}/ultimo?cuit&punto_venta&tipo&homologacion → { "numero": N }
 * ------------------------------------------------------------------ */
/** Cada CUIT elige si la autorización en ARCA es simulada o real (cuit.arca_simulado). */
function arca_simulado(array $cuit): bool
{
    return (int)($cuit['arca_simulado'] ?? 1) === 1;
}

/** Certificado y clave privada (PEM) cargados para el CUIT, o null si no tiene. */
function cuit_certificado(array $cuit): ?array
{
    if (empty($cuit['certificado_crt']) || empty($cuit['certificado_key'])) return null;
    $key = decrypt_secret($cuit['certificado_key']);
    return $key === null ? null : ['crt' => $cuit['certificado_crt'], 'key' => $key];
}

function exigir_url_arca(): void
{
    if (conf('url_arca') === '') {
        throw new ExternalApiError('El CUIT usa autorización real, pero falta la URL de la API de ARCA en Utilidades → Configuración.');
    }
}

function api_arca_autorizar(array $payload, bool $simulado): array
{
    if ($simulado) return sim_arca_autorizar($payload);
    exigir_url_arca();
    $r = http_json('POST', rtrim(conf('url_arca'), '/') . '/autorizar', conf('token_arca'), $payload);
    $ok = strtoupper((string)($r['resultado'] ?? '')) === 'A' && !empty($r['cae']);
    $errores = $r['errores'] ?? $r['observaciones'] ?? ($r['error'] ?? null);
    return [
        'ok' => $ok,
        'numero' => isset($r['numero']) ? (int)$r['numero'] : null,
        'cae' => $ok ? (string)$r['cae'] : null,
        'venc_cae' => $ok ? substr((string)($r['cae_vencimiento'] ?? ''), 0, 10) : null,
        'error' => $ok ? null : (is_array($errores) ? implode(' · ', array_map('strval', $errores)) : ((string)$errores ?: 'ARCA rechazó el comprobante sin detalle.')),
    ];
}

function api_arca_consultar(array $cuit, int $tipo, int $numero): array
{
    $homolog = (int)$cuit['modo_prueba'] === 1;
    if (arca_simulado($cuit)) {
        $c = q_one('SELECT * FROM comprobante WHERE cuit_id = ? AND tipo = ? AND numero = ? AND modo_prueba = ? AND simulado = 1 AND estado = "AUTORIZADO"',
            [$cuit['id'], $tipo, $numero, $homolog ? 1 : 0]);
        if (!$c) return ['encontrado' => false];
        return ['encontrado' => true, 'comprobante' => [
            'tipo' => (int)$c['tipo'], 'punto_venta' => (int)$c['punto_venta'], 'numero' => (int)$c['numero'],
            'fecha' => $c['fecha'], 'cae' => $c['cae'], 'cae_vencimiento' => $c['venc_cae'],
            'receptor_doc_tipo' => (int)$c['receptor_doc_tipo'], 'receptor_doc_nro' => $c['receptor_doc_nro'],
            'importe_neto' => (float)$c['importe_neto'], 'importe_iva' => (float)$c['importe_iva'], 'importe_total' => (float)$c['importe_total'],
            'resultado' => 'A',
        ]];
    }
    exigir_url_arca();
    $r = http_json('GET', rtrim(conf('url_arca'), '/') . '/consultar', conf('token_arca'), null, [
        'cuit' => $cuit['cuit'], 'punto_venta' => $cuit['punto_venta'], 'tipo' => $tipo, 'numero' => $numero, 'homologacion' => $homolog ? 1 : 0,
    ]);
    return ['encontrado' => (bool)($r['encontrado'] ?? false), 'comprobante' => $r['comprobante'] ?? null];
}

function api_arca_ultimo(array $cuit, int $tipo): int
{
    $homolog = (int)$cuit['modo_prueba'] === 1;
    if (arca_simulado($cuit)) {
        return (int)q_val('SELECT COALESCE(MAX(numero),0) FROM comprobante WHERE cuit_id = ? AND punto_venta = ? AND tipo = ? AND modo_prueba = ? AND simulado = 1',
            [$cuit['id'], $cuit['punto_venta'], $tipo, $homolog ? 1 : 0]);
    }
    exigir_url_arca();
    $r = http_json('GET', rtrim(conf('url_arca'), '/') . '/ultimo', conf('token_arca'), null, [
        'cuit' => $cuit['cuit'], 'punto_venta' => $cuit['punto_venta'], 'tipo' => $tipo, 'homologacion' => $homolog ? 1 : 0,
    ]);
    return (int)($r['numero'] ?? 0);
}

/* ---------- Simulación ---------- */

function sim_pagos(array $centro, string $desde, string $hasta): array
{
    static $alumnos = [
        ['30111222', 'Sofía Benítez'], ['31222333', 'Camila Acosta'], ['32333444', 'Lucía Fernández'],
        ['33444555', 'Martina López'], ['34555666', 'Agustina Romero'], ['35666777', 'Julieta Sosa'],
        ['36777888', 'Milagros Torres'], ['37888999', 'Abril Díaz'], ['38999000', 'Micaela Ruiz'],
        ['39000111', 'Belén Álvarez'], ['40111222', 'Antonella Pereyra'], ['41222333', 'Rocío Giménez'],
        ['42333444', 'Daiana Molina'], ['43444555', 'Brenda Ortiz'], ['29555666', 'Nicolás Silva'],
        ['28666777', 'Tomás Rojas'], ['27777888', 'Paula Núñez'], ['26888999', 'Carolina Vega'],
    ];
    $conceptos = $centro['marca'] === 'SB'
        ? ['Curso de maquillaje profesional', 'Curso de uñas esculpidas', 'Curso de lifting de pestañas', 'Curso de cosmetología']
        : ['Peluquería profesional', 'Colorimetría avanzada', 'Barbería', 'Estética integral'];

    $out = [];
    $d = new DateTimeImmutable($desde);
    $fin = new DateTimeImmutable($hasta);
    while ($d <= $fin) {
        $dow = (int)$d->format('N');
        $seedDia = crc32($centro['id'] . '|' . $d->format('Ymd'));
        $cant = $dow === 7 ? 0 : 2 + ($seedDia % 5);
        for ($i = 0; $i < $cant; $i++) {
            $s = crc32($seedDia . '-' . $i);
            [$doc, $nombre] = $alumnos[$s % count($alumnos)];
            $cuota = ($s % 17 === 0) ? 99 : 1 + ($s % 10);
            $base = $centro['marca'] === 'SB' ? 52000 : 68000;
            $importe = $cuota === 99 ? 18500 : $base + (($s >> 4) % 9) * 3500;
            $out[] = [
                'id' => sprintf('SIM-%d-%s-%02d', $centro['id'], $d->format('Ymd'), $i),
                'fecha' => $d->format('Y-m-d'),
                'documento' => $doc,
                'alumno' => $nombre,
                'nro_cuota' => $cuota,
                'concepto' => $cuota === 99 ? 'Derecho de examen' : $conceptos[($s >> 2) % count($conceptos)] . " · cuota {$cuota}",
                'importe' => (float)$importe,
                'origen' => (($s >> 3) % 3 === 0) ? 'CENTRAL' : 'PROPIO',
            ];
        }
        $d = $d->modify('+1 day');
    }
    return $out;
}

function sim_arca_autorizar(array $p): array
{
    $errores = [];
    if (!empty($p['_certificado_vencido'])) $errores[] = 'El certificado digital del CUIT está vencido.';
    if (in_array($p['tipo'], [1, 3], true) && (int)$p['receptor']['doc_tipo'] !== 80) {
        $errores[] = 'El receptor de un comprobante A debe identificarse con CUIT.';
    }
    if ($p['importes']['total'] <= 0) $errores[] = 'El importe total debe ser mayor a cero.';
    if ($errores) return ['ok' => false, 'numero' => null, 'cae' => null, 'venc_cae' => null, 'error' => implode(' · ', $errores)];

    // Numeración simulada propia: correlativa por CUIT, punto de venta y tipo, separada de la real.
    $numero = (int)q_val('SELECT COALESCE(MAX(numero),0) FROM comprobante WHERE cuit_id = ? AND punto_venta = ? AND tipo = ? AND modo_prueba = ? AND simulado = 1',
        [$p['_cuit_id'], $p['punto_venta'], $p['tipo'], $p['homologacion'] ? 1 : 0]) + 1;
    $cae = '7' . str_pad((string)random_int(0, 9999999999999), 13, '0', STR_PAD_LEFT);
    return [
        'ok' => true,
        'numero' => $numero,
        'cae' => $cae,
        'venc_cae' => (new DateTimeImmutable($p['fecha']))->modify('+10 days')->format('Y-m-d'),
        'error' => null,
    ];
}
