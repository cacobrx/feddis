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
    $cols = array_keys($v);
    q('INSERT INTO cuit (' . implode(',', $cols) . ') VALUES ' . in_list($cols), array_values($v));
    $id = (int)db()->lastInsertId();
    audit('cuit', 'crear', ['centro_id' => $v['centro_id'], 'entidad' => 'cuit', 'entidad_id' => $id, 'despues' => $v]);
    return ['id' => $id];
});

route('PUT', '/cuits/{id}', function ($p) {
    $u = require_user();
    $actual = q_one('SELECT * FROM cuit WHERE id = ?', [(int)$p['id']]);
    if (!$actual) throw new HttpError(404, 'El CUIT no existe.');
    require_centro($u, $actual['centro_id']);

    $v = cuit_validar(body(), $u, false);
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
