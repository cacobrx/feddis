-- Studio Beauty tiene su propia base (eddis_set): los códigos de centro y de usuario
-- se repiten entre bases, así que se identifican junto con su marca u origen.

ALTER TABLE centro
  ADD UNIQUE KEY uq_centro_marca_codigo (marca, codigo_eddis);

ALTER TABLE usuario
  ADD COLUMN origen_usuario ENUM('EDDIS','SB') NULL AFTER eddis_user_id;

UPDATE usuario SET origen_usuario = 'EDDIS' WHERE eddis_user_id IS NOT NULL;

INSERT INTO configuracion (clave, valor, secreto) VALUES ('pais_sistema_sb', 'set', 0)
  ON DUPLICATE KEY UPDATE valor = valor;
