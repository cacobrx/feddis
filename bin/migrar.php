<?php
declare(strict_types=1);

/*
 * Aplica en orden las migraciones de sql/ que todavía no se ejecutaron.
 * Uso: php bin/migrar.php            (aplica pendientes)
 *      php bin/migrar.php --estado   (lista aplicadas y pendientes)
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../api/lib/core.php';

$pdo = db();
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migraciones (
    version VARCHAR(100) PRIMARY KEY,
    aplicada_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

$aplicadas = array_column($pdo->query('SELECT version FROM schema_migraciones')->fetchAll(), 'version');
$archivos = glob(__DIR__ . '/../sql/*.sql');
sort($archivos);

if (in_array('--estado', $argv, true)) {
    foreach ($archivos as $f) {
        $v = basename($f);
        echo (in_array($v, $aplicadas, true) ? '[aplicada]  ' : '[pendiente] ') . $v . PHP_EOL;
    }
    exit(0);
}

$n = 0;
foreach ($archivos as $f) {
    $version = basename($f);
    if (in_array($version, $aplicadas, true)) continue;

    $sql = file_get_contents($f);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $sentencias = array_filter(array_map('trim', preg_split('/;\s*$/m', $sql)));

    echo "Aplicando {$version}... ";
    try {
        foreach ($sentencias as $s) $pdo->exec($s);
        $pdo->prepare('INSERT INTO schema_migraciones (version) VALUES (?)')->execute([$version]);
        echo "ok" . PHP_EOL;
        $n++;
    } catch (PDOException $e) {
        echo "ERROR" . PHP_EOL . $e->getMessage() . PHP_EOL;
        echo "Las sentencias DDL de MySQL no son transaccionales: revisá el estado de la base antes de reintentar." . PHP_EOL;
        exit(1);
    }
}
echo $n ? "{$n} migración(es) aplicada(s)." . PHP_EOL : 'La base ya estaba al día.' . PHP_EOL;
