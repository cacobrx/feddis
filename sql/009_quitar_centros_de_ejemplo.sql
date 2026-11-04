-- Quita los centros de ejemplo de 003_datos_iniciales.sql (códigos ED-01, ED-02, SB-01, SB-02)
-- y sus CUIT, solo si no tienen comprobantes ni datos de terceros.
-- Las asignaciones de usuarios a esos centros se borran en cascada.

DELETE cu FROM cuit cu
  JOIN centro c ON c.id = cu.centro_id
  WHERE c.codigo_eddis IN ('ED-01', 'ED-02', 'SB-01', 'SB-02')
    AND NOT EXISTS (SELECT 1 FROM comprobante co WHERE co.centro_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM tercero t WHERE t.centro_id = c.id);

DELETE c FROM centro c
  WHERE c.codigo_eddis IN ('ED-01', 'ED-02', 'SB-01', 'SB-02')
    AND NOT EXISTS (SELECT 1 FROM cuit cu WHERE cu.centro_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM comprobante co WHERE co.centro_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM tercero t WHERE t.centro_id = c.id);
