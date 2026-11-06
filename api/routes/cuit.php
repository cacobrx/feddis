<?php
declare(strict_types=1);

const CUIT_CAMPOS_BASE = ['razon_social', 'nombre_fantasia', 'domicilio', 'ciudad', 'cuit', 'condicion_iva', 'ingresos_brutos', 'alicuota', 'punto_venta',
    'inicio_actividades', 'venc_certificado', 'tope_facturacion', 'modo_prueba', 'arca_simulado'];
const CUIT_CAMPOS_STAFF = ['centro_id', 'importar_cuota_99'];

function cuit_publico(array $r, bool $staff): array
{
    $out = [
        'id' => (int)$r['id'],
        'centro_id' => (int)$r['centro_id'],
        'centro_nombre' => $r['centro_nombre'] ?? null,
        'centro_marca' => $r['centro_marca'] ?? null,
        'cuit' => $r['cuit'],
        'razon_social' => $r['razon_social'],
        'nombre_fantasia' => $r['nombre_fantasia'],
        'domicilio' => $r['domicilio'],
        'ciudad' => $r['ciudad'],
        'condicion_iva' => $r['condicion_iva'],
        'ingresos_brutos' => $r['ingresos_brutos'],
        'alicuota' => (float)$r['alicuota'],
        'punto_venta' => (int)$r['punto_venta'],
        'inicio_actividades' => $r['inicio_actividades'],
        'venc_certificado' => $r['venc_certificado'],
        'tope_facturacion' => (float)$r['tope_facturacion'],
        'modo_prueba' => (bool)$r['modo_prueba'],
        'arca_simulado' => (bool)$r['arca_simulado'],
        'activo' => (bool)$r['activo'],
        'certificado' => empty($r['certificado_crt']) ? null : [
            'titular' => $r['certificado_titular'],
            'desde' => $r['certificado_desde'],
            'hasta' => $r['venc_certificado'],
            'subido_at' => $r['certificado_subido_at'],
        ],
    ];
    if ($staff) $out['importar_cuota_99'] = (bool)$r['importar_cuota_99'];
    return $out;
}

function cuit_validar(array $d, array $u, bool $esAlta): array
{
    $v = [
        'razon_social' => v_str($d, 'razon_social', 'Razón social', true, 160),
        'nombre_fantasia' => v_str($d, 'nombre_fantasia', 'Nombre fantasía', false, 160),
        'domicilio' => v_str($d, 'domicilio', 'Domicilio', false, 200),
        'ciudad' => v_str($d, 'ciudad', 'Ciudad', false, 120),
        'cuit' => v_cuit($d, 'cuit'),
        'condicion_iva' => v_enum($d, 'condicion_iva', 'Condición IVA', ['RI', 'MONOTRIBUTO', 'EXENTO']),
        'ingresos_brutos' => v_str($d, 'ingresos_brutos', 'Ingresos Brutos', false, 30),
        'alicuota' => v_money($d, 'alicuota', 'Alícuota', false) ?? '0.00',
        'punto_venta' => v_int($d, 'punto_venta', 'Punto de venta', true, 1, 99998),
        'inicio_actividades' => v_date($d, 'inicio_actividades', 'Inicio de actividades', false),
        'venc_certificado' => v_date($d, 'venc_certificado', 'Vencimiento del certificado', false),
        'tope_facturacion' => v_money($d, 'tope_facturacion', 'Tope de facturación', true),
        'modo_prueba' => v_bool($d, 'modo_prueba'),
        // Si no se envía, la autorización queda simulada: nunca se pasa a real por omisión.
        'arca_simulado' => array_key_exists('arca_simulado', $d) ? v_bool($d, 'arca_simulado') : 1,
    ];
    if ((float)$v['alicuota'] > 100) throw new HttpError(422, 'La alícuota no puede superar 100%.', ['campo' => 'alicuota']);
    if ($v['condicion_iva'] !== 'RI') $v['alicuota'] = '0.00';
    if ($u['es_staff']) {
        $v['centro_id'] = v_int($d, 'centro_id', 'Centro', true, 1);
        if (!q_val('SELECT id FROM centro WHERE id = ?', [$v['centro_id']])) throw new HttpError(422, 'El centro elegido no existe.', ['campo' => 'centro_id']);
        $v['importar_cuota_99'] = v_bool($d, 'importar_cuota_99');
    }
    return $v;
}

route('GET', '/cuits', function () {
    $u = require_user();
    $ids = user_centro_ids($u);
    if (!$ids) return [];
    $sql = 'SELECT cu.*, c.nombre AS centro_nombre, c.marca AS centro_marca FROM cuit cu JOIN centro c ON c.id = cu.centro_id';
    $rows = $u['es_staff']
        ? q_all($sql . ' ORDER BY c.marca, c.nombre')
        : q_all($sql . ' WHERE cu.activo = 1 AND cu.centro_id IN ' . in_list($ids) . ' ORDER BY c.marca, c.nombre', $ids);
    return array_map(fn($r) => cuit_publico($r, $u['es_staff']), $rows);
});

route('POST', '/cuits', function () {
    $u = require_staff();
    $v = cuit_validar(body(), $u, true);
    if (q_val('SELECT id FROM cuit WHERE centro_id = ? AND activo = 1', [$v['centro_id']])) {
        throw new HttpError(409, 'Ese centro ya tiene un CUIT activo. Editá el existente o desactivalo antes.', ['campo' => 'centro_id']);
    }
    // Si el CUIT ya tiene certificado cargado en otro centro, el alta lo hereda (con su vencimiento).
    $cert = q_one('SELECT certificado_crt, certificado_key, certificado_titular, certificado_desde, certificado_subido_at, venc_certificado
                   FROM cuit WHERE cuit = ? AND certificado_crt IS NOT NULL ORDER BY certificado_subido_at DESC LIMIT 1', [$v['cuit']]);
    $fila = $cert ? array_merge($v, $cert) : $v;
    $cols = array_keys($fila);
    q('INSERT INTO cuit (' . implode(',', $cols) . ') VALUES ' . in_list($cols), array_values($fila));
    $id = (int)db()->lastInsertId();
    audit('cuit', 'crear', ['centro_id' => $v['centro_id'], 'entidad' => 'cuit', 'entidad_id' => $id,
        'despues' => $cert ? ['venc_certificado' => $cert['venc_certificado'], 'certificado_titular' => $cert['certificado_titular']] + $v : $v]);
    return ['id' => $id, 'certificado_copiado' => (bool)$cert];
});

route('PUT', '/cuits/{id}', function ($p) {
    $u = require_user();
    $actual = q_one('SELECT * FROM cuit WHERE id = ?', [(int)$p['id']]);
    if (!$actual) throw new HttpError(404, 'El CUIT no existe.');
    require_centro($u, $actual['centro_id']);

    $v = cuit_validar(body(), $u, false);
    // Con el certificado cargado, el vencimiento sale del .crt y no se edita a mano.
    if (!empty($actual['certificado_crt'])) $v['venc_certificado'] = $actual['venc_certificado'];
    if ($u['es_staff'] && (int)$v['centro_id'] !== (int)$actual['centro_id']
        && (int)$actual['activo'] === 1 && q_val('SELECT id FROM cuit WHERE centro_id = ? AND activo = 1 AND id <> ?', [$v['centro_id'], $actual['id']])) {
        throw new HttpError(409, 'El centro elegido ya tiene otro CUIT.', ['campo' => 'centro_id']);
    }
    [$antes, $despues] = diff_campos($actual, $v);
    if (!$despues) return ['ok' => true, 'sin_cambios' => true];
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($despues)));
    q("UPDATE cuit SET $sets WHERE id = ?", [...array_values($despues), $actual['id']]);
    audit('cuit', 'actualizar', ['centro_id' => (int)$actual['centro_id'], 'entidad' => 'cuit', 'entidad_id' => $actual['id'], 'antes' => $antes, 'despues' => $despues]);
    return ['ok' => true];
});

route('DELETE', '/cuits/{id}', function ($p) {
    $u = require_staff();
    $actual = q_one('SELECT * FROM cuit WHERE id = ?', [(int)$p['id']]);
    if (!$actual) throw new HttpError(404, 'El CUIT no existe.');
    $usados = (int)q_val('SELECT COUNT(*) FROM comprobante WHERE cuit_id = ?', [$actual['id']]);
    if ($usados > 0) {
        // Con comprobantes emitidos no se borra: se desactiva para conservar la trazabilidad.
        q('UPDATE cuit SET activo = 0 WHERE id = ?', [$actual['id']]);
        audit('cuit', 'desactivar', ['centro_id' => (int)$actual['centro_id'], 'entidad' => 'cuit', 'entidad_id' => $actual['id'],
            'antes' => ['activo' => 1], 'despues' => ['activo' => 0, 'motivo' => "Tiene {$usados} comprobantes"]]);
        return ['ok' => true, 'desactivado' => true];
    }
    q('DELETE FROM cuit WHERE id = ?', [$actual['id']]);
    audit('cuit', 'eliminar', ['centro_id' => (int)$actual['centro_id'], 'entidad' => 'cuit', 'entidad_id' => $actual['id'], 'antes' => $actual]);
    return ['ok' => true];
});

route('POST', '/cuits/{id}/reactivar', function ($p) {
    require_staff();
    $actual = q_one('SELECT * FROM cuit WHERE id = ?', [(int)$p['id']]);
    if (!$actual) throw new HttpError(404, 'El CUIT no existe.');
    if (q_val('SELECT id FROM cuit WHERE centro_id = ? AND activo = 1 AND id <> ?', [$actual['centro_id'], $actual['id']])) {
        throw new HttpError(409, 'El centro ya tiene otro CUIT activo.');
    }
    q('UPDATE cuit SET activo = 1 WHERE id = ?', [$actual['id']]);
    audit('cuit', 'reactivar', ['centro_id' => (int)$actual['centro_id'], 'entidad' => 'cuit', 'entidad_id' => $actual['id'], 'antes' => ['activo' => 0], 'despues' => ['activo' => 1]]);
    return ['ok' => true];
});

// Cambio rápido del tope mensual (desde Pagos). Mismo permiso que editar el CUIT: staff o usuario del centro.
route('PUT', '/cuits/{id}/tope', function ($p) {
    $u = require_user();
    $actual = q_one('SELECT * FROM cuit WHERE id = ?', [(int)$p['id']]);
    if (!$actual) throw new HttpError(404, 'El CUIT no existe.');
    require_centro($u, $actual['centro_id']);
    $tope = v_money(body(), 'tope_facturacion', 'Tope de facturación', true);
    if ((float)$tope !== (float)$actual['tope_facturacion']) {
        q('UPDATE cuit SET tope_facturacion = ? WHERE id = ?', [$tope, $actual['id']]);
        audit('cuit', 'actualizar', ['centro_id' => (int)$actual['centro_id'], 'entidad' => 'cuit', 'entidad_id' => $actual['id'],
            'antes' => ['tope_facturacion' => $actual['tope_facturacion']], 'despues' => ['tope_facturacion' => $tope]]);
        $actual['tope_facturacion'] = $tope;
    }
    return ['tope' => resumen_tope($actual)];
});

/* ---------- Certificado digital de ARCA (.crt + .key) ---------- */

/** Acepta PEM o DER (en base64, tal como lo manda el navegador) y devuelve PEM. */
function cert_a_pem(string $b64, string $tipo, string $label): string
{
    $raw = base64_decode($b64, true);
    if ($raw === false || $raw === '') throw new HttpError(422, "No se pudo leer el archivo $label.", ['campo' => $tipo]);
    if (strlen($raw) > 64 * 1024) throw new HttpError(422, "El archivo $label es demasiado grande para ser un certificado.", ['campo' => $tipo]);
    if (str_contains($raw, '-----BEGIN')) return trim($raw) . "\n";
    $cabecera = $tipo === 'crt' ? 'CERTIFICATE' : 'PRIVATE KEY';
    return "-----BEGIN $cabecera-----\n" . chunk_split(base64_encode($raw), 64, "\n") . "-----END $cabecera-----\n";
}

route('POST', '/cuits/{id}/certificado', function ($p) {
    $u = require_user();
    $actual = q_one('SELECT * FROM cuit WHERE id = ?', [(int)$p['id']]);
    if (!$actual) throw new HttpError(404, 'El CUIT no existe.');
    require_centro($u, $actual['centro_id']);
    $d = body();
    if (empty($d['crt'])) throw new HttpError(422, 'Elegí el archivo del certificado (.crt).', ['campo' => 'crt']);
    if (empty($d['key'])) throw new HttpError(422, 'Elegí el archivo de la clave privada (.key).', ['campo' => 'key']);

    $crtPem = cert_a_pem((string)$d['crt'], 'crt', '.crt');
    $keyPem = cert_a_pem((string)$d['key'], 'key', '.key');

    $x509 = @openssl_x509_read($crtPem);
    if ($x509 === false) throw new HttpError(422, 'El archivo .crt no es un certificado válido.', ['campo' => 'crt']);
    $info = openssl_x509_parse($x509);
    $clave = (string)($d['clave_key'] ?? '');
    $pkey = @openssl_pkey_get_private($keyPem, $clave);
    if ($pkey === false) {
        throw new HttpError(422, str_contains($keyPem, 'ENCRYPTED')
            ? ($clave === '' ? 'La clave privada está protegida con contraseña: ingresala.' : 'La contraseña de la clave privada no es correcta.')
            : 'El archivo .key no es una clave privada válida.', ['campo' => 'key']);
    }
    if (!openssl_x509_check_private_key($x509, $pkey)) {
        throw new HttpError(422, 'La clave privada no corresponde a ese certificado.', ['campo' => 'key']);
    }
    // Se guarda la clave sin contraseña (y cifrada con app_key), para poder usarla sin pedirla de nuevo.
    openssl_pkey_export($pkey, $keyLimpia);

    $desde = date('Y-m-d', (int)$info['validFrom_time_t']);
    $hasta = date('Y-m-d', (int)$info['validTo_time_t']);
    $subject = $info['subject'] ?? [];
    $titular = substr(trim((string)($subject['CN'] ?? $subject['O'] ?? '')), 0, 200) ?: null;
    $cuitCert = preg_replace('/\D/', '', (string)($subject['serialNumber'] ?? ''));

    // El certificado es del CUIT, no del centro: se aplica a todas las filas con ese número (activas o no).
    $filas = q_all('SELECT id, centro_id, venc_certificado, certificado_titular FROM cuit WHERE cuit = ?', [$actual['cuit']]);
    db()->beginTransaction();
    q('UPDATE cuit SET certificado_crt = ?, certificado_key = ?, certificado_titular = ?, certificado_desde = ?, venc_certificado = ?, certificado_subido_at = NOW() WHERE cuit = ?',
        [$crtPem, encrypt_secret($keyLimpia), $titular, $desde, $hasta, $actual['cuit']]);
    foreach ($filas as $f) {
        audit('cuit', 'certificado', ['centro_id' => (int)$f['centro_id'], 'entidad' => 'cuit', 'entidad_id' => (int)$f['id'],
            'antes' => ['venc_certificado' => $f['venc_certificado'], 'certificado_titular' => $f['certificado_titular']],
            'despues' => ['venc_certificado' => $hasta, 'certificado_titular' => $titular, 'certificado_desde' => $desde]
                + ((int)$f['id'] !== (int)$actual['id'] ? ['motivo' => "Mismo CUIT que el registro {$actual['id']}"] : [])]);
    }
    db()->commit();

    $avisos = [];
    if ($cuitCert !== '' && $cuitCert !== $actual['cuit']) $avisos[] = "El certificado es del CUIT $cuitCert, no del CUIT $actual[cuit]. Solo sirve si ese CUIT tiene delegado el servicio de facturación.";
    if ($hasta < date('Y-m-d')) $avisos[] = 'El certificado ya está vencido.';
    return ['ok' => true, 'titular' => $titular, 'desde' => $desde, 'hasta' => $hasta, 'avisos' => $avisos, 'registros' => count($filas)];
});

route('DELETE', '/cuits/{id}/certificado', function ($p) {
    $u = require_user();
    $actual = q_one('SELECT * FROM cuit WHERE id = ?', [(int)$p['id']]);
    if (!$actual) throw new HttpError(404, 'El CUIT no existe.');
    require_centro($u, $actual['centro_id']);
    $filas = q_all('SELECT id, centro_id, venc_certificado, certificado_titular FROM cuit WHERE cuit = ? AND certificado_crt IS NOT NULL', [$actual['cuit']]);
    if (!$filas) return ['ok' => true, 'sin_cambios' => true];
    db()->beginTransaction();
    q('UPDATE cuit SET certificado_crt = NULL, certificado_key = NULL, certificado_titular = NULL, certificado_desde = NULL, certificado_subido_at = NULL WHERE cuit = ?', [$actual['cuit']]);
    foreach ($filas as $f) {
        audit('cuit', 'quitar_certificado', ['centro_id' => (int)$f['centro_id'], 'entidad' => 'cuit', 'entidad_id' => (int)$f['id'],
            'antes' => ['certificado_titular' => $f['certificado_titular'], 'venc_certificado' => $f['venc_certificado']]]);
    }
    db()->commit();
    return ['ok' => true, 'registros' => count($filas)];
});
