<?php
declare(strict_types=1);

/*
 * Front controller de la API. Las rutas se resuelven por PATH_INFO
 * (index.php/pagos, index.php/comprobantes/12, ...), así no depende de mod_rewrite.
 */

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/integraciones.php';
require __DIR__ . '/lib/fiscal.php';

header('X-Content-Type-Options: nosniff');
try { cfg('timezone'); } catch (HttpError $e) { json_out(['error' => $e->getMessage()], 500); }
header('Cache-Control: no-store');

$GLOBALS['routes'] = [];

function route(string $method, string $pattern, callable $handler): void
{
    $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
    $GLOBALS['routes'][] = [$method, $regex, $handler];
}

foreach (glob(__DIR__ . '/routes/*.php') as $file) {
    require $file;
}

try {
    session_start_secure();
    require_csrf();

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = '/' . trim((string)($_SERVER['PATH_INFO'] ?? ($_GET['r'] ?? '')), '/');
    $pathMatched = false;

    foreach ($GLOBALS['routes'] as [$m, $regex, $handler]) {
        if (!preg_match($regex, $path, $mm)) continue;
        $pathMatched = true;
        if ($m !== $method) continue;
        $params = array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY);
        $result = $handler($params);
        json_out($result ?? ['ok' => true]);
    }
    throw new HttpError($pathMatched ? 405 : 404, $pathMatched ? 'Método no permitido.' : 'Recurso inexistente.');
} catch (HttpError $e) {
    json_out(['error' => $e->getMessage()] + $e->extra, $e->status);
} catch (ExternalApiError $e) {
    json_out(['error' => $e->getMessage(), 'externo' => true], 502);
} catch (PDOException $e) {
    error_log('[eddisfac] ' . $e->getMessage());
    try { if (db()->inTransaction()) db()->rollBack(); } catch (Throwable) {}
    json_out(['error' => cfg('debug') ? $e->getMessage() : 'Error de base de datos. El detalle quedó en el log del servidor.'], 500);
} catch (Throwable $e) {
    error_log('[eddisfac] ' . $e);
    json_out(['error' => cfg('debug', false) ? $e->getMessage() : 'Error interno. El detalle quedó en el log del servidor.'], 500);
}
