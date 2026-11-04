-- Número de Ingresos Brutos del emisor: obligatorio en la representación impresa del comprobante.
ALTER TABLE cuit
  ADD COLUMN ingresos_brutos VARCHAR(30) NULL AFTER condicion_iva;
