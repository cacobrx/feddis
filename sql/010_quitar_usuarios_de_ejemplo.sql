-- Quita los usuarios de ejemplo de 003_datos_iniciales.sql, solo si no crearon comprobantes
-- y no están vinculados a Eddis ni a Studio Beauty (es decir, si siguen siendo los de ejemplo).

DELETE u FROM usuario u
  WHERE u.documento IN ('11111111', '22222222', '44444444')
    AND u.eddis_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM comprobante c WHERE c.creado_por = u.id);
