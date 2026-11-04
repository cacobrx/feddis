<?php
declare(strict_types=1);

route('GET', '/centros', function () {
    require_staff();
    return array_map(fn($r) => [
        'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'marca' => $r['marca'], 'codigo_eddis' => $r['codigo_eddis'],
        'activo' => (bool)$r['activo'], 'tiene_cuit' => (bool)$r['tiene_cuit'], 'usuarios' => (int)$r['usuarios'],
    ], q_all('SELECT c.*, EXISTS(SELECT 1 FROM cuit cu WHERE cu.centro_id = c.id AND cu.activo = 1) AS tiene_cuit,
                     (SELECT COUNT(*) FROM usuario_centro uc WHERE uc.centro_id = c.id) AS usuarios
              FROM centro c ORDER BY c.marca, c.nombre'));
});

function centro_validar(array $d): array
{
    return [
        'nombre' => v_str($d, 'nombre', 'Nombre', true, 120),
        'marca' => v_enum($d, 'marca', 'Marca', ['EDDIS', 'SB']),
        'codigo_eddis' => v_str($d, 'codigo_eddis', 'Código en Eddis', false, 40),
        'activo' => array_key_exists('activo', $d) ? v_bool($d, 'activo') : 1,
    ];
}

route('POST', '/centros', function () {
    require_staff();
    $v = centro_validar(body());
    if (q_val('SELECT id FROM centro WHERE nombre = ?', [$v['nombre']])) throw new HttpError(409, 'Ya existe un centro con ese nombre.', ['campo' => 'nombre']);
    q('INSERT INTO centro (nombre, marca, codigo_eddis, activo) VALUES (?,?,?,?)', array_values($v));
    $id = (int)db()->lastInsertId();
    audit('centros', 'crear', ['centro_id' => $id, 'entidad' => 'centro', 'entidad_id' => $id, 'despues' => $v]);
    return ['id' => $id];
});

route('PUT', '/centros/{id}', function ($p) {
    require_staff();
    $actual = q_one('SELECT * FROM centro WHERE id = ?', [(int)$p['id']]);
    if (!$actual) throw new HttpError(404, 'El centro no existe.');
    $v = centro_validar(body());
    if (q_val('SELECT id FROM centro WHERE nombre = ? AND id <> ?', [$v['nombre'], $actual['id']])) throw new HttpError(409, 'Ya existe un centro con ese nombre.', ['campo' => 'nombre']);
    [$antes, $despues] = diff_campos($actual, $v);
    if (!$despues) return ['ok' => true];
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($despues)));
    q("UPDATE centro SET $sets WHERE id = ?", [...array_values($despues), $actual['id']]);
    audit('centros', 'actualizar', ['centro_id' => (int)$actual['id'], 'entidad' => 'centro', 'entidad_id' => $actual['id'], 'antes' => $antes, 'despues' => $despues]);
    return ['ok' => true];
});
