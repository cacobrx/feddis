# Eddisfac / SBFac

Sistema web que convierte los pagos de alumnos del sistema de gestión Eddis en comprobantes
fiscales autorizados por ARCA, para los centros de Eddis y Studio Beauty.

- **Frontend:** React 18 + Vite (`frontend/`), compilado en `app/`.
- **Backend:** API REST en PHP 8.3 + PDO (`api/`), sin dependencias externas.
- **Base de datos:** MySQL 8, migraciones versionadas en `sql/`.

## Instalación

1. Crear la base y el usuario MySQL:

   ```sql
   CREATE DATABASE eddisfac CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'eddisfac'@'localhost' IDENTIFIED BY '<clave>';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER ON eddisfac.* TO 'eddisfac'@'localhost';
   ```

   Los triggers de `002_auditoria_inmutable.sql` impiden modificar o borrar la auditoría.
   Si el servidor tiene binlog activo y el usuario no es SUPER, habilitar
   `log_bin_trust_function_creators=1` o aplicar esa migración con un usuario administrador.
   Para reforzarlo, en producción otorgar los permisos por tabla y dejar `auditoria` solo con SELECT e INSERT.

2. Configurar: `cp api/config.example.php api/config.php` y completar la base y `app_key`
   (`php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"`).

3. Migrar: `php bin/migrar.php` (`--estado` muestra aplicadas y pendientes).

4. Compilar el frontend: `cd frontend && npm install && npm run build`.

5. Abrir `http://<servidor>/eddisfac2/`.

En producción conviene que Apache publique solo `app/` y `api/` (o negar `sql/`, `bin/` y `frontend/`).

## Desarrollo

`cd frontend && npm run dev` levanta Vite con proxy de `/eddisfac2/api` hacia Apache local.

## Ingreso

1. **Usuario maestro** (`api/config.php`, se define con `php bin/clave_maestra.php <documento>`): staff, validado localmente.
   **Clave maestra:** esa misma clave, con el documento de cualquier usuario habilitado, ingresa como ese usuario
   (sin validar en Eddis ni Studio Beauty). Queda en la auditoría como `login_clave_maestra`.
2. **Eddis:** si el documento existe en `eddis_ar.edd_users`, se compara `md5(clave)` con `claveint`.
   Si el documento tiene varias filas, alcanza con que coincida una.
3. **Studio Beauty:** si el documento no existe en Eddis, se valida con la API de Studio Beauty
   (si tampoco está en `eddis_set`, se usa la API de validación de Studio Beauty o su simulación).

Los centros y usuarios de ejemplo de `003_datos_iniciales.sql` se quitan en las migraciones 009 y 010;
en una instalación nueva se ingresa con el usuario maestro y se dan de alta los usuarios reales.

En todos los casos el documento tiene que estar habilitado en Utilidades → Usuarios.

## Modo simulación

Se activa en Utilidades → Configuración y **solo reemplaza a los servicios que no tienen URL cargada**.
Los pagos usan la API real de Eddis (`api_pagos.php`); ARCA y la validación de Studio Beauty siguen simulados
hasta cargar sus URL. La validación de Eddis siempre es real, contra `eddis_ar`.

La API de pagos tarda ~15-30 s por centro y mes: se espera hasta 120 s y la respuesta se reutiliza
30 minutos al generar comprobantes (tabla `cache_pagos`). Cada centro necesita su `edd_centro.id` como código en Eddis.

## Contratos esperados de las APIs externas

Definidos en `api/lib/integraciones.php`. Si los servicios reales responden distinto, se ajusta solo ese archivo.

| Servicio | Llamada | Respuesta |
| --- | --- | --- |
| Validación (Eddis / SB) | `POST {url}` `{documento, clave}` | `{existe, valido, nombre, apellido, autorizado_facturar}` (404 = no existe) |
| Pagos Eddis (`api_pagos.php`) | `GET {url}?centro={edd_centro.id}&fechadesde=&fechahasta=&cuota99=&importe99=0&paissistema=ar` | `{respuesta: 200, data: [{id, alumno, documento, curso, cuota, fechapago, importe, fpago, ...}]}` |
| Usuarios | `GET {url}` | `{usuarios: [{documento, nombre, apellido}]}` |
| ARCA autorizar | `POST {url}/autorizar` | `{resultado: "A"\|"R", numero, cae, cae_vencimiento, errores: []}` |
| ARCA consultar | `GET {url}/consultar?cuit&punto_venta&tipo&numero&homologacion` | `{encontrado, comprobante: {...}}` |
| ARCA último | `GET {url}/ultimo?cuit&punto_venta&tipo&homologacion` | `{numero}` |

Los tokens se envían como `Authorization: Bearer` y se guardan cifrados (AES-256-GCM).

## Reglas de negocio implementadas

- Tope de facturación **mensual** por CUIT, controlado en el backend dentro de una transacción con bloqueo del CUIT.
- Un pago no puede estar en dos comprobantes vigentes (índice único sobre los vínculos activos).
- Tipo de comprobante: Monotributo/Exento → C; Responsable Inscripto → A si el receptor es RI, si no B.
  La alícuota del CUIT se aplica a toda la factura (IVA incluido en el importe del pago).
- Datos de terceros: si el alumno figura, el receptor es la empresa (CUIT). Los datos se congelan en el comprobante.
- Cuota 99 (derecho de examen): solo se lista si el CUIT tiene “Importar cuota 99”.
- Notas de crédito en lote desde facturas autorizadas; al autorizarse, la factura queda anulada y sus pagos se liberan.
- Comprobantes pendientes o rechazados se pueden eliminar (liberan sus pagos); los autorizados no.
- Auditoría de cada acción (incluidas consultas a APIs externas y logins fallidos); el usuario no staff ve solo la suya.
- Impresión de comprobantes autorizados (A4): letra y código, datos del emisor con Ingresos Brutos e inicio
  de actividades, receptor, período y vencimiento, detalle (IVA discriminado en A), Ley 27.743 en B, CAE con
  vencimiento y código QR de ARCA (RG 4291). Los simulados o de homologación salen marcados "SIN VALIDEZ FISCAL" y sin QR.
