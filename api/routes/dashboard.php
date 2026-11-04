<?php
declare(strict_types=1);

route('GET', '/dashboard', function () {
    $u = require_user();
    $anio = v_int($_GET, 'anio', 'Año', false, 2000, 2100) ?? (int)date('Y');
    $ids = user_centro_ids($u);
    if (!$ids) return ['anio' => $anio, 'centros' => [], 'series' => [], 'certificados' => [], 'pendientes' => 0, 'errores' => 0, 'anios' => [$anio]];

    $centros = q_all('SELECT id, nombre, marca FROM centro WHERE id IN ' . in_list($ids) . ' ORDER BY marca, nombre', $ids);

    // Facturación neta autorizada (facturas menos notas de crédito), separando lo que no tiene validez fiscal:
    // CAE simulado o autorizado en homologación de ARCA. Se muestra todo, con su etiqueta.
    $rows = q_all("SELECT centro_id, MONTH(fecha) AS mes, (simulado = 1 OR modo_prueba = 1) AS sin_validez,
                          SUM(CASE WHEN clase = 'FACTURA' THEN importe_total ELSE -importe_total END) AS total,
                          SUM(clase = 'FACTURA') AS cant
                   FROM comprobante
                   WHERE estado = 'AUTORIZADO' AND YEAR(fecha) = ? AND centro_id IN " . in_list($ids) . '
                   GROUP BY centro_id, MONTH(fecha), sin_validez', [$anio, ...$ids]);

    $series = [];
    foreach ($centros as $c) $series[(int)$c['id']] = ['real' => array_fill(1, 12, 0.0), 'simulado' => array_fill(1, 12, 0.0)];
    $cantidad = 0;
    $cantidadSimuladas = 0;
    foreach ($rows as $r) {
        $tipo = (int)$r['sin_validez'] === 1 ? 'simulado' : 'real';
        $series[(int)$r['centro_id']][$tipo][(int)$r['mes']] = round((float)$r['total'], 2);
        $cantidad += (int)$r['cant'];
        if ($tipo === 'simulado') $cantidadSimuladas += (int)$r['cant'];
    }

    $certificados = q_all('SELECT c.id AS centro_id, c.nombre, c.marca, cu.cuit, cu.venc_certificado, cu.modo_prueba,
                                  DATEDIFF(cu.venc_certificado, CURDATE()) AS dias
                           FROM centro c LEFT JOIN cuit cu ON cu.centro_id = c.id AND cu.activo = 1
                           WHERE c.id IN ' . in_list($ids) . ' ORDER BY cu.venc_certificado IS NULL, cu.venc_certificado', $ids);

    $estados = q_all("SELECT estado, COUNT(*) AS n FROM comprobante WHERE estado <> 'AUTORIZADO' AND centro_id IN " . in_list($ids) . ' GROUP BY estado', $ids);
    $porEstado = array_column($estados, 'n', 'estado');

    $anios = array_map('intval', array_column(q_all('SELECT DISTINCT YEAR(fecha) AS a FROM comprobante WHERE centro_id IN ' . in_list($ids) . ' ORDER BY a DESC', $ids), 'a'));
    if (!in_array((int)date('Y'), $anios, true)) array_unshift($anios, (int)date('Y'));

    // Uso del tope del mes en curso por centro.
    $topes = [];
    foreach (q_all('SELECT * FROM cuit WHERE activo = 1 AND centro_id IN ' . in_list($ids), $ids) as $cu) {
        $topes[] = ['centro_id' => (int)$cu['centro_id']] + resumen_tope($cu);
    }

    return [
        'anio' => $anio,
        'anios' => $anios,
        'centros' => array_map(fn($c) => ['id' => (int)$c['id'], 'nombre' => $c['nombre'], 'marca' => $c['marca']], $centros),
        // meses = total (real + simulado); meses_simulado = la parte sin validez fiscal.
        'series' => array_map(fn($id, $s) => [
            'centro_id' => $id,
            'meses' => array_map(fn($a, $b) => round($a + $b, 2), array_values($s['real']), array_values($s['simulado'])),
            'meses_simulado' => array_values($s['simulado']),
        ], array_keys($series), $series),
        'cantidad_facturas' => $cantidad,
        'cantidad_simuladas' => $cantidadSimuladas,
        'certificados' => array_map(fn($r) => [
            'centro_id' => (int)$r['centro_id'], 'nombre' => $r['nombre'], 'marca' => $r['marca'], 'cuit' => $r['cuit'],
            'venc_certificado' => $r['venc_certificado'], 'dias' => $r['dias'] === null ? null : (int)$r['dias'],
        ], $certificados),
        'topes' => $topes,
        'pendientes' => (int)($porEstado['PENDIENTE'] ?? 0),
        'errores' => (int)($porEstado['ERROR'] ?? 0),
    ];
});
