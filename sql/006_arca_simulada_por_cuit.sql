-- Autorización ARCA simulada o real, elegida en cada CUIT.
-- Cada comprobante guarda si su CAE fue simulado, para no confundirlo nunca con uno real.

ALTER TABLE cuit
  ADD COLUMN arca_simulado TINYINT(1) NOT NULL DEFAULT 1 AFTER modo_prueba;

ALTER TABLE comprobante
  ADD COLUMN simulado TINYINT(1) NOT NULL DEFAULT 0 AFTER modo_prueba;

-- Hasta ahora toda autorización sin URL de ARCA fue simulada.
UPDATE comprobante SET simulado = 1 WHERE estado = 'AUTORIZADO';

-- La numeración simulada no debe chocar con la real.
ALTER TABLE comprobante
  DROP INDEX uq_comp_numero,
  ADD UNIQUE KEY uq_comp_numero (cuit_id, punto_venta, tipo, numero, modo_prueba, simulado);
