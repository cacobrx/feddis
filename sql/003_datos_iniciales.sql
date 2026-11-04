-- Datos iniciales de demostración. Reemplazar por los centros y CUIT reales.

INSERT INTO centro (id, nombre, marca, codigo_eddis) VALUES
  (1, 'Eddis Centro',            'EDDIS', 'ED-01'),
  (2, 'Eddis Norte',             'EDDIS', 'ED-02'),
  (3, 'Studio Beauty Palermo',   'SB',    'SB-01'),
  (4, 'Studio Beauty Belgrano',  'SB',    'SB-02');

INSERT INTO cuit (centro_id, cuit, razon_social, nombre_fantasia, domicilio, ciudad, condicion_iva, alicuota, punto_venta, inicio_actividades, venc_certificado, tope_facturacion, importar_cuota_99, modo_prueba) VALUES
  (1, '20123456786', 'Formación Eddis SRL',      'Eddis Centro',     'Av. Corrientes 1234',   'CABA',            'RI',          21.00, 3, '2015-03-01', DATE_ADD(CURDATE(), INTERVAL 200 DAY), 25000000, 0, 1),
  (2, '27234567891', 'María Laura Gómez',        'Eddis Norte',      'Av. Maipú 2200',        'Vicente López',   'MONOTRIBUTO',  0.00, 2, '2018-08-15', DATE_ADD(CURDATE(), INTERVAL 21 DAY),  6500000,  0, 1),
  (3, '30712345671', 'Beauty Academy SA',        'Studio Beauty',    'Godoy Cruz 1800',       'CABA',            'RI',          21.00, 5, '2019-02-01', DATE_ADD(CURDATE(), INTERVAL 75 DAY),  18000000, 1, 1),
  (4, '20345678906', 'Lucas Martín Ferreyra',    'SB Belgrano',      'Cabildo 2500',          'CABA',            'EXENTO',       0.00, 1, '2021-04-10', DATE_ADD(CURDATE(), INTERVAL 340 DAY), 4500000,  0, 1);

-- Usuarios de demostración (en modo simulación la clave es "demo").
INSERT INTO usuario (id, documento, nombre, apellido, es_staff) VALUES
  (1, '11111111', 'Gustavo',  'Administrador', 1),
  (2, '22222222', 'Carla',    'Ríos',          0),
  (3, '44444444', 'Valentina','Suárez',        0);

INSERT INTO usuario_centro (usuario_id, centro_id) VALUES
  (2, 1), (2, 2),
  (3, 3), (3, 4);

INSERT INTO configuracion (clave, valor, secreto) VALUES
  ('modo_simulacion',        '1',  0),
  ('url_validacion_eddis',   '',   0),
  ('url_validacion_sb',      '',   0),
  ('url_pagos_eddis',        '',   0),
  ('token_pagos_eddis',      NULL, 1),
  ('url_arca',               '',   0),
  ('token_arca',             NULL, 1),
  ('url_usuarios',           '',   0),
  ('token_usuarios',         NULL, 1),
  ('timeout_segundos',       '20', 0),
  ('dias_alerta_certificado','30', 0);
