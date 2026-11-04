<?php
declare(strict_types=1);

/**
 * Valida contra eddis_ar.edd_users: el documento puede tener varias filas,
 * alcanza con que la clave coincida con el claveint (MD5) de alguna.
 */
function validar_en_origen(string $marca, string $documento, string $clave): array
{
    try {
        $st = db_marca($marca)->prepare('SELECT id, nombre, apellido, email, claveint FROM edd_users WHERE documento = ? ORDER BY id');
        $st->execute([$documento]);
        $filas = $st->fetchAll();
    } catch (PDOException $e) {
        error_log('[eddisfac] base de origen ' . $marca . ': ' . $e->getMessage());
        throw new HttpError(503, 'No se pudo consultar la base de ' . ($marca === 'SB' ? 'Studio Beauty' : 'Eddis') . '. Intentá de nuevo en unos minutos.');
    }
    $res = ['existe' => (bool)$filas, 'valido' => false, 'autorizado_facturar' => true, 'nombre' => null, 'apellido' => null];
    $md5 = md5($clave);
    foreach ($filas as $f) {
        $hash = strtolower(trim((string)$f['claveint']));
        if ($hash !== '' && hash_equals($hash, $md5)) {
            return [
                'existe' => true,
                'valido' => true,
                // La habilitación para facturar la otorga el alta en este sistema (tabla usuario).
                'autorizado_facturar' => true,
                'nombre' => trim((string)$f['nombre']) ?: null,
                'apellido' => trim((string)$f['apellido']) ?: null,
                'email' => trim((string)$f['email']) ?: null,
                'claveint' => $hash,
                'eddis_user_id' => (int)$f['id'],
                'origen' => $marca,
            ];
        }
    }
    return $res;
}

function sesion_payload(array $u): array
{
    $ids = user_centro_ids($u);
    $centros = $ids ? q_all(
        'SELECT c.id, c.nombre, c.marca, cu.venc_certificado, cu.condicion_iva, cu.nombre_fantasia, cu.modo_prueba, cu.arca_simulado
         FROM centro c LEFT JOIN cuit cu ON cu.centro_id = c.id AND cu.activo = 1
         WHERE c.id IN ' . in_list($ids) . ' ORDER BY c.marca, c.nombre', $ids) : [];
    foreach ($centros as &$c) {
        $c['id'] = (int)$c['id'];
        $c['modo_prueba'] = $c['modo_prueba'] === null ? null : (bool)$c['modo_prueba'];
        $c['arca_simulado'] = $c['arca_simulado'] === null ? null : (bool)$c['arca_simulado'];
    }
    return [
        'usuario' => [
            'id' => $u['id'],
            'documento' => $u['documento'],
            'nombre' => $u['nombre'],
            'apellido' => $u['apellido'],
            'es_staff' => $u['es_staff'],
            'tema' => $u['tema'],
            'centro_preferido_id' => $u['centro_preferido_id'] ? (int)$u['centro_preferido_id'] : null,
            'sistema' => $u['sistema'],
        ],
        'centros' => $centros,
        'simulacion' => simulacion(),
        'simulados' => array_values(array_filter([
            simular('url_pagos_eddis') ? 'pagos' : null,
            simular('url_validacion_sb') ? 'validación de Studio Beauty' : null,
        ])),
        'dias_alerta_certificado' => (int)conf('dias_alerta_certificado', '30'),
    ];
}

route('POST', '/auth/login', function () {
    $d = body();
    $documento = preg_replace('/\D/', '', (string)($d['documento'] ?? ''));
    $clave = (string)($d['clave'] ?? '');
    if ($documento === '' || $clave === '') throw new HttpError(422, 'Ingresá tu documento y tu clave.');

    // Freno de fuerza bruta: 10 intentos fallidos por IP cada 15 minutos.
    $fallos = (int)q_val("SELECT COUNT(*) FROM auditoria WHERE ip = ? AND accion = 'login_fallido' AND fecha_hora > NOW() - INTERVAL 15 MINUTE", [client_ip()]);
    if ($fallos >= 10) throw new HttpError(429, 'Demasiados intentos fallidos. Esperá 15 minutos e intentá de nuevo.');

    $fallo = function (string $motivo, string $mensaje, int $status = 401) use ($documento) {
        audit('auth', 'login_fallido', ['documento' => $documento, 'despues' => ['documento' => $documento, 'motivo' => $motivo]]);
        throw new HttpError($status, $mensaje);
    };

    // Usuario maestro (config.php): staff que se valida localmente, sin APIs externas.
    $maestro = cfg('usuario_maestro');
    if (is_array($maestro) && !empty($maestro['documento']) && !empty($maestro['clave_hash'])
        && hash_equals((string)$maestro['documento'], $documento)) {
        if (!password_verify($clave, (string)$maestro['clave_hash'])) $fallo('clave_invalida', 'La clave no es correcta.');
        $id = q_val('SELECT id FROM usuario WHERE documento = ?', [$documento]);
        if ($id) {
            q('UPDATE usuario SET es_staff = 1, activo = 1, ultimo_login = NOW() WHERE id = ?', [$id]);
        } else {
            q('INSERT INTO usuario (documento, nombre, apellido, es_staff, ultimo_login) VALUES (?, ?, ?, 1, NOW())',
                [$documento, $maestro['nombre'] ?? 'Usuario', $maestro['apellido'] ?? 'Maestro']);
            $id = db()->lastInsertId();
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$id;
        $_SESSION['sistema'] = 'EDDIS';
        $user = current_user();
        audit('auth', 'login_maestro', ['usuario' => $user]);
        return sesion_payload($user);
    }

    // Clave maestra con el documento de un usuario habilitado: entra como ese usuario, sin validar en Eddis ni SB.
    if (is_array($maestro) && !empty($maestro['clave_hash']) && password_verify($clave, (string)$maestro['clave_hash'])) {
        $u = q_one('SELECT id, activo FROM usuario WHERE documento = ?', [$documento]);
        if (!$u) $fallo('no_habilitado', 'Ese documento no está habilitado en este sistema.', 403);
        if ((int)$u['activo'] !== 1) $fallo('usuario_inactivo', 'Ese usuario está dado de baja en este sistema.', 403);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$u['id'];
        $_SESSION['sistema'] = 'EDDIS';
        $user = current_user();
        if (!$user['es_staff'] && !user_centro_ids($user)) {
            $_SESSION = [];
            $fallo('sin_centros', 'Ese usuario no tiene centros asignados.', 403);
        }
        q('UPDATE usuario SET ultimo_login = NOW() WHERE id = ?', [$u['id']]);
        audit('auth', 'login_clave_maestra', ['usuario' => $user, 'despues' => ['documento' => $documento, 'clave' => 'maestra']]);
        return sesion_payload($user);
    }

    // 1) Eddis: documento + md5(clave) contra eddis_ar.edd_users.claveint.
    // 2) Si el documento no existe en Eddis, Studio Beauty: eddis_set.edd_users.claveint
    //    (y, si tampoco está ahí, la API de validación de SB o su simulación).
    $sistema = 'EDDIS';
    $r = validar_en_origen('EDDIS', $documento, $clave);
    if (!$r['existe']) {
        $sistema = 'SB';
        $r = validar_en_origen('SB', $documento, $clave);
        if (!$r['existe']) $r = api_validar_usuario('SB', $documento, $clave);
    }
    if (!$r['existe']) $fallo('documento_inexistente', 'El documento no figura en Eddis ni en Studio Beauty.');
    if (!$r['valido']) $fallo('clave_invalida', 'La clave no es correcta.');
    if (!$r['autorizado_facturar']) $fallo('sin_autorizacion', 'Tu usuario no está autorizado a facturar.', 403);

    $u = q_one('SELECT id, activo FROM usuario WHERE documento = ?', [$documento]);
    if (!$u) $fallo('no_habilitado', 'Tu documento no está habilitado en este sistema. Pedí el alta a un usuario staff.', 403);
    if ((int)$u['activo'] !== 1) $fallo('usuario_inactivo', 'Tu usuario está dado de baja en este sistema.', 403);

    if ($r['nombre'] || $r['apellido']) {
        q('UPDATE usuario SET nombre = COALESCE(?, nombre), apellido = COALESCE(?, apellido) WHERE id = ?', [$r['nombre'], $r['apellido'], $u['id']]);
    }
    if (!empty($r['eddis_user_id'])) {
        // Mantiene la copia local alineada con la fila de Eddis que validó.
        q('UPDATE usuario SET claveint = ?, eddis_user_id = ?, origen_usuario = ?, email = COALESCE(?, email) WHERE id = ?',
            [$r['claveint'], $r['eddis_user_id'], $r['origen'], $r['email'], $u['id']]);
    }
    q('UPDATE usuario SET ultimo_login = NOW() WHERE id = ?', [$u['id']]);

    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    $_SESSION['sistema'] = $sistema;

    $user = current_user();
    if (!$user['es_staff'] && !user_centro_ids($user)) {
        $_SESSION = [];
        $fallo('sin_centros', 'Tu usuario no tiene centros asignados. Pedí a un usuario staff que te los asigne.', 403);
    }
    audit('auth', 'login', ['usuario' => $user, 'despues' => ['sistema' => $sistema]]);
    return sesion_payload($user);
});

route('GET', '/auth/sesion', function () {
    return sesion_payload(require_user());
});

route('POST', '/auth/logout', function () {
    $u = current_user();
    if ($u) audit('auth', 'logout', ['usuario' => $u]);
    $_SESSION = [];
    session_destroy();
    return ['ok' => true];
});

route('PUT', '/auth/preferencias', function () {
    $u = require_user();
    $d = body();
    $cambios = [];
    if (array_key_exists('tema', $d)) {
        $cambios['tema'] = v_enum($d, 'tema', 'Tema', ['claro', 'oscuro', 'sistema']);
    }
    if (array_key_exists('centro_preferido_id', $d)) {
        $cambios['centro_preferido_id'] = $d['centro_preferido_id'] === null ? null : require_centro($u, $d['centro_preferido_id']);
    }
    if (!$cambios) return ['ok' => true];
    $antes = array_intersect_key($u, $cambios);
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($cambios)));
    q("UPDATE usuario SET $sets WHERE id = ?", [...array_values($cambios), $u['id']]);
    audit('preferencias', 'actualizar', ['entidad' => 'usuario', 'entidad_id' => $u['id'], 'antes' => $antes, 'despues' => $cambios]);
    return ['ok' => true];
});
