<?php
declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public function __construct(public int $status, string $message, public array $extra = [])
    {
        parent::__construct($message);
    }
}

final class ExternalApiError extends RuntimeException {}

function cfg(string $key, mixed $default = null): mixed
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/../config.php';
        if (!is_file($file)) {
            throw new HttpError(500, 'Falta api/config.php. Copiar config.example.php y completar los datos.');
        }
        $config = require $file;
        date_default_timezone_set($config['timezone'] ?? 'America/Argentina/Buenos_Aires');
    }
    return $config[$key] ?? $default;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = cfg('db');
        try {
            $pdo = new PDO(
                sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'] ?? 3306, $c['name']),
                $c['user'],
                $c['pass'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (PDOException $e) {
            // 1045 = usuario o clave, 1044 = sin permiso sobre la base, 1049 = base inexistente, 2002 = host.
            error_log('[eddisfac] conexión a la base: ' . $e->getMessage());
            throw new HttpError(503, 'No se pudo conectar con la base de datos del sistema (MySQL ' . ($e->errorInfo[1] ?? $e->getCode()) . ').');
        }
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function q_all(string $sql, array $params = []): array { return q($sql, $params)->fetchAll(); }
function q_one(string $sql, array $params = []): ?array { $r = q($sql, $params)->fetch(); return $r === false ? null : $r; }
function q_val(string $sql, array $params = []): mixed { $r = q($sql, $params)->fetchColumn(); return $r === false ? null : $r; }

/** Construye "IN (?,?,?)" para una lista no vacía. */
function in_list(array $values): string
{
    return '(' . implode(',', array_fill(0, max(1, count($values)), '?')) . ')';
}

function json_out(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function body(): array
{
    static $data = null;
    if ($data === null) {
        $raw = file_get_contents('php://input') ?: '';
        $data = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($data)) {
            throw new HttpError(400, 'El cuerpo de la solicitud no es JSON válido.');
        }
    }
    return $data;
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

/* ---------- Validación ---------- */

function v_str(array $d, string $k, string $label, bool $required = true, int $max = 200): ?string
{
    $v = isset($d[$k]) ? trim((string)$d[$k]) : '';
    if ($v === '') {
        if ($required) throw new HttpError(422, "Completá el campo {$label}.", ['campo' => $k]);
        return null;
    }
    if (mb_strlen($v) > $max) throw new HttpError(422, "{$label} admite hasta {$max} caracteres.", ['campo' => $k]);
    return $v;
}

function v_int(array $d, string $k, string $label, bool $required = true, int $min = PHP_INT_MIN, int $max = PHP_INT_MAX): ?int
{
    if (!isset($d[$k]) || $d[$k] === '' || $d[$k] === null) {
        if ($required) throw new HttpError(422, "Completá el campo {$label}.", ['campo' => $k]);
        return null;
    }
    if (filter_var($d[$k], FILTER_VALIDATE_INT) === false) throw new HttpError(422, "{$label} debe ser un número entero.", ['campo' => $k]);
    $v = (int)$d[$k];
    if ($v < $min || $v > $max) throw new HttpError(422, "{$label} está fuera de rango.", ['campo' => $k]);
    return $v;
}

function v_money(array $d, string $k, string $label, bool $required = true, float $min = 0): ?string
{
    if (!isset($d[$k]) || $d[$k] === '' || $d[$k] === null) {
        if ($required) throw new HttpError(422, "Completá el campo {$label}.", ['campo' => $k]);
        return null;
    }
    if (!is_numeric($d[$k])) throw new HttpError(422, "{$label} debe ser un importe.", ['campo' => $k]);
    $v = (float)$d[$k];
    if ($v < $min) throw new HttpError(422, "{$label} no puede ser menor a {$min}.", ['campo' => $k]);
    return number_format($v, 2, '.', '');
}

function v_date(array $d, string $k, string $label, bool $required = true): ?string
{
    $v = isset($d[$k]) ? trim((string)$d[$k]) : '';
    if ($v === '') {
        if ($required) throw new HttpError(422, "Completá el campo {$label}.", ['campo' => $k]);
        return null;
    }
    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
    if (!$dt || $dt->format('Y-m-d') !== $v) throw new HttpError(422, "{$label} no es una fecha válida (AAAA-MM-DD).", ['campo' => $k]);
    return $v;
}

function v_bool(array $d, string $k): int
{
    return !empty($d[$k]) && $d[$k] !== '0' && $d[$k] !== 'false' ? 1 : 0;
}

function v_enum(array $d, string $k, string $label, array $allowed, bool $required = true): ?string
{
    $v = isset($d[$k]) ? (string)$d[$k] : '';
    if ($v === '') {
        if ($required) throw new HttpError(422, "Elegí un valor para {$label}.", ['campo' => $k]);
        return null;
    }
    if (!in_array($v, $allowed, true)) throw new HttpError(422, "{$label} tiene un valor no permitido.", ['campo' => $k]);
    return $v;
}

function cuit_valido(string $cuit): bool
{
    if (!preg_match('/^\d{11}$/', $cuit)) return false;
    $pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    $suma = 0;
    for ($i = 0; $i < 10; $i++) $suma += (int)$cuit[$i] * $pesos[$i];
    $dv = 11 - ($suma % 11);
    if ($dv === 11) $dv = 0;
    if ($dv === 10) $dv = 9;
    return $dv === (int)$cuit[10];
}

function v_cuit(array $d, string $k, string $label = 'CUIT'): string
{
    $v = preg_replace('/\D/', '', (string)($d[$k] ?? ''));
    if ($v === '') throw new HttpError(422, "Completá el campo {$label}.", ['campo' => $k]);
    if (!cuit_valido($v)) throw new HttpError(422, "{$label} no es válido: revisá los 11 dígitos y el verificador.", ['campo' => $k]);
    return $v;
}

function v_documento(array $d, string $k, string $label = 'Documento'): string
{
    $v = preg_replace('/\D/', '', (string)($d[$k] ?? ''));
    if ($v === '' || strlen($v) < 6 || strlen($v) > 11) {
        throw new HttpError(422, "{$label} debe tener entre 6 y 11 dígitos.", ['campo' => $k]);
    }
    return $v;
}

/* ---------- Cifrado de secretos (AES-256-GCM) ---------- */

function app_key(): string
{
    $key = base64_decode((string)cfg('app_key'), true);
    if ($key === false || strlen($key) !== 32) {
        throw new HttpError(500, 'app_key en config.php debe ser una clave base64 de 32 bytes.');
    }
    return $key;
}

function encrypt_secret(string $plain): string
{
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', app_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return 'v1:' . base64_encode($iv . $tag . $ct);
}

function decrypt_secret(?string $stored): ?string
{
    if ($stored === null || $stored === '') return null;
    if (!str_starts_with($stored, 'v1:')) return null;
    $raw = base64_decode(substr($stored, 3), true);
    if ($raw === false || strlen($raw) < 28) return null;
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', app_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $plain === false ? null : $plain;
}
