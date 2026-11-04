-- La auditoría solo admite inserciones.
-- Además de estos triggers, se recomienda que el usuario MySQL de la aplicación
-- no tenga UPDATE ni DELETE sobre la tabla (ver README).

CREATE TRIGGER auditoria_no_update BEFORE UPDATE ON auditoria FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría es de solo lectura';

CREATE TRIGGER auditoria_no_delete BEFORE DELETE ON auditoria FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría es de solo lectura';
