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
    // Los usuarios y centros de Eddis y Studio Beauty se consultan por la API de Eddis (api_fac_feddis.php):
    // su URL y su token se cargan en Utilidades → Configuración.
    // Clave de 32 bytes en base64 para cifrar tokens de APIs.
    // Generar con: php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
    'app_key'  => 'CAMBIAR',
    'timezone' => 'America/Argentina/Buenos_Aires',
    // Duración de la sesión inactiva, en minutos.
    'session_minutos' => 120,
    // true solo en desarrollo: devuelve el detalle de errores internos.
    'debug' => false,
];
