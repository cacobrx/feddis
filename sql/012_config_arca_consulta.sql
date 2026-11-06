-- API separada para consultar comprobantes en ARCA (la de url_arca queda para autorizar).
INSERT INTO configuracion (clave, valor, secreto) VALUES
  ('url_arca_consulta',   '',   0),
  ('token_arca_consulta', NULL, 1)
  ON DUPLICATE KEY UPDATE clave = clave;
