<?php
declare(strict_types=1);

const MAX_DIAS_RANGO_PAGOS = 186;

function centro_row(int $id): array
{
    $c = q_one('SELECT * FROM centro WHERE id = ?', [$id]);
    if (!$c) throw new HttpError(404, 'El centro no existe.');
    $c['id'] = (int)$c['id'];
    return $c;
}

function rango_fechas(array $d): array
{
    $desde = v_date($d, 'desde', 'Desde');
    $hasta = v_date($d, 'hasta', 'Hasta');
    if ($desde > $hasta) throw new HttpError(422, 'La fecha Desde no puede ser posterior a Hasta.');
    $dias = (new DateTimeImmutable($desde))->diff(new DateTimeImmutable($hasta))->days;
    if ($dias > MAX_DIAS_RANGO_PAGOS) throw new HttpError(422, 'El rango máximo es de seis meses.');
    return [$desde, $hasta];
}

const CACHE_PAGOS_MINUTOS = 30;

/**
 * Pagos del centro desde la API de Eddis, ya filtrados por la regla de cuota 99 del CUIT.
 * Con $usarCache, reutiliza la última respuesta del mismo centro y rango si tiene menos de 30 minutos.
 */
function pagos_del_centro(array $centro, ?array $cuit, string $desde, string $hasta, bool $usarCache = false): array
{
    $cuota99 = $cuit && (int)$cuit['importar_cuota_99'] === 1;
    $clave = sha1(implode('|', [$centro['id'], $centro['codigo_eddis'], $desde, $hasta, (int)$cuota99, conf('url_pagos_eddis')]));
    $pagos = null;
    if ($usarCache) {
        $raw = q_val('SELECT datos FROM cache_pagos WHERE clave = ? AND created_at > NOW() - INTERVAL ' . CACHE_PAGOS_MINUTOS . ' MINUTE', [$clave]);
        if ($raw !== null) $pagos = json_decode((string)$raw, true);
    }
    if (!is_array($pagos)) {
        // La consulta puede ser lenta: se libera la sesión para no bloquear otras solicitudes del usuario.
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        set_time_limit(TIMEOUT_PAGOS + 30);
        $pagos = api_pagos($centro, $desde, $hasta, $cuota99);
        q('REPLACE INTO cache_pagos (clave, datos) VALUES (?, ?)', [$clave, json_encode($pagos, JSON_UNESCAPED_UNICODE)]);
        q('DELETE FROM cache_pagos WHERE created_at < NOW() - INTERVAL 1 DAY');
    }
    if (!$cuota99) $pagos = array_values(array_filter($pagos, fn($p) => (int)$p['nro_cuota'] !== 99));
    return $pagos;
}

function terceros_por_documento(int $centroId, array $documentos): array
{
    $documentos = array_values(array_unique(array_filter($documentos)));
    if (!$documentos) return [];
    $rows = q_all('SELECT * FROM tercero WHERE centro_id = ? AND documento_alumno IN ' . in_list($documentos), [$centroId, ...$documentos]);
    $out = [];
    foreach ($rows as $r) $out[$r['documento_alumno']] = $r;
    return $out;
}

route('GET', '/pagos', function () {
    $u = require_user();
    $centroId = require_centro($u, $_GET['centro_id'] ?? null);
    [$desde, $hasta] = rango_fechas($_GET);
    $cuotaDesde = v_int($_GET, 'cuota_desde', 'Desde cuota', false, 0, 999);
    $origen = v_enum($_GET, 'origen', 'Origen', ['CENTRAL', 'PROPIO'], false);

    $centro = centro_row($centroId);
    $cuit = cuit_de_centro($centroId, false);
    $pagos = pagos_del_centro($centro, $cuit, $desde, $hasta);

    if ($cuotaDesde !== null) $pagos = array_values(array_filter($pagos, fn($p) => (int)$p['nro_cuota'] >= $cuotaDesde));
    if ($origen) $pagos = array_values(array_filter($pagos, fn($p) => $p['origen'] === $origen));

    $ids = array_column($pagos, 'id');
    $facturados = [];
    if ($ids) {
        $rows = q_all("SELECT cp.pago_id_eddis, c.id, c.tipo, c.punto_venta, c.numero, c.estado
                       FROM comprobante_pago cp JOIN comprobante c ON c.id = cp.comprobante_id
                       WHERE cp.activo = 1 AND cp.pago_id_eddis IN " . in_list($ids), $ids);
        foreach ($rows as $r) {
            $facturados[$r['pago_id_eddis']] = [
                'id' => (int)$r['id'],
                'tipo_nombre' => TIPOS_COMPROBANTE[(int)$r['tipo']] ?? '',
                'punto_venta' => (int)$r['punto_venta'],
                'numero' => $r['numero'] === null ? null : (int)$r['numero'],
                'estado' => $r['estado'],
            ];
        }
    }
    $terceros = terceros_por_documento($centroId, array_column($pagos, 'documento'));

    foreach ($pagos as &$p) {
        $p['comprobante'] = $facturados[$p['id']] ?? null;
        $t = $terceros[$p['documento']] ?? null;
        $p['tercero'] = $t ? ['razon_social' => $t['razon_social'], 'cuit' => $t['cuit']] : null;
    }
    unset($p);
    usort($pagos, fn($a, $b) => [$a['fecha'], $a['id']] <=> [$b['fecha'], $b['id']]);

    audit('pagos', 'consultar', [
        'centro_id' => $centroId,
        'despues' => ['desde' => $desde, 'hasta' => $hasta, 'cuota_desde' => $cuotaDesde, 'origen' => $origen, 'resultados' => count($pagos)],
    ]);

    return [
        'pagos' => $pagos,
        'cuit' => $cuit ? [
            'id' => (int)$cuit['id'],
            'cuit' => $cuit['cuit'],
            'razon_social' => $cuit['razon_social'],
            'condicion_iva' => $cuit['condicion_iva'],
            'importar_cuota_99' => (bool)$cuit['importar_cuota_99'],
            'modo_prueba' => (bool)$cuit['modo_prueba'],
            'arca_simulado' => (bool)$cuit['arca_simulado'],
        ] : null,
        'tope' => $cuit ? resumen_tope($cuit) : null,
    ];
});
