<?php
declare(strict_types=1);

const CONDICION_IVA_CODIGO = ['RI' => 1, 'EXENTO' => 4, 'CF' => 5, 'MONOTRIBUTO' => 6];

function ids_de(array $d, string $k = 'ids'): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)($d[$k] ?? [])), fn($i) => $i > 0)));
    if (!$ids) throw new HttpError(422, 'Seleccioná al menos un registro.');
    if (count($ids) > 500) throw new HttpError(422, 'Se pueden procesar hasta 500 registros por vez.');
    sort($ids);
    return $ids;
}

function comprobante_con_acceso(array $u, int $id, bool $forUpdate = false): array
{
    $c = q_one('SELECT * FROM comprobante WHERE id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), [$id]);
    if (!$c || !in_array((int)$c['centro_id'], user_centro_ids($u), true)) {
        throw new HttpError(404, "El comprobante {$id} no existe o no pertenece a tus centros.");
    }
    return $c;
}

/* ---------- Generación desde pagos ---------- */

route('POST', '/comprobantes/generar', function () {
    $u = require_user();
    $d = body();
    $centroId = require_centro($u, $d['centro_id'] ?? null);
    [$desde, $hasta] = rango_fechas($d);
    $pagoIds = array_values(array_unique(array_map('strval', (array)($d['pago_ids'] ?? []))));
    if (!$pagoIds) throw new HttpError(422, 'Seleccioná al menos un pago.');
    $agrupar = v_bool($d, 'agrupar') === 1;

    $centro = centro_row($centroId);
    $cuit = cuit_de_centro($centroId);
    if ((float)$cuit['tope_facturacion'] <= 0) {
        throw new HttpError(409, 'El CUIT no tiene tope de facturación mensual cargado. Completalo en Administración → CUIT.');
    }

    // Los importes se toman de la API de Eddis, nunca del navegador.
    $disponibles = [];
    foreach (pagos_del_centro($centro, $cuit, $desde, $hasta, true) as $p) $disponibles[$p['id']] = $p;
    $faltan = array_diff($pagoIds, array_keys($disponibles));
    if ($faltan) throw new HttpError(409, 'Algunos pagos ya no figuran en Eddis para ese rango. Actualizá el listado.', ['pagos' => array_values($faltan)]);
    $pagos = array_map(fn($id) => $disponibles[$id], $pagoIds);

    $terceros = terceros_por_documento($centroId, array_column($pagos, 'documento'));

    // Agrupación: un comprobante por pago, o uno por alumno.
    $grupos = [];
    foreach ($pagos as $p) {
        $key = $agrupar ? 'doc:' . $p['documento'] : 'pago:' . $p['id'];
        $grupos[$key][] = $p;
    }

    $fecha = date('Y-m-d');
    $totalSeleccion = round(array_sum(array_column($pagos, 'importe')), 2);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        // Bloquea el CUIT para serializar el control de tope entre usuarios concurrentes.
        q('SELECT id FROM cuit WHERE id = ? FOR UPDATE', [$cuit['id']]);
        $usado = facturado_mes((int)$cuit['id'], $fecha);
        $tope = (float)$cuit['tope_facturacion'];
        if ($usado + $totalSeleccion > $tope + 0.001) {
            throw new HttpError(409, sprintf(
                'La selección supera el tope mensual. Disponible: $ %s; seleccionado: $ %s.',
                number_format(max(0, $tope - $usado), 2, ',', '.'),
                number_format($totalSeleccion, 2, ',', '.')
            ), ['disponible' => max(0, $tope - $usado)]);
        }

        $creados = [];
        foreach ($grupos as $grupo) {
            $p0 = $grupo[0];
            $t = $terceros[$p0['documento']] ?? null;
            $receptor = $t ? [
                'doc_tipo' => 80, 'doc_nro' => $t['cuit'], 'nombre' => $t['razon_social'],
                'domicilio' => $t['direccion'], 'ciudad' => $t['ciudad'], 'condicion' => $t['condicion_iva'],
            ] : [
                'doc_tipo' => $p0['documento'] !== '' ? 96 : 99, 'doc_nro' => $p0['documento'] ?: '0', 'nombre' => $p0['alumno'] ?: 'Consumidor final',
                'domicilio' => null, 'ciudad' => null, 'condicion' => 'CF',
            ];
            $total = round(array_sum(array_column($grupo, 'importe')), 2);
            $imp = desglose_importes($total, $cuit['condicion_iva'], (float)$cuit['alicuota']);
            $tipo = tipo_factura($cuit['condicion_iva'], $receptor['condicion']);

            q('INSERT INTO comprobante (cuit_id, centro_id, clase, tipo, punto_venta, fecha, receptor_doc_tipo, receptor_doc_nro, receptor_nombre,
                  receptor_domicilio, receptor_ciudad, receptor_condicion_iva, alumno_documento, alumno_nombre, es_tercero, alicuota,
                  importe_neto, importe_iva, importe_total, estado, modo_prueba, creado_por)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
                $cuit['id'], $centroId, 'FACTURA', $tipo, $cuit['punto_venta'], $fecha,
                $receptor['doc_tipo'], $receptor['doc_nro'], $receptor['nombre'], $receptor['domicilio'], $receptor['ciudad'], $receptor['condicion'],
                $p0['documento'] ?: null, $p0['alumno'] ?: null, $t ? 1 : 0, $imp['alicuota'],
                $imp['neto'], $imp['iva'], $imp['total'], 'PENDIENTE', $cuit['modo_prueba'], $u['id'],
            ]);
            $compId = (int)$pdo->lastInsertId();
            foreach ($grupo as $p) {
                q('INSERT INTO comprobante_pago (comprobante_id, pago_id_eddis, nro_cuota, fecha_pago, concepto, origen, importe) VALUES (?,?,?,?,?,?,?)',
                    [$compId, $p['id'], $p['nro_cuota'], $p['fecha'] ?: null, mb_substr($p['concepto'], 0, 200), $p['origen'], $p['importe']]);
            }
            $creados[] = $compId;
            audit('comprobantes', 'generar', [
                'centro_id' => $centroId, 'entidad' => 'comprobante', 'entidad_id' => $compId, 'critico' => true,
                'despues' => ['tipo' => TIPOS_COMPROBANTE[$tipo], 'receptor' => $receptor['nombre'], 'total' => $total, 'pagos' => array_column($grupo, 'id')],
            ]);
        }
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ($e->getCode() === '23000') {
            throw new HttpError(409, 'Uno o más pagos ya están facturados. Actualizá el listado.');
        }
        throw $e;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return ['creados' => count($creados), 'ids' => $creados, 'total' => $totalSeleccion, 'tope' => resumen_tope($cuit)];
});

/* ---------- Listado y detalle ---------- */

route('GET', '/comprobantes', function () {
    $u = require_user();
    $centroId = require_centro($u, $_GET['centro_id'] ?? null);
    $desde = v_date($_GET, 'desde', 'Desde', false);
    $hasta = v_date($_GET, 'hasta', 'Hasta', false);
    $estado = v_enum($_GET, 'estado', 'Estado', ['PENDIENTE', 'AUTORIZADO', 'ERROR'], false);
    $clase = v_enum($_GET, 'clase', 'Clase', ['FACTURA', 'NOTA_CREDITO'], false);
    $texto = trim((string)($_GET['q'] ?? ''));

    $where = ['c.centro_id = ?'];
    $params = [$centroId];
    if ($desde) { $where[] = 'c.fecha >= ?'; $params[] = $desde; }
    if ($hasta) { $where[] = 'c.fecha <= ?'; $params[] = $hasta; }
    if ($estado) { $where[] = 'c.estado = ?'; $params[] = $estado; }
    if ($clase) { $where[] = 'c.clase = ?'; $params[] = $clase; }
    if ($texto !== '') {
        $where[] = '(c.receptor_nombre LIKE ? OR c.receptor_doc_nro LIKE ? OR c.alumno_nombre LIKE ? OR c.alumno_documento LIKE ? OR c.numero = ? OR c.cae = ?)';
        $like = '%' . $texto . '%';
        array_push($params, $like, $like, $like, $like, ctype_digit($texto) ? (int)$texto : -1, $texto);
    }

    $rows = q_all('SELECT c.*, a.tipo AS asociado_tipo, a.numero AS asociado_numero, a.punto_venta AS asociado_pv,
                     (SELECT COUNT(*) FROM comprobante_pago cp WHERE cp.comprobante_id = c.id) AS cant_pagos,
                     (SELECT GROUP_CONCAT(CONCAT_WS(CHAR(126), cp.pago_id_eddis, COALESCE(cp.nro_cuota, ""), COALESCE(cp.fecha_pago, ""), cp.activo) ORDER BY cp.id SEPARATOR "|")
                        FROM comprobante_pago cp WHERE cp.comprobante_id = c.id) AS pagos_ref,
                     (SELECT n.id FROM comprobante n WHERE n.comprobante_asociado_id = c.id ORDER BY n.id DESC LIMIT 1) AS nota_credito_id,
                     CONCAT(us.nombre, " ", us.apellido) AS creado_por_nombre
                   FROM comprobante c
                   LEFT JOIN comprobante a ON a.id = c.comprobante_asociado_id
                   LEFT JOIN usuario us ON us.id = c.creado_por
                   WHERE ' . implode(' AND ', $where) . '
                   ORDER BY c.fecha DESC, c.id DESC
                   LIMIT 2000', $params);

    $out = array_map(function ($r) {
        $c = comprobante_publico($r);
        $c['cant_pagos'] = (int)$r['cant_pagos'];
        $c['pagos'] = array_map(function ($x) {
            [$id, $cuota, $fecha, $activo] = array_pad(explode('~', $x), 4, '');
            return ['pago_id_eddis' => $id, 'nro_cuota' => $cuota === '' ? null : (int)$cuota, 'fecha_pago' => $fecha ?: null, 'activo' => $activo === '1'];
        }, $r['pagos_ref'] ? explode('|', $r['pagos_ref']) : []);
        unset($c['pagos_ref']);
        $c['nota_credito_id'] = $r['nota_credito_id'] ? (int)$r['nota_credito_id'] : null;
        $c['asociado'] = $r['asociado_tipo'] ? [
            'tipo_nombre' => TIPOS_COMPROBANTE[(int)$r['asociado_tipo']] ?? '',
            'punto_venta' => (int)$r['asociado_pv'],
            'numero' => $r['asociado_numero'] === null ? null : (int)$r['asociado_numero'],
        ] : null;
        unset($c['asociado_tipo'], $c['asociado_numero'], $c['asociado_pv']);
        return $c;
    }, $rows);

    $resumen = ['PENDIENTE' => 0, 'AUTORIZADO' => 0, 'ERROR' => 0];
    foreach ($out as $c) $resumen[$c['estado']]++;
    return ['comprobantes' => $out, 'resumen' => $resumen];
});

function comprobante_detalle(array $u, int $id): array
{
    $c = comprobante_publico(comprobante_con_acceso($u, $id));
    $c['pagos'] = array_map(fn($r) => [
        'pago_id_eddis' => $r['pago_id_eddis'], 'nro_cuota' => $r['nro_cuota'] === null ? null : (int)$r['nro_cuota'],
        'fecha_pago' => $r['fecha_pago'], 'concepto' => $r['concepto'], 'origen' => $r['origen'],
        'importe' => (float)$r['importe'], 'activo' => (bool)$r['activo'],
    ], q_all('SELECT * FROM comprobante_pago WHERE comprobante_id = ? ORDER BY id', [$c['id']]));
    $c['emisor'] = q_one('SELECT cuit, razon_social, nombre_fantasia, domicilio, ciudad, condicion_iva, ingresos_brutos, inicio_actividades FROM cuit WHERE id = ?', [$c['cuit_id']]);
    $c['asociado'] = null;
    if ($c['comprobante_asociado_id']) {
        $a = q_one('SELECT id, tipo, punto_venta, numero, fecha, cuit_id FROM comprobante WHERE id = ?', [$c['comprobante_asociado_id']]);
        $c['asociado'] = $a ? comprobante_publico($a) : null;
    }
    return $c;
}

route('GET', '/comprobantes/{id}', function ($p) {
    return comprobante_detalle(require_user(), (int)$p['id']);
});

/* ---------- Impresión ---------- */

route('GET', '/impresion/comprobantes', function () {
    $u = require_user();
    $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', (string)($_GET['ids'] ?? ''))), fn($i) => $i > 0)));
    if (!$ids) throw new HttpError(422, 'Indicá qué comprobantes imprimir.');
    if (count($ids) > 200) throw new HttpError(422, 'Se pueden imprimir hasta 200 comprobantes por vez.');
    $out = [];
    $omitidos = 0;
    foreach ($ids as $id) {
        $c = comprobante_detalle($u, $id);
        // Solo un comprobante autorizado tiene CAE: los pendientes o rechazados no se imprimen.
        if ($c['estado'] !== 'AUTORIZADO') { $omitidos++; continue; }
        $out[] = $c;
        audit('comprobantes', 'imprimir', ['centro_id' => $c['centro_id'], 'entidad' => 'comprobante', 'entidad_id' => $id,
            'despues' => ['tipo' => $c['tipo_nombre'], 'numero' => $c['numero'], 'simulado' => $c['simulado']]]);
    }
    return ['comprobantes' => $out, 'omitidos' => $omitidos];
});

/* ---------- Autorización en ARCA ---------- */

function payload_arca(array $c, array $cuit): array
{
    $asociado = null;
    if ($c['comprobante_asociado_id']) {
        $a = q_one('SELECT tipo, punto_venta, numero, fecha, estado FROM comprobante WHERE id = ?', [$c['comprobante_asociado_id']]);
        if (!$a || $a['estado'] !== 'AUTORIZADO') throw new RuntimeException('La factura asociada no está autorizada.');
        $asociado = ['tipo' => (int)$a['tipo'], 'punto_venta' => (int)$a['punto_venta'], 'numero' => (int)$a['numero'], 'cuit' => $cuit['cuit'], 'fecha' => $a['fecha']];
    }
    return [
        'referencia' => (int)$c['id'],
        'cuit' => $cuit['cuit'],
        'punto_venta' => (int)$c['punto_venta'],
        'tipo' => (int)$c['tipo'],
        'concepto' => 2, // servicios
        'fecha' => $c['fecha'],
        'servicio_desde' => $c['fecha'],
        'servicio_hasta' => $c['fecha'],
        'vencimiento_pago' => $c['fecha'],
        'moneda' => 'PES',
        'receptor' => [
            'doc_tipo' => (int)$c['receptor_doc_tipo'],
            'doc_nro' => $c['receptor_doc_nro'],
            'nombre' => $c['receptor_nombre'],
            'condicion_iva' => $c['receptor_condicion_iva'],
            'condicion_iva_codigo' => CONDICION_IVA_CODIGO[$c['receptor_condicion_iva']] ?? 5,
        ],
        'importes' => [
            'neto' => (float)$c['importe_neto'],
            'iva' => (float)$c['importe_iva'],
            'alicuota' => (float)$c['alicuota'],
            'total' => (float)$c['importe_total'],
        ],
        'asociado' => $asociado,
        'homologacion' => (int)$c['modo_prueba'] === 1,
        '_cuit_id' => (int)$cuit['id'],
        '_certificado_vencido' => $cuit['venc_certificado'] && $cuit['venc_certificado'] < date('Y-m-d'),
    ];
}

route('POST', '/comprobantes/autorizar', function () {
    $u = require_user();
    $ids = ids_de(body());
    $resultados = [];

    foreach ($ids as $id) {
        $lock = "eddisfac_comp_{$id}";
        if ((int)q_val('SELECT GET_LOCK(?, 0)', [$lock]) !== 1) {
            $resultados[] = ['id' => $id, 'ok' => false, 'error' => 'Otro usuario lo está autorizando en este momento.'];
            continue;
        }
        try {
            $c = comprobante_con_acceso($u, $id);
            if ($c['estado'] === 'AUTORIZADO') {
                $resultados[] = ['id' => $id, 'ok' => false, 'error' => 'Ya estaba autorizado.'];
                continue;
            }
            $cuit = q_one('SELECT * FROM cuit WHERE id = ?', [$c['cuit_id']]);
            $simulado = arca_simulado($cuit);
            try {
                $r = api_arca_autorizar(payload_arca($c, $cuit), $simulado);
            } catch (ExternalApiError | RuntimeException $e) {
                $r = ['ok' => false, 'error' => $e->getMessage(), 'numero' => null, 'cae' => null, 'venc_cae' => null];
            }

            $pdo = db();
            $pdo->beginTransaction();
            if ($r['ok']) {
                q("UPDATE comprobante SET estado = 'AUTORIZADO', numero = ?, cae = ?, venc_cae = ?, error_arca = NULL, simulado = ?,
                      intentos = intentos + 1, autorizado_at = NOW() WHERE id = ?", [$r['numero'], $r['cae'], $r['venc_cae'] ?: null, $simulado ? 1 : 0, $id]);
                if ($c['clase'] === 'NOTA_CREDITO' && $c['comprobante_asociado_id']) {
                    // La factura anulada libera sus pagos: vuelven a estar disponibles.
                    q('UPDATE comprobante SET anulado = 1 WHERE id = ?', [$c['comprobante_asociado_id']]);
                    q('UPDATE comprobante_pago SET activo = 0 WHERE comprobante_id = ?', [$c['comprobante_asociado_id']]);
                }
            } else {
                q("UPDATE comprobante SET estado = 'ERROR', error_arca = ?, intentos = intentos + 1 WHERE id = ?", [$r['error'], $id]);
            }
            audit('comprobantes', $r['ok'] ? 'autorizar_ok' : 'autorizar_error', [
                'centro_id' => (int)$c['centro_id'], 'entidad' => 'comprobante', 'entidad_id' => $id, 'critico' => true,
                'antes' => ['estado' => $c['estado']],
                'despues' => $r['ok']
                    ? ['estado' => 'AUTORIZADO', 'numero' => $r['numero'], 'cae' => $r['cae'], 'modo_prueba' => (bool)$c['modo_prueba'], 'simulado' => $simulado]
                    : ['estado' => 'ERROR', 'error' => $r['error']],
            ]);
            $pdo->commit();
            $resultados[] = ['id' => $id, 'ok' => $r['ok'], 'numero' => $r['numero'], 'cae' => $r['cae'], 'venc_cae' => $r['venc_cae'] ?? null, 'simulado' => $simulado, 'error' => $r['error']];
        } catch (HttpError $e) {
            $resultados[] = ['id' => $id, 'ok' => false, 'error' => $e->getMessage()];
        } catch (Throwable $e) {
            if (db()->inTransaction()) db()->rollBack();
            error_log('[eddisfac] autorizar ' . $id . ': ' . $e);
            $resultados[] = ['id' => $id, 'ok' => false, 'error' => 'Error interno al guardar el resultado.'];
        } finally {
            q('SELECT RELEASE_LOCK(?)', [$lock]);
        }
    }

    $ok = count(array_filter($resultados, fn($r) => $r['ok']));
    return ['autorizados' => $ok, 'con_error' => count($resultados) - $ok, 'resultados' => $resultados];
});

/* ---------- Notas de crédito en lote ---------- */

route('POST', '/comprobantes/notas-credito', function () {
    $u = require_user();
    $ids = ids_de(body());
    $pdo = db();
    $pdo->beginTransaction();
    $creadas = [];
    $omitidas = [];
    try {
        foreach ($ids as $id) {
            $f = comprobante_con_acceso($u, $id, true);
            if ($f['clase'] !== 'FACTURA' || $f['estado'] !== 'AUTORIZADO' || (int)$f['anulado'] === 1) {
                $omitidas[] = ['id' => $id, 'motivo' => 'Solo se anulan facturas autorizadas y vigentes.'];
                continue;
            }
            $existe = q_val("SELECT id FROM comprobante WHERE comprobante_asociado_id = ? AND clase = 'NOTA_CREDITO'", [$id]);
            if ($existe) {
                $omitidas[] = ['id' => $id, 'motivo' => 'Ya tiene una nota de crédito generada.'];
                continue;
            }
            $cuit = q_one('SELECT * FROM cuit WHERE id = ?', [$f['cuit_id']]);
            q('INSERT INTO comprobante (cuit_id, centro_id, clase, tipo, punto_venta, fecha, receptor_doc_tipo, receptor_doc_nro, receptor_nombre,
                  receptor_domicilio, receptor_ciudad, receptor_condicion_iva, alumno_documento, alumno_nombre, es_tercero, alicuota,
                  importe_neto, importe_iva, importe_total, estado, modo_prueba, comprobante_asociado_id, creado_por)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
                $f['cuit_id'], $f['centro_id'], 'NOTA_CREDITO', NC_DE_FACTURA[(int)$f['tipo']], $cuit['punto_venta'], date('Y-m-d'),
                $f['receptor_doc_tipo'], $f['receptor_doc_nro'], $f['receptor_nombre'], $f['receptor_domicilio'], $f['receptor_ciudad'],
                $f['receptor_condicion_iva'], $f['alumno_documento'], $f['alumno_nombre'], $f['es_tercero'], $f['alicuota'],
                $f['importe_neto'], $f['importe_iva'], $f['importe_total'], 'PENDIENTE', $f['modo_prueba'], $id, $u['id'],
            ]);
            $ncId = (int)$pdo->lastInsertId();
            $creadas[] = $ncId;
            audit('comprobantes', 'generar_nota_credito', [
                'centro_id' => (int)$f['centro_id'], 'entidad' => 'comprobante', 'entidad_id' => $ncId, 'critico' => true,
                'despues' => ['factura_id' => $id, 'factura_numero' => (int)$f['numero'], 'total' => (float)$f['importe_total']],
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['creadas' => count($creadas), 'ids' => $creadas, 'omitidas' => $omitidas];
});

/* ---------- Eliminación de comprobantes no autorizados ---------- */

route('DELETE', '/comprobantes/{id}', function ($p) {
    $u = require_user();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $c = comprobante_con_acceso($u, (int)$p['id'], true);
        if ($c['estado'] === 'AUTORIZADO') throw new HttpError(409, 'Un comprobante autorizado no se elimina: emití una nota de crédito.');
        $pagos = array_column(q_all('SELECT pago_id_eddis FROM comprobante_pago WHERE comprobante_id = ?', [$c['id']]), 'pago_id_eddis');
        q('DELETE FROM comprobante WHERE id = ?', [$c['id']]);
        audit('comprobantes', 'eliminar', [
            'centro_id' => (int)$c['centro_id'], 'entidad' => 'comprobante', 'entidad_id' => $c['id'], 'critico' => true,
            'antes' => ['clase' => $c['clase'], 'tipo' => TIPOS_COMPROBANTE[(int)$c['tipo']], 'estado' => $c['estado'],
                        'receptor' => $c['receptor_nombre'], 'total' => (float)$c['importe_total'], 'pagos' => $pagos],
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['ok' => true];
});
