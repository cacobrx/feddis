<?php
declare(strict_types=1);

function tercero_validar(array $d): array
{
    return [
        'documento_alumno' => v_documento($d, 'documento_alumno', 'Documento del alumno'),
        'nombre_alumno' => v_str($d, 'nombre_alumno', 'Nombre del alumno', false, 160),
        'razon_social' => v_str($d, 'razon_social', 'Razón social', true, 160),
        'direccion' => v_str($d, 'direccion', 'Dirección', false, 200),
        'ciudad' => v_str($d, 'ciudad', 'Ciudad', false, 120),
        'cuit' => v_cuit($d, 'cuit'),
        'condicion_iva' => v_enum($d, 'condicion_iva', 'Condición IVA', ['RI', 'MONOTRIBUTO', 'EXENTO', 'CF']),
    ];
}

function tercero_con_acceso(array $u, int $id): array
{
    $t = q_one('SELECT * FROM tercero WHERE id = ?', [$id]);
    if (!$t || !in_array((int)$t['centro_id'], user_centro_ids($u), true)) throw new HttpError(404, 'El registro no existe.');
    return $t;
}

route('GET', '/terceros', function () {
    $u = require_user();
    $centroId = require_centro($u, $_GET['centro_id'] ?? null);
    $rows = q_all('SELECT * FROM tercero WHERE centro_id = ? ORDER BY razon_social, documento_alumno', [$centroId]);
    return array_map(function ($r) {
        $r['id'] = (int)$r['id'];
        $r['centro_id'] = (int)$r['centro_id'];
        return $r;
    }, $rows);
});

route('POST', '/terceros', function () {
    $u = require_user();
    $d = body();
    $centroId = require_centro($u, $d['centro_id'] ?? null);
    $v = tercero_validar($d) + ['centro_id' => $centroId];
    if (q_val('SELECT id FROM tercero WHERE centro_id = ? AND documento_alumno = ?', [$centroId, $v['documento_alumno']])) {
        throw new HttpError(409, 'Ese alumno ya tiene datos de terceros en este centro.', ['campo' => 'documento_alumno']);
    }
    $cols = array_keys($v);
    q('INSERT INTO tercero (' . implode(',', $cols) . ') VALUES ' . in_list($cols), array_values($v));
    $id = (int)db()->lastInsertId();
    audit('terceros', 'crear', ['centro_id' => $centroId, 'entidad' => 'tercero', 'entidad_id' => $id, 'despues' => $v]);
    return ['id' => $id];
});

route('PUT', '/terceros/{id}', function ($p) {
    $u = require_user();
    $t = tercero_con_acceso($u, (int)$p['id']);
    $v = tercero_validar(body());
    if ($v['documento_alumno'] !== $t['documento_alumno']
        && q_val('SELECT id FROM tercero WHERE centro_id = ? AND documento_alumno = ? AND id <> ?', [$t['centro_id'], $v['documento_alumno'], $t['id']])) {
        throw new HttpError(409, 'Ese alumno ya tiene datos de terceros en este centro.', ['campo' => 'documento_alumno']);
    }
    [$antes, $despues] = diff_campos($t, $v);
    if (!$despues) return ['ok' => true];
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($despues)));
    q("UPDATE tercero SET $sets WHERE id = ?", [...array_values($despues), $t['id']]);
    audit('terceros', 'actualizar', ['centro_id' => (int)$t['centro_id'], 'entidad' => 'tercero', 'entidad_id' => $t['id'], 'antes' => $antes, 'despues' => $despues]);
    return ['ok' => true];
});

route('DELETE', '/terceros/{id}', function ($p) {
    $u = require_user();
    $t = tercero_con_acceso($u, (int)$p['id']);
    q('DELETE FROM tercero WHERE id = ?', [$t['id']]);
    audit('terceros', 'eliminar', ['centro_id' => (int)$t['centro_id'], 'entidad' => 'tercero', 'entidad_id' => $t['id'], 'antes' => $t]);
    return ['ok' => true];
});
