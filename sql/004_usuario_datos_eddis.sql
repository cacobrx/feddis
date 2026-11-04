-- Datos copiados de eddis_ar.edd_users al habilitar un usuario.
-- claveint es el hash MD5 de la clave interna de Eddis; nunca se envía al navegador ni a la auditoría.

ALTER TABLE usuario
  ADD COLUMN email         VARCHAR(50) NULL AFTER apellido,
  ADD COLUMN claveint      VARCHAR(32) NULL AFTER email,
  ADD COLUMN eddis_user_id INT UNSIGNED NULL AFTER claveint;
