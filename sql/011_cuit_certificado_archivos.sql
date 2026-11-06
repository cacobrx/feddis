-- Certificado digital de ARCA de cada CUIT: el .crt en PEM y la clave privada (.key) cifrada con app_key.
ALTER TABLE cuit
  ADD COLUMN certificado_crt       TEXT NULL AFTER venc_certificado,
  ADD COLUMN certificado_key       TEXT NULL AFTER certificado_crt,
  ADD COLUMN certificado_titular   VARCHAR(200) NULL AFTER certificado_key,
  ADD COLUMN certificado_desde     DATE NULL AFTER certificado_titular,
  ADD COLUMN certificado_subido_at DATETIME NULL AFTER certificado_desde;
