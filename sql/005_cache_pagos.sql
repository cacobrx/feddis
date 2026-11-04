-- Última respuesta de la API de pagos por centro y rango, para no repetir consultas lentas
-- entre "Buscar pagos" y "Generar comprobantes".
CREATE TABLE cache_pagos (
  clave       CHAR(40) PRIMARY KEY,
  datos       LONGTEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
