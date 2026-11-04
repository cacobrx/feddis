<?php
declare(strict_types=1);

function session_start_secure(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_name('EDDISFACSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();

    $limite = (int)cfg('session_minutos', 120) * 60;
    if (isset($_SESSION['ultimo_uso']) && time() - $_SESSION['ultimo_uso'] > $limite) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['ultimo_uso'] = time();
}

/** Usuario logueado, recargado de la base en cada solicitud para respetar bajas. */
function current_user(): ?array
{
    static $user = false;
    if ($user !== false) return $user;
    $user = null;
    $uid = $_SESSION['uid'] ?? null;
    if ($uid) {
        $u = q_one('SELECT id, documento, nombre, apellido, es_staff, activo, tema, centro_preferido_id FROM usuario WHERE id = ?', [$uid]);
        if ($u && (int)$u['activo'] === 1) {
            $u['id'] = (int)$u['id'];
            $u['es_staff'] = (bool)$u['es_staff'];
            $u['sistema'] = $_SESSION['sistema'] ?? 'EDDIS';
            $user = $u;
        }
    }
    return $user;
}

function require_user(): array
{
    $u = current_user();
    if (!$u) throw new HttpError(401, 'Tu sesión terminó. Ingresá de nuevo.');
    return $u;
}

function require_staff(): array
{
    $u = require_user();
    if (!$u['es_staff']) throw new HttpError(403, 'Esta sección es solo para usuarios staff.');
    return $u;
}

/** IDs de centros activos a los que accede el usuario (staff: todos). */
function user_centro_ids(array $u): array
{
    static $cache = [];
    if (isset($cache[$u['id']])) return $cache[$u['id']];
    $ids = $u['es_staff']
        ? q_all('SELECT id FROM centro WHERE activo = 1 ORDER BY id')
        : q_all('SELECT c.id FROM usuario_centro uc JOIN centro c ON c.id = uc.centro_id WHERE uc.usuario_id = ? AND c.activo = 1 ORDER BY c.id', [$u['id']]);
    return $cache[$u['id']] = array_map(fn($r) => (int)$r['id'], $ids);
}

function require_centro(array $u, mixed $centroId): int
{
    $id = filter_var($centroId, FILTER_VALIDATE_INT);
    if ($id === false || !in_array($id, user_centro_ids($u), true)) {
        throw new HttpError(403, 'No tenés acceso a ese centro.');
    }
    return $id;
}

function require_csrf(): void
{
    $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($m === 'GET' || $m === 'HEAD') return;
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'eddisfac') {
        throw new HttpError(403, 'Solicitud rechazada: falta el encabezado de la aplicación.');
    }
}

/* ---------- Auditoría ---------- */

const AUDIT_CLAVES_SECRETAS = '/(token|clave|password|pass|secret|certificado_key)/i';

function audit_sanitize(mixed $v): mixed
{
    if (!is_array($v)) return $v;
    $out = [];
    foreach ($v as $k => $val) {
        if (is_string($k) && preg_match(AUDIT_CLAVES_SECRETAS, $k)) {
            $out[$k] = $val === null || $val === '' ? $val : '[oculto]';
        } else {
            $out[$k] = audit_sanitize($val);
        }
    }
    return $out;
}

/**
 * Registra una acción. Nunca lanza: si la auditoría falla, se informa en el log del servidor,
 * pero las acciones críticas se auditan dentro de su propia transacción.
 */
function audit(string $modulo, string $accion, array $opts = []): void
{
    $u = $opts['usuario'] ?? current_user();
    $antes = array_key_exists('antes', $opts) ? audit_sanitize($opts['antes']) : null;
    $despues = array_key_exists('despues', $opts) ? audit_sanitize($opts['despues']) : null;
    $sql = 'INSERT INTO auditoria (usuario_id, usuario_documento, usuario_nombre, centro_id, modulo, accion, entidad, entidad_id, valor_anterior, valor_nuevo, ip, user_agent)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
    $params = [
        $u['id'] ?? null,
        $u['documento'] ?? ($opts['documento'] ?? null),
        $u ? trim(($u['nombre'] ?? '') . ' ' . ($u['apellido'] ?? '')) : null,
        $opts['centro_id'] ?? null,
        $modulo,
        $accion,
        $opts['entidad'] ?? null,
        isset($opts['entidad_id']) ? (string)$opts['entidad_id'] : null,
        $antes === null ? null : json_encode($antes, JSON_UNESCAPED_UNICODE),
        $despues === null ? null : json_encode($despues, JSON_UNESCAPED_UNICODE),
        client_ip(),
        substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
    ];
    try {
        q($sql, $params);
    } catch (Throwable $e) {
        error_log('[eddisfac] No se pudo registrar auditoría: ' . $e->getMessage());
        if (!empty($opts['critico'])) throw $e;
    }
}

/** Devuelve solo las claves que cambiaron, para registrar antes/después compactos. */
function diff_campos(array $antes, array $despues): array
{
    $a = [];
    $d = [];
    foreach ($despues as $k => $v) {
        $prev = $antes[$k] ?? null;
        if ((string)$prev !== (string)$v) {
            $a[$k] = $prev;
            $d[$k] = $v;
        }
    }
    return [$a, $d];
}
