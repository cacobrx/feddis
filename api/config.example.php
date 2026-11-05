<?php
// Copiar como config.php y completar. config.php nunca se versiona.
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'feddis',
        'user' => 'feddis',
        'pass' => 'cambiar',
    ],
    // Base del sistema de gestión Eddis, para buscar usuarios a habilitar (solo lectura).
    // host, port, user y pass son opcionales: si faltan se usan los de 'db'.
    'db_eddis' => [
        'name' => 'eddis_ar',
    ],
    // Base de Studio Beauty (eddis_set): usuarios y centros de SB.
    'db_sb' => [
        'name' => 'eddis_set',
    ],
    // Clave de 32 bytes en base64 para cifrar tokens de APIs.
    // Generar con: php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
    'app_key'  => 'CAMBIAR',
    'timezone' => 'America/Argentina/Buenos_Aires',
    // Duración de la sesión inactiva, en minutos.
    'session_minutos' => 120,
    // true solo en desarrollo: devuelve el detalle de errores internos.
    'debug' => false,
];
