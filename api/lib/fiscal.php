<?php
declare(strict_types=1);

const TIPOS_COMPROBANTE = [
    1 => 'Factura A',
    3 => 'Nota de Crédito A',
    6 => 'Factura B',
    8 => 'Nota de Crédito B',
    11 => 'Factura C',
    13 => 'Nota de Crédito C',
];

const NC_DE_FACTURA = [1 => 3, 6 => 8, 11 => 13];

/** Tipos de comprobante que emite (o consulta) un CUIT según su condición frente al IVA. */
function tipos_por_condicion(string $condicion): array
{
    return $condicion === 'RI' ? [1, 6, 3, 8] : [11, 13];
}

function tipo_factura(string $condicionEmisor, string $condicionReceptor): int
{
    if ($condicionEmisor !== 'RI') return 11;
    return $condicionReceptor === 'RI' ? 1 : 6;
}

/** Desglosa un total con IVA incluido. La alícuota del CUIT se aplica a toda la factura. */
function desglose_importes(float $total, string $condicionEmisor, float $alicuota): array
{
    $total = round($total, 2);
    if ($condicionEmisor !== 'RI' || $alicuota <= 0) {
        return ['neto' => $total, 'iva' => 0.0, 'alicuota' => 0.0, 'total' => $total];
    }
    $neto = round($total / (1 + $alicuota / 100), 2);
    return ['neto' => $neto, 'iva' => round($total - $neto, 2), 'alicuota' => $alicuota, 'total' => $total];
}

/** Facturado en el mes (facturas vigentes, cualquier estado) que consume el tope mensual del CUIT. */
function facturado_mes(int $cuitId, string $fecha, bool $forUpdate = false): float
{
    $ini = substr($fecha, 0, 7) . '-01';
    $fin = (new DateTimeImmutable($ini))->modify('last day of this month')->format('Y-m-d');
    $sql = "SELECT COALESCE(SUM(importe_total),0) FROM comprobante
            WHERE cuit_id = ? AND clase = 'FACTURA' AND anulado = 0 AND fecha BETWEEN ? AND ?";
    return (float)q_val($sql . ($forUpdate ? ' FOR UPDATE' : ''), [$cuitId, $ini, $fin]);
}

function cuit_de_centro(int $centroId, bool $required = true): ?array
{
    $c = q_one('SELECT * FROM cuit WHERE centro_id = ? AND activo = 1', [$centroId]);
    if (!$c && $required) throw new HttpError(409, 'El centro no tiene un CUIT activo. Cargalo en Administración → CUIT.');
    return $c;
}

function resumen_tope(array $cuit): array
{
    $hoy = date('Y-m-d');
    $tope = (float)$cuit['tope_facturacion'];
    $usado = facturado_mes((int)$cuit['id'], $hoy);
    return [
        'mes' => substr($hoy, 0, 7),
        'tope' => $tope,
        'facturado' => $usado,
        'disponible' => max(0, round($tope - $usado, 2)),
    ];
}

function comprobante_publico(array $c): array
{
    foreach (['id', 'cuit_id', 'centro_id', 'tipo', 'punto_venta', 'numero', 'receptor_doc_tipo', 'intentos', 'comprobante_asociado_id', 'creado_por'] as $k) {
        if (array_key_exists($k, $c) && $c[$k] !== null) $c[$k] = (int)$c[$k];
    }
    foreach (['alicuota', 'importe_neto', 'importe_iva', 'importe_total'] as $k) {
        if (isset($c[$k])) $c[$k] = (float)$c[$k];
    }
    foreach (['es_tercero', 'modo_prueba', 'simulado', 'anulado'] as $k) {
        if (isset($c[$k])) $c[$k] = (bool)$c[$k];
    }
    $c['tipo_nombre'] = TIPOS_COMPROBANTE[$c['tipo']] ?? ('Tipo ' . $c['tipo']);
    return $c;
}
