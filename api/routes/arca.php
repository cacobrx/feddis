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
        'tiene_certificado' => cuit_certificado($cuit) !== null,
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
    // Con real=1 se consulta ARCA aunque el CUIT tenga la autorización simulada.
    $simulado = arca_simulado($cuit) && !v_bool($_GET, 'real');
    $forzarReal = arca_simulado($cuit) && !$simulado;
    if (!$simulado) {
        // En toda consulta real el ambiente lo elige quien consulta: producción salvo que pida homologacion=1.
        // La marca "homologación" del CUIT viene activada por defecto y con un certificado de producción
        // ARCA responde "cms.cert.untrusted", así que no se usa para consultar.
        $cuit['modo_prueba'] = v_bool($_GET, 'homologacion');
    }

    try {
        $ultimo = api_arca_ultimo($cuit, $tipo, $forzarReal);
        $resultado = $numero !== null ? api_arca_consultar($cuit, $tipo, $numero, $forzarReal) : null;
    } catch (ExternalApiError $e) {
        // El staff ve también qué se envió y qué respondió la API, para diagnosticar.
        if ($u['es_staff']) throw new HttpError(502, $e->getMessage(), ['externo' => true, 'llamadas' => arca_consulta_log()]);
        throw $e;
    }
    if ($numero !== null) {
        if (!empty($resultado['comprobante'])) {
            $local = q_one('SELECT id, receptor_nombre, estado FROM comprobante WHERE cuit_id = ? AND punto_venta = ? AND tipo = ? AND numero = ? AND modo_prueba = ? AND simulado = ?',
                [$cuit['id'], $cuit['punto_venta'], $tipo, $numero, (int)$cuit['modo_prueba'], $simulado ? 1 : 0]);
            $resultado['local'] = $local ? ['id' => (int)$local['id'], 'receptor_nombre' => $local['receptor_nombre'], 'estado' => $local['estado']] : null;
        }
    }
    audit('consulta_arca', 'consultar', [
        'centro_id' => $centroId,
        'despues' => ['tipo' => TIPOS_COMPROBANTE[$tipo], 'numero' => $numero, 'real' => !$simulado, 'encontrado' => $resultado['encontrado'] ?? null, 'ultimo' => $ultimo],
    ]);
    return [
        'tipo' => $tipo,
        'tipo_nombre' => TIPOS_COMPROBANTE[$tipo],
        'punto_venta' => (int)$cuit['punto_venta'],
        'modo_prueba' => (bool)$cuit['modo_prueba'],
        'arca_simulado' => $simulado,
        'ultimo_numero' => $ultimo,
        'resultado' => $resultado,
        // Solo para staff: pedidos y respuestas crudas de la API de consulta (vacío si la consulta fue simulada).
        'llamadas' => $u['es_staff'] ? arca_consulta_log() : null,
    ];
});
