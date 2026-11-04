-- Eddisfac / SBFac — esquema inicial
-- MySQL 8.0+, utf8mb4

CREATE TABLE centro (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  marca         ENUM('EDDIS','SB') NOT NULL,
  codigo_eddis  VARCHAR(40)  NULL COMMENT 'Identificador del centro en el sistema de gestión',
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_centro_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cuit (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  centro_id           INT UNSIGNED NOT NULL,
  cuit                CHAR(11) NOT NULL,
  razon_social        VARCHAR(160) NOT NULL,
  nombre_fantasia     VARCHAR(160) NULL,
  domicilio           VARCHAR(200) NULL,
  ciudad              VARCHAR(120) NULL,
  condicion_iva       ENUM('RI','MONOTRIBUTO','EXENTO') NOT NULL,
  alicuota            DECIMAL(5,2) NOT NULL DEFAULT 0,
  punto_venta         INT UNSIGNED NOT NULL,
  inicio_actividades  DATE NULL,
  venc_certificado    DATE NULL,
  tope_facturacion    DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Tope mensual',
  importar_cuota_99   TINYINT(1) NOT NULL DEFAULT 0,
  modo_prueba         TINYINT(1) NOT NULL DEFAULT 1,
  activo              TINYINT(1) NOT NULL DEFAULT 1,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  centro_activo       INT UNSIGNED GENERATED ALWAYS AS (IF(activo = 1, centro_id, NULL)) STORED,
  UNIQUE KEY uq_cuit_centro_activo (centro_activo),
  KEY ix_cuit_centro (centro_id),
  CONSTRAINT fk_cuit_centro FOREIGN KEY (centro_id) REFERENCES centro(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE usuario (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  documento           VARCHAR(15) NOT NULL,
  nombre              VARCHAR(80) NOT NULL,
  apellido            VARCHAR(80) NOT NULL,
  es_staff            TINYINT(1) NOT NULL DEFAULT 0,
  activo              TINYINT(1) NOT NULL DEFAULT 1,
  tema                ENUM('claro','oscuro','sistema') NOT NULL DEFAULT 'sistema',
  centro_preferido_id INT UNSIGNED NULL,
  ultimo_login        DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_documento (documento),
  CONSTRAINT fk_usuario_centro_pref FOREIGN KEY (centro_preferido_id) REFERENCES centro(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE usuario_centro (
  usuario_id INT UNSIGNED NOT NULL,
  centro_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (usuario_id, centro_id),
  CONSTRAINT fk_uc_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_centro  FOREIGN KEY (centro_id)  REFERENCES centro(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tercero (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  centro_id         INT UNSIGNED NOT NULL,
  documento_alumno  VARCHAR(15) NOT NULL,
  nombre_alumno     VARCHAR(160) NULL,
  razon_social      VARCHAR(160) NOT NULL,
  direccion         VARCHAR(200) NULL,
  ciudad            VARCHAR(120) NULL,
  cuit              CHAR(11) NOT NULL,
  condicion_iva     ENUM('RI','MONOTRIBUTO','EXENTO','CF') NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tercero_centro_doc (centro_id, documento_alumno),
  CONSTRAINT fk_tercero_centro FOREIGN KEY (centro_id) REFERENCES centro(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE comprobante (
  id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cuit_id                  INT UNSIGNED NOT NULL,
  centro_id                INT UNSIGNED NOT NULL,
  clase                    ENUM('FACTURA','NOTA_CREDITO') NOT NULL,
  tipo                     SMALLINT UNSIGNED NOT NULL COMMENT 'Código ARCA: 1 FA, 3 NCA, 6 FB, 8 NCB, 11 FC, 13 NCC',
  punto_venta              INT UNSIGNED NOT NULL,
  numero                   INT UNSIGNED NULL,
  fecha                    DATE NOT NULL,
  receptor_doc_tipo        SMALLINT UNSIGNED NOT NULL COMMENT '80 CUIT, 96 DNI, 99 sin identificar',
  receptor_doc_nro         VARCHAR(15) NOT NULL,
  receptor_nombre          VARCHAR(160) NOT NULL,
  receptor_domicilio       VARCHAR(200) NULL,
  receptor_ciudad          VARCHAR(120) NULL,
  receptor_condicion_iva   ENUM('RI','MONOTRIBUTO','EXENTO','CF') NOT NULL,
  alumno_documento         VARCHAR(15) NULL,
  alumno_nombre            VARCHAR(160) NULL,
  es_tercero               TINYINT(1) NOT NULL DEFAULT 0,
  alicuota                 DECIMAL(5,2) NOT NULL DEFAULT 0,
  importe_neto             DECIMAL(14,2) NOT NULL,
  importe_iva              DECIMAL(14,2) NOT NULL DEFAULT 0,
  importe_total            DECIMAL(14,2) NOT NULL,
  estado                   ENUM('PENDIENTE','AUTORIZADO','ERROR') NOT NULL DEFAULT 'PENDIENTE',
  cae                      VARCHAR(20) NULL,
  venc_cae                 DATE NULL,
  error_arca               TEXT NULL,
  intentos                 SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  modo_prueba              TINYINT(1) NOT NULL DEFAULT 0,
  comprobante_asociado_id  INT UNSIGNED NULL COMMENT 'Factura que anula una nota de crédito',
  anulado                  TINYINT(1) NOT NULL DEFAULT 0,
  creado_por               INT UNSIGNED NOT NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  autorizado_at            DATETIME NULL,
  KEY ix_comp_centro_fecha (centro_id, fecha),
  KEY ix_comp_estado (estado),
  UNIQUE KEY uq_comp_numero (cuit_id, punto_venta, tipo, numero, modo_prueba),
  CONSTRAINT fk_comp_cuit     FOREIGN KEY (cuit_id) REFERENCES cuit(id),
  CONSTRAINT fk_comp_centro   FOREIGN KEY (centro_id) REFERENCES centro(id),
  CONSTRAINT fk_comp_asociado FOREIGN KEY (comprobante_asociado_id) REFERENCES comprobante(id),
  CONSTRAINT fk_comp_usuario  FOREIGN KEY (creado_por) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un pago queda "tomado" mientras su vínculo esté activo. Si la factura se anula con
-- nota de crédito el vínculo se desactiva y el pago vuelve a estar disponible.
CREATE TABLE comprobante_pago (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comprobante_id  INT UNSIGNED NOT NULL,
  pago_id_eddis   VARCHAR(64) NOT NULL,
  nro_cuota       SMALLINT UNSIGNED NULL,
  fecha_pago      DATE NULL,
  concepto        VARCHAR(200) NULL,
  origen          ENUM('CENTRAL','PROPIO') NULL,
  importe         DECIMAL(14,2) NOT NULL,
  activo          TINYINT(1) NOT NULL DEFAULT 1,
  pago_activo     VARCHAR(64) GENERATED ALWAYS AS (IF(activo = 1, pago_id_eddis, NULL)) STORED,
  UNIQUE KEY uq_pago_activo (pago_activo),
  KEY ix_cp_pago (pago_id_eddis),
  CONSTRAINT fk_cp_comprobante FOREIGN KEY (comprobante_id) REFERENCES comprobante(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auditoria (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fecha_hora         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  usuario_id         INT UNSIGNED NULL,
  usuario_documento  VARCHAR(15) NULL,
  usuario_nombre     VARCHAR(170) NULL,
  centro_id          INT UNSIGNED NULL,
  modulo             VARCHAR(40) NOT NULL,
  accion             VARCHAR(60) NOT NULL,
  entidad            VARCHAR(40) NULL,
  entidad_id         VARCHAR(64) NULL,
  valor_anterior     JSON NULL,
  valor_nuevo        JSON NULL,
  ip                 VARCHAR(45) NULL,
  user_agent         VARCHAR(255) NULL,
  KEY ix_aud_fecha (fecha_hora),
  KEY ix_aud_usuario (usuario_id, fecha_hora),
  KEY ix_aud_centro (centro_id, fecha_hora),
  KEY ix_aud_modulo (modulo, accion),
  KEY ix_aud_ip_accion (ip, accion, fecha_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE configuracion (
  clave            VARCHAR(60) PRIMARY KEY,
  valor            TEXT NULL,
  secreto          TINYINT(1) NOT NULL DEFAULT 0,
  actualizado_por  INT UNSIGNED NULL,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
