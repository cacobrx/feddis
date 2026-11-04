<?php
declare(strict_types=1);

/*
 * Define o cambia el usuario maestro (staff) en api/config.php.
 * Uso: php bin/clave_maestra.php <documento>            (genera una clave aleatoria)
 *      php bin/clave_maestra.php <documento> <clave>    (usa la clave indicada)
 * En config.php se guarda solo el hash de la clave.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$documento = preg_replace('/\D/', '', $argv[1] ?? '');
if ($documento === '') {
    fwrite(STDERR, "Uso: php bin/clave_maestra.php <documento> [clave]\n");
    exit(1);
}
$clave = $argv[2] ?? rtrim(strtr(base64_encode(random_bytes(12)), '+/', 'Kx'), '=');
if (strlen($clave) < 10) {
    fwrite(STDERR, "La clave debe tener al menos 10 caracteres.\n");
    exit(1);
}

$file = __DIR__ . '/../api/config.php';
$src = file_get_contents($file);
if ($src === false) {
    fwrite(STDERR, "No se pudo leer api/config.php\n");
    exit(1);
}

$bloque = "    'usuario_maestro' => [\n"
    . "        'documento' => " . var_export($documento, true) . ",\n"
    . "        'clave_hash' => " . var_export(password_hash($clave, PASSWORD_DEFAULT), true) . ",\n"
    . "        'nombre' => 'Usuario',\n"
    . "        'apellido' => 'Maestro',\n"
    . "    ],\n";

if (preg_match("/^    'usuario_maestro' => \[.*?^    \],\n/ms", $src)) {
    $src = preg_replace("/^    'usuario_maestro' => \[.*?^    \],\n/ms", addcslashes($bloque, '\\$'), $src, 1);
} else {
    $pos = strrpos($src, '];');
    $src = substr($src, 0, $pos) . $bloque . substr($src, $pos);
}
file_put_contents($file, $src);

echo "Usuario maestro configurado.\n  Documento: {$documento}\n  Clave:     {$clave}\n";
