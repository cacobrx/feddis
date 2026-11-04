<?php
declare(strict_types=1);

/*
 * Usuarios habilitados. Se dan de alta desde las bases de origen:
 *   - Eddis (eddis_ar.edd_users) y, si el documento no está en Eddis, Studio Beauty (eddis_set.edd_users).
 * Los centros elegibles son los autorizados en esas bases (centro + otroscentros, separados por |):
 *   - usuario de Eddis: sus centros de Eddis + los de Studio Beauty que tenga el mismo documento;
 *   - usuario solo de Studio Beauty: sus centros de Studio Beauty.
 * Cada centro se identifica como "MARCA:id" (por ejemplo EDDIS:157 o SB:15), porque los ids se repiten entre bases.
 */

/* Código de edd_users.centro que no es un centro real: "Central". */
const CENTRO_ESPECIAL = 9999;
const MARCA_NOMBRE = ['EDDIS' => 'Eddis', 'SB' => 'Studio Beauty'];

function usuario_detalle(int $id): ?array
{
    $u = q_one('SELECT id, documento, nombre, apellido, email, eddis_user_id, origen_usuario, (claveint IS NOT NULL AND CHAR_LENGTH(claveint) > 0) AS tiene_claveint, es_staff, activo, ultimo_login, created_at FROM usuario WHERE id = ?', [$id]);
    if (!$u) return null;
    $u['id'] = (int)$u['id'];
    $u['es_staff'] = (bool)$u['es_staff'];
    $u['activo'] = (bool)$u['activo'];
    $u['eddis_user_id'] = $u['eddis_user_id'] === null ? null : (int)$u['eddis_user_id'];
    $u['tiene_claveint'] = (bool)$u['tiene_claveint'];
    $u['centros'] = array_map('intval', array_column(q_all('SELECT centro_id FROM usuario_centro WHERE usuario_id = ? ORDER BY centro_id', [$id]), 'centro_id'));
    return $u;
}

function centros_validos(array $ids): array
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) return [];
    $existen = array_map('intval', array_column(q_all('SELECT id FROM centro WHERE id IN ' . in_list($ids), $ids), 'id'));
    if (count($existen) !== count($ids)) throw new HttpError(422, 'Alguno de los centros elegidos no existe.', ['campo' => 'centros']);
    sort($existen);
    return $existen;
}

function guardar_centros(int $usuarioId, array $centros): void
{
    q('DELETE FROM usuario_centro WHERE usuario_id = ?', [$usuarioId]);
    foreach ($centros as $c) q('INSERT INTO usuario_centro (usuario_id, centro_id) VALUES (?, ?)', [$usuarioId, $c]);
}

/* ---------- Bases de origen ---------- */

function origen_usuario_por_id(string $origen, int $id): ?array
{
    $st = db_marca($origen)->prepare('SELECT id, nombre, apellido, documento, email, claveint, centro, otroscentros, facturacion FROM edd_users WHERE id = ?');
    $st->execute([$id]);
    $f = $st->fetch();
    return $f ?: null;
}

function origen_usuarios_por_documento(string $origen, string $documento): array
{
    $st = db_marca($origen)->prepare('SELECT id, nombre, apellido, documento, email, claveint, centro, otroscentros, facturacion
                                      FROM edd_users WHERE documento = ? ORDER BY id');
    $st->execute([$documento]);
    return $st->fetchAll();
}

/** Limpia el nombre del centro: quita el prefijo de la marca, espacios sobrantes y la doble codificación UTF-8. */
function nombre_centro_origen(string $nombre): string
{
    $n = trim($nombre);
    if (str_contains($n, 'Ã') || str_contains($n, 'Â')) {
        $fix = mb_convert_encoding($n, 'ISO-8859-1', 'UTF-8');
        if (mb_check_encoding($fix, 'UTF-8')) $n = $fix;
    }
    $n = preg_replace('/^(Eddis|Studio Beauty)\s+/iu', '', $n);
    return trim(preg_replace('/\s+/u', ' ', $n));
}

/** IDs de edd_centro autorizados para una fila de edd_users: centro + otroscentros. */
function ids_centros_fila(array $fila): array
{
    $ids = [(string)($fila['centro'] ?? '')];
    foreach (explode('|', (string)($fila['otroscentros'] ?? '')) as $x) $ids[] = $x;
    $ids = array_map('intval', array_filter(array_map('trim', $ids), 'ctype_digit'));
    return array_values(array_unique(array_filter($ids, fn($i) => $i > 0 && $i !== CENTRO_ESPECIAL)));
}

/** Centros de una marca para los ids dados, con el centro del proyecto vinculado (marca + código) si existe. */
function centros_de_marca(string $marca, array $ids, array $principales): array
{
    if (!$ids) return [];
    $st = db_marca($marca)->prepare('SELECT id, nombre, activo FROM edd_centro WHERE id IN ' . in_list($ids));
    $st->execute($ids);
    $filas = $st->fetchAll();
    if (!$filas) return [];
    $codigos = array_map(fn($r) => (string)$r['id'], $filas);
    $locales = [];
    foreach (q_all('SELECT id, codigo_eddis FROM centro WHERE marca = ? AND codigo_eddis IN ' . in_list($codigos), [$marca, ...$codigos]) as $c) {
        $locales[$c['codigo_eddis']] = (int)$c['id'];
    }
    return array_map(fn($r) => [
        'clave' => $marca . ':' . (int)$r['id'],
        'marca' => $marca,
        'codigo' => (int)$r['id'],
        'nombre' => nombre_centro_origen((string)$r['nombre']),
        'activo' => (int)$r['activo'] === 1,
        'centro_id' => $locales[(string)$r['id']] ?? null,
        'principal' => in_array((int)$r['id'], $principales, true),
    ], $filas);
}

/** Todos los centros activos de una marca, con el centro del proyecto vinculado si existe. */
function centros_activos_marca(string $marca): array
{
    $ids = array_map('intval', array_column(db_marca($marca)->query('SELECT id FROM edd_centro WHERE activo = 1')->fetchAll(), 'id'));
    $out = centros_de_marca($marca, $ids, []);
    // Orden alfabético sin distinguir acentos (Adrogué junto a Adrián, Ñ junto a N).
    $clave = fn($n) => strtr(mb_strtolower($n), ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
    usort($out, fn($a, $b) => $clave($a['nombre']) <=> $clave($b['nombre']));
    return $out;
}

/**
 * Centros autorizados para una fila de usuario de origen.
 * Usuario de Eddis: sus centros de Eddis + los de Studio Beauty de su mismo documento.
 */
function centros_autorizados(string $origen, array $fila): array
{
    $out = centros_de_marca($origen, ids_centros_fila($fila), [(int)$fila['centro']]);
    if ($origen === 'EDDIS' && trim((string)$fila['documento']) !== '') {
        $ids = [];
        $principales = [];
        foreach (origen_usuarios_por_documento('SB', trim((string)$fila['documento'])) as $sb) {
            $ids = array_merge($ids, ids_centros_fila($sb));
            $principales[] = (int)$sb['centro'];
        }
        $out = array_merge($out, centros_de_marca('SB', array_values(array_unique($ids)), $principales));
    }
    usort($out, fn($a, $b) => [$a['marca'], !$a['principal'], $a['nombre']] <=> [$b['marca'], !$b['principal'], $b['nombre']]);
    return $out;
}

/**
 * Convierte los centros de origen elegidos ("MARCA:id") en centros del proyecto, creándolos si no existen.
 * Solo admite centros activos autorizados para esa fila.
 */
function materializar_centros(string $origen, array $fila, array $elegidos): array
{
    $elegidos = array_values(array_unique(array_map('strval', $elegidos)));
    if (!$elegidos) return [];
    $permitidos = [];
    $autorizados = centros_autorizados($origen, $fila);
    // Sin centros autorizados en su base (por ejemplo, staff en Eddis): se elige entre todos los centros activos.
    if (!$autorizados) $autorizados = array_merge(centros_activos_marca('EDDIS'), centros_activos_marca('SB'));
    foreach ($autorizados as $c) $permitidos[$c['clave']] = $c;

    $ids = [];
    foreach ($elegidos as $clave) {
        $c = $permitidos[$clave] ?? null;
        if (!$c) throw new HttpError(422, "El centro {$clave} no está autorizado para este usuario.", ['campo' => 'centros']);
        if ($c['centro_id']) { $ids[] = $c['centro_id']; continue; }
        if (!$c['activo']) throw new HttpError(422, "El centro {$c['nombre']} está inactivo en " . MARCA_NOMBRE[$c['marca']] . '.', ['campo' => 'centros']);

        // Los de Studio Beauty llevan la marca en el nombre: muchos se llaman igual que centros de Eddis.
        $nombre = $c['marca'] === 'SB' ? "Studio Beauty {$c['nombre']}" : $c['nombre'];
        $existente = q_one('SELECT id, codigo_eddis FROM centro WHERE nombre = ? AND marca = ?', [$nombre, $c['marca']]);
        if ($existente && ($existente['codigo_eddis'] === null || $existente['codigo_eddis'] === '' || !ctype_digit((string)$existente['codigo_eddis']))) {
            q('UPDATE centro SET codigo_eddis = ? WHERE id = ?', [(string)$c['codigo'], $existente['id']]);
            $nuevoId = (int)$existente['id'];
            $accion = 'vincular_origen';
        } else {
            if ($existente || q_val('SELECT id FROM centro WHERE nombre = ?', [$nombre])) $nombre .= " ({$c['codigo']})";
            q('INSERT INTO centro (nombre, marca, codigo_eddis, activo) VALUES (?, ?, ?, 1)', [mb_substr($nombre, 0, 120), $c['marca'], (string)$c['codigo']]);
            $nuevoId = (int)db()->lastInsertId();
            $accion = 'crear_desde_origen';
        }
        audit('centros', $accion, ['centro_id' => $nuevoId, 'entidad' => 'centro', 'entidad_id' => $nuevoId, 'critico' => true,
            'despues' => ['nombre' => $nombre, 'marca' => $c['marca'], 'codigo_eddis' => (string)$c['codigo']]]);
        $ids[] = $nuevoId;
    }
    return $ids;
}

/** Centros finales: los del proyecto enviados + los de origen elegidos. */
function centros_de_payload(array $d, ?string $origen, ?array $fila): array
{
    $centros = centros_validos((array)($d['centros'] ?? []));
    $elegidos = (array)($d['centros_origen'] ?? []);
    if ($elegidos) {
        if (!$fila || !$origen) throw new HttpError(422, 'Este usuario no está vinculado a Eddis ni a Studio Beauty.', ['campo' => 'centros']);
        $centros = array_merge($centros, materializar_centros($origen, $fila, $elegidos));
    }
    $centros = array_values(array_unique($centros));
    sort($centros);
    return $centros;
}

function resultado_busqueda(string $origen, array $f): array
{
    return [
        'origen' => $origen,
        'eddis_user_id' => (int)$f['id'],
        'nombre' => trim((string)$f['nombre']),
        'apellido' => trim((string)$f['apellido']),
        'documento' => $f['documento'],
        'email' => $f['email'] ?: null,
        'tiene_claveint' => !empty($f['claveint']),
        'autorizado_facturar' => (int)$f['facturacion'] === 1,
        'centros_origen' => centros_autorizados($origen, $f),
    ];
}

/* ---------- Rutas ---------- */

route('GET', '/usuarios', function () {
    require_staff();
    $ids = array_column(q_all('SELECT id FROM usuario ORDER BY activo DESC, apellido, nombre'), 'id');
    return array_map(fn($id) => usuario_detalle((int)$id), $ids);
});

route('GET', '/usuarios/centros-disponibles', function () {
    require_staff();
    return ['EDDIS' => centros_activos_marca('EDDIS'), 'SB' => centros_activos_marca('SB')];
});

route('GET', '/usuarios/buscar', function () {
    require_staff();
    $documento = v_documento($_GET, 'documento');
    // Primero Eddis; si el documento no está en Eddis, Studio Beauty.
    $origen = 'EDDIS';
    $filas = origen_usuarios_por_documento('EDDIS', $documento);
    if (!$filas) {
        $origen = 'SB';
        $filas = origen_usuarios_por_documento('SB', $documento);
    }
    $habilitado = q_one('SELECT id, nombre, apellido FROM usuario WHERE documento = ?', [$documento]);
    audit('usuarios', 'buscar_origen', ['despues' => ['documento' => $documento, 'origen' => $filas ? $origen : null, 'resultados' => count($filas)]]);
    return [
        'documento' => $documento,
        'origen' => $filas ? $origen : null,
        'ya_habilitado' => $habilitado ? ['id' => (int)$habilitado['id'], 'nombre' => $habilitado['nombre'] . ' ' . $habilitado['apellido']] : null,
        'resultados' => array_map(fn($f) => resultado_busqueda($origen, $f), $filas),
    ];
});

route('GET', '/usuarios/{id}/centros-origen', function ($p) {
    require_staff();
    $u = q_one('SELECT eddis_user_id, origen_usuario FROM usuario WHERE id = ?', [(int)$p['id']]);
    if (!$u) throw new HttpError(404, 'El usuario no existe.');
    if (!$u['eddis_user_id'] || !$u['origen_usuario']) return ['vinculado' => false, 'centros_origen' => []];
    $f = origen_usuario_por_id($u['origen_usuario'], (int)$u['eddis_user_id']);
    if (!$f) return ['vinculado' => true, 'encontrado' => false, 'origen' => $u['origen_usuario'], 'centros_origen' => []];
    return ['vinculado' => true, 'encontrado' => true, 'origen' => $u['origen_usuario'], 'centros_origen' => centros_autorizados($u['origen_usuario'], $f)];
});

route('POST', '/usuarios', function () {
    require_staff();
    $d = body();
    $origen = v_enum($d, 'origen', 'Origen', ['EDDIS', 'SB']);
    $origenId = v_int($d, 'eddis_user_id', 'Usuario de origen', true, 1);

    // Los datos se toman de la base de origen en el servidor, nunca del navegador.
    $f = origen_usuario_por_id($origen, $origenId);
    if (!$f) throw new HttpError(404, 'El usuario ya no figura en ' . MARCA_NOMBRE[$origen] . '. Buscalo de nuevo.');
    $documento = preg_replace('/\D/', '', (string)$f['documento']);
    if ($documento === '') throw new HttpError(422, 'El usuario no tiene documento cargado.');
    if ($origen === 'SB' && origen_usuarios_por_documento('EDDIS', $documento)) {
        throw new HttpError(409, 'Ese documento está en Eddis: se da de alta desde Eddis.');
    }
    if (q_val('SELECT id FROM usuario WHERE documento = ?', [$documento])) throw new HttpError(409, 'Ese documento ya está habilitado.');

    $nombre = trim((string)$f['nombre']) ?: 'Sin nombre';
    $apellido = trim((string)$f['apellido']) ?: '-';
    $email = trim((string)$f['email']) ?: null;
    $claveint = trim((string)$f['claveint']) ?: null;
    $esStaff = v_bool($d, 'es_staff');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $centros = centros_de_payload($d, $origen, $f);
        if (!$esStaff && !$centros) throw new HttpError(422, 'Elegí al menos un centro.', ['campo' => 'centros']);
        q('INSERT INTO usuario (documento, nombre, apellido, email, claveint, eddis_user_id, origen_usuario, es_staff) VALUES (?,?,?,?,?,?,?,?)',
            [$documento, mb_substr($nombre, 0, 80), mb_substr($apellido, 0, 80), $email, $claveint, $origenId, $origen, $esStaff]);
        $id = (int)$pdo->lastInsertId();
        guardar_centros($id, $centros);
        audit('usuarios', 'crear', ['entidad' => 'usuario', 'entidad_id' => $id, 'critico' => true,
            'despues' => ['documento' => $documento, 'nombre' => "$nombre $apellido", 'email' => $email, 'origen' => $origen,
                          'eddis_user_id' => $origenId, 'claveint' => $claveint ? '[copiada]' : null, 'es_staff' => (bool)$esStaff, 'centros' => $centros]]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return usuario_detalle($id);
});

route('POST', '/usuarios/{id}/sincronizar', function ($p) {
    require_staff();
    $u = q_one('SELECT id, documento, nombre, apellido, email, claveint, eddis_user_id, origen_usuario FROM usuario WHERE id = ?', [(int)$p['id']]);
    if (!$u) throw new HttpError(404, 'El usuario no existe.');
    if (!$u['eddis_user_id'] || !$u['origen_usuario']) throw new HttpError(409, 'Este usuario no se dio de alta desde Eddis ni Studio Beauty.');
    $f = origen_usuario_por_id($u['origen_usuario'], (int)$u['eddis_user_id']);
    if (!$f) throw new HttpError(404, 'El usuario ya no figura en ' . MARCA_NOMBRE[$u['origen_usuario']] . '.');
    $nuevo = [
        'nombre' => mb_substr(trim((string)$f['nombre']) ?: $u['nombre'], 0, 80),
        'apellido' => mb_substr(trim((string)$f['apellido']) ?: $u['apellido'], 0, 80),
        'email' => trim((string)$f['email']) ?: null,
        'claveint' => trim((string)$f['claveint']) ?: null,
    ];
    [$antes, $despues] = diff_campos($u, $nuevo);
    if (!$despues) return usuario_detalle((int)$u['id']) + ['sin_cambios' => true];
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($despues)));
    q("UPDATE usuario SET $sets WHERE id = ?", [...array_values($despues), $u['id']]);
    audit('usuarios', 'sincronizar_origen', ['entidad' => 'usuario', 'entidad_id' => $u['id'], 'antes' => $antes, 'despues' => $despues]);
    return usuario_detalle((int)$u['id']);
});

route('PUT', '/usuarios/{id}', function ($p) {
    $staff = require_staff();
    $actual = usuario_detalle((int)$p['id']);
    if (!$actual) throw new HttpError(404, 'El usuario no existe.');
    $d = body();
    $esStaff = (bool)v_bool($d, 'es_staff');
    $activo = (bool)v_bool($d, 'activo');
    if ($actual['id'] === $staff['id'] && (!$esStaff || !$activo)) {
        throw new HttpError(422, 'No podés quitarte el rol staff ni darte de baja a vos mismo.');
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $origen = $actual['origen_usuario'];
        $fila = !empty($d['centros_origen']) && $origen && $actual['eddis_user_id'] ? origen_usuario_por_id($origen, $actual['eddis_user_id']) : null;
        $nuevo = ['es_staff' => $esStaff, 'activo' => $activo, 'centros' => centros_de_payload($d, $origen, $fila)];
        if (!$esStaff && !$nuevo['centros'] && $activo) throw new HttpError(422, 'Elegí al menos un centro.', ['campo' => 'centros']);
        q('UPDATE usuario SET es_staff = ?, activo = ? WHERE id = ?', [(int)$esStaff, (int)$activo, $actual['id']]);
        guardar_centros($actual['id'], $nuevo['centros']);
        audit('usuarios', 'actualizar', ['entidad' => 'usuario', 'entidad_id' => $actual['id'], 'critico' => true,
            'antes' => array_intersect_key($actual, $nuevo), 'despues' => $nuevo]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return usuario_detalle($actual['id']);
});
