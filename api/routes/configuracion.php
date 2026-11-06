<?php
declare(strict_types=1);

const CONF_CAMPOS = [
    'modo_simulacion' => 'bool',
    'url_validacion_eddis' => 'url',
    'url_validacion_sb' => 'url',
    'url_api_eddis' => 'url',
    'token_api_eddis' => 'secret',
    'url_pagos_eddis' => 'url',
    'token_pagos_eddis' => 'secret',
    'url_arca' => 'url',
    'token_arca' => 'secret',
    'url_arca_consulta' => 'url',
    'token_arca_consulta' => 'secret',
    'url_usuarios' => 'url',
    'token_usuarios' => 'secret',
    'pais_sistema' => 'text',
    'pais_sistema_sb' => 'text',
    'timeout_segundos' => 'int',
    'dias_alerta_certificado' => 'int',
];

route('GET', '/configuracion', function () {
    require_staff();
    $rows = [];
    foreach (q_all('SELECT clave, valor, secreto, actualizado_por, updated_at FROM configuracion') as $r) $rows[$r['clave']] = $r;
    $out = [];
    foreach (CONF_CAMPOS as $k => $tipo) {
        $r = $rows[$k] ?? null;
        $out[$k] = $tipo === 'secret'
            ? ['configurado' => $r !== null && $r['valor'] !== null && $r['valor'] !== '']
            : ($r['valor'] ?? '');
    }
    $ultimo = q_one('SELECT c.updated_at, CONCAT(u.nombre, " ", u.apellido) AS usuario FROM configuracion c LEFT JOIN usuario u ON u.id = c.actualizado_por ORDER BY c.updated_at DESC LIMIT 1');
    return ['valores' => $out, 'ultimo_cambio' => $ultimo];
});

route('PUT', '/configuracion', function () {
    $u = require_staff();
    $d = body();
    $actual = conf_all(true);
    $antes = [];
    $despues = [];

    foreach (CONF_CAMPOS as $k => $tipo) {
        if (!array_key_exists($k, $d)) continue;
        $val = $d[$k];
        switch ($tipo) {
            case 'bool':
                $val = v_bool($d, $k) ? '1' : '0';
                break;
            case 'int':
                $val = (string)v_int($d, $k, $k, true, 1, 3650);
                break;
            case 'text':
                $val = trim((string)$val);
                if (!preg_match('/^[a-z]{0,5}$/', $val)) throw new HttpError(422, 'El país debe ser un código corto, por ejemplo ar.', ['campo' => $k]);
                break;
            case 'url':
                $val = trim((string)$val);
                if ($val !== '' && (!filter_var($val, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $val))) {
                    throw new HttpError(422, 'La dirección no es una URL http(s) válida.', ['campo' => $k]);
                }
                break;
            case 'secret':
                // Vacío = conservar el valor actual. Para borrarlo se envía {"borrar": true}.
                if (is_array($val) && !empty($val['borrar'])) {
                    $val = null;
                } else {
                    $val = trim((string)$val);
                    if ($val === '') continue 2;
                }
                break;
        }
        $prev = $actual[$k] ?? null;
        if ($prev === $val) continue;
        $antes[$k] = $tipo === 'secret' ? ($prev ? '[configurado]' : null) : $prev;
        $despues[$k] = $tipo === 'secret' ? ($val ? '[nuevo valor]' : null) : $val;
        $stored = $tipo === 'secret' && $val !== null ? encrypt_secret($val) : $val;
        q('INSERT INTO configuracion (clave, valor, secreto, actualizado_por) VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE valor = VALUES(valor), secreto = VALUES(secreto), actualizado_por = VALUES(actualizado_por)',
            [$k, $stored, $tipo === 'secret' ? 1 : 0, $u['id']]);
    }
    if ($despues) {
        // Se registran los nombres de los campos secretos que cambiaron, nunca sus valores.
        q('INSERT INTO auditoria (usuario_id, usuario_documento, usuario_nombre, modulo, accion, entidad, valor_anterior, valor_nuevo, ip, user_agent)
           VALUES (?,?,?,?,?,?,?,?,?,?)', [
            $u['id'], $u['documento'], $u['nombre'] . ' ' . $u['apellido'], 'configuracion', 'actualizar', 'configuracion',
            json_encode($antes, JSON_UNESCAPED_UNICODE), json_encode($despues, JSON_UNESCAPED_UNICODE),
            client_ip(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        ]);
    }
    conf_all(true);
    return ['ok' => true, 'cambios' => count($despues)];
});

route('POST', '/configuracion/probar', function () {
    require_staff();
    $servicio = v_enum(body(), 'servicio', 'Servicio', ['api_eddis', 'pagos', 'arca', 'arca_consulta', 'usuarios', 'validacion_eddis', 'validacion_sb']);
    $claveUrl = ['api_eddis' => 'url_api_eddis', 'pagos' => 'url_pagos_eddis', 'arca' => 'url_arca', 'arca_consulta' => 'url_arca_consulta', 'usuarios' => 'url_usuarios',
                 'validacion_eddis' => 'url_validacion_eddis', 'validacion_sb' => 'url_validacion_sb'][$servicio];
    if (conf($claveUrl) === '') {
        return ['ok' => false, 'mensaje' => simulacion() ? 'Sin URL configurada: se usa la simulación.' : 'Sin URL configurada.'];
    }

    $inicio = microtime(true);
    try {
        switch ($servicio) {
            case 'api_eddis':
                // Pide los centros activos de las dos marcas: prueba URL, token y acceso a eddis_ar y eddis_set.
                $n = count(origen_centros('EDDIS', null));
                $m = count(origen_centros('SB', null));
                $ms = (int)round((microtime(true) - $inicio) * 1000);
                $res = ['ok' => true, 'mensaje' => "Respondió en {$ms} ms: {$n} centros activos de Eddis y {$m} de Studio Beauty."];
                audit('configuracion', 'probar_conexion', ['despues' => ['servicio' => $servicio] + $res]);
                return $res;
            case 'pagos':
                $r = http_json('GET', conf('url_pagos_eddis'), conf('token_pagos_eddis'), null,
                    ['centro' => '0', 'fechadesde' => date('Y-m-d'), 'fechahasta' => date('Y-m-d'), 'cuota99' => 0, 'importe99' => 0, 'paissistema' => conf('pais_sistema', 'ar')]);
                break;
            case 'arca':
                $r = http_json('GET', rtrim(conf('url_arca'), '/') . '/ultimo', conf('token_arca'), null, ['cuit' => '0', 'punto_venta' => 1, 'tipo' => 11, 'homologacion' => 1]);
                break;
            case 'arca_consulta':
                $r = http_json('POST', conf('url_arca_consulta'), conf('token_arca_consulta'), ['accion' => 'ultimo', 'cuit' => '0', 'punto_venta' => 1, 'tipo' => 11, 'homologacion' => 1]);
                break;
            case 'usuarios':
                $r = http_json('GET', conf('url_usuarios'), conf('token_usuarios'));
                break;
            default:
                $r = http_json('POST', conf($servicio === 'validacion_eddis' ? 'url_validacion_eddis' : 'url_validacion_sb'), null, ['documento' => '0', 'clave' => '']);
        }
        $ms = (int)round((microtime(true) - $inicio) * 1000);
        $res = ['ok' => true, 'mensaje' => "Respondió HTTP {$r['_http_status']} en {$ms} ms."];
    } catch (ExternalApiError $e) {
        $res = ['ok' => false, 'mensaje' => $e->getMessage()];
    }
    audit('configuracion', 'probar_conexion', ['despues' => ['servicio' => $servicio] + $res]);
    return $res;
});
