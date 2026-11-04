<?php
declare(strict_types=1);

route('GET', '/arca/tipos', function () {
    $u = require_user();
    $centroId = require_centro($u, $_GET['centro_id'] ?? null);
    $cuit = cuit_de_centro($centroId);
    return [
        'condicion_iva' => $cuit['condicion_iva'],
        'punto_venta' => (int)$cuit['punto_venta'],
        'cuit' => $cuit['cuit'],
        'modo_prueba' => (bool)$cuit['modo_prueba'],
        'arca_simulado' => arca_simulado($cuit),
        'tipos' => array_map(fn($t) => ['codigo' => $t, 'nombre' => TIPOS_COMPROBANTE[$t]], tipos_por_condicion($cuit['condicion_iva'])),
    ];
});

route('GET', '/arca/consultar', function () {
    $u = require_user();
    $centroId = require_centro($u, $_GET['centro_id'] ?? null);
    $cuit = cuit_de_centro($centroId);
    $tipo = v_int($_GET, 'tipo', 'Tipo de comprobante', true, 1, 99);
    if (!in_array($tipo, tipos_por_condicion($cuit['condicion_iva']), true)) {
        throw new HttpError(422, 'Ese tipo de comprobante no corresponde a la condición IVA del CUIT.');
    }
    $numero = v_int($_GET, 'numero', 'Número', false, 1, 99999999);

    $ultimo = api_arca_ultimo($cuit, $tipo);
    $resultado = null;
    if ($numero !== null) {
        $resultado = api_arca_consultar($cuit, $tipo, $numero);
        if (!empty($resultado['comprobante'])) {
            $local = q_one('SELECT id, receptor_nombre, estado FROM comprobante WHERE cuit_id = ? AND tipo = ? AND numero = ? AND modo_prueba = ?',
                [$cuit['id'], $tipo, $numero, (int)$cuit['modo_prueba']]);
            $resultado['local'] = $local ? ['id' => (int)$local['id'], 'receptor_nombre' => $local['receptor_nombre'], 'estado' => $local['estado']] : null;
        }
    }
    audit('consulta_arca', 'consultar', [
        'centro_id' => $centroId,
        'despues' => ['tipo' => TIPOS_COMPROBANTE[$tipo], 'numero' => $numero, 'encontrado' => $resultado['encontrado'] ?? null, 'ultimo' => $ultimo],
    ]);
    return [
        'tipo' => $tipo,
        'tipo_nombre' => TIPOS_COMPROBANTE[$tipo],
        'punto_venta' => (int)$cuit['punto_venta'],
        'modo_prueba' => (bool)$cuit['modo_prueba'],
        'arca_simulado' => arca_simulado($cuit),
        'ultimo_numero' => $ultimo,
        'resultado' => $resultado,
    ];
});
