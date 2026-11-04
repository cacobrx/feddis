<?php
declare(strict_types=1);

route('GET', '/auditoria', function () {
    $u = require_user();
    $g = $_GET;
    $desde = v_date($g, 'desde', 'Desde', false);
    $hasta = v_date($g, 'hasta', 'Hasta', false);
    $pagina = max(1, (int)($g['pagina'] ?? 1));
    $porPagina = 50;

    $where = ['1=1'];
    $params = [];
    if (!$u['es_staff']) {
        // El usuario no staff ve solo las acciones que realizó él.
        $where[] = 'a.usuario_id = ?';
        $params[] = $u['id'];
    } elseif (!empty($g['usuario_id'])) {
        $where[] = 'a.usuario_id = ?';
        $params[] = (int)$g['usuario_id'];
    }
    if ($desde) { $where[] = 'a.fecha_hora >= ?'; $params[] = $desde . ' 00:00:00'; }
    if ($hasta) { $where[] = 'a.fecha_hora <= ?'; $params[] = $hasta . ' 23:59:59.999'; }
    if (!empty($g['centro_id'])) { $where[] = 'a.centro_id = ?'; $params[] = (int)$g['centro_id']; }
    if (!empty($g['modulo'])) { $where[] = 'a.modulo = ?'; $params[] = (string)$g['modulo']; }
    if (!empty($g['accion'])) { $where[] = 'a.accion = ?'; $params[] = (string)$g['accion']; }

    $w = implode(' AND ', $where);
    $total = (int)q_val("SELECT COUNT(*) FROM auditoria a WHERE $w", $params);
    $rows = q_all("SELECT a.*, c.nombre AS centro_nombre FROM auditoria a LEFT JOIN centro c ON c.id = a.centro_id
                   WHERE $w ORDER BY a.id DESC LIMIT $porPagina OFFSET " . (($pagina - 1) * $porPagina), $params);

    $filtroUsuario = $u['es_staff'] ? '' : ' WHERE usuario_id = ' . (int)$u['id'];
    return [
        'registros' => array_map(fn($r) => [
            'id' => (int)$r['id'],
            'fecha_hora' => $r['fecha_hora'],
            'usuario_id' => $r['usuario_id'] === null ? null : (int)$r['usuario_id'],
            'usuario_documento' => $r['usuario_documento'],
            'usuario_nombre' => $r['usuario_nombre'],
            'centro_id' => $r['centro_id'] === null ? null : (int)$r['centro_id'],
            'centro_nombre' => $r['centro_nombre'],
            'modulo' => $r['modulo'],
            'accion' => $r['accion'],
            'entidad' => $r['entidad'],
            'entidad_id' => $r['entidad_id'],
            'valor_anterior' => $r['valor_anterior'] === null ? null : json_decode($r['valor_anterior'], true),
            'valor_nuevo' => $r['valor_nuevo'] === null ? null : json_decode($r['valor_nuevo'], true),
            'ip' => $r['ip'],
        ], $rows),
        'total' => $total,
        'pagina' => $pagina,
        'paginas' => max(1, (int)ceil($total / $porPagina)),
        'modulos' => array_column(q_all("SELECT DISTINCT modulo FROM auditoria{$filtroUsuario} ORDER BY modulo"), 'modulo'),
        'acciones' => array_column(q_all("SELECT DISTINCT accion FROM auditoria{$filtroUsuario} ORDER BY accion"), 'accion'),
        'usuarios' => $u['es_staff'] ? array_map(fn($r) => ['id' => (int)$r['id'], 'nombre' => $r['nombre']],
            q_all('SELECT id, CONCAT(apellido, ", ", nombre) AS nombre FROM usuario ORDER BY apellido, nombre')) : [],
    ];
});
