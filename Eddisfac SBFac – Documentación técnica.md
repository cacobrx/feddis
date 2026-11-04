# Eddisfac / SBFac – Documentación técnica

Nov 3, 2026 · @Gustavo

## 1. Resumen y alcance

Eddisfac/SBFac es un sistema web que convierte los pagos de alumnos registrados en el sistema de gestión Eddis en comprobantes fiscales autorizados por ARCA, para los centros de Eddis y Studio Beauty (SB).

**Objetivos**

- Listar pagos por centro y rango de fechas, y seleccionarlos para generar comprobantes sin superar el tope de facturación autorizado del CUIT.
- Autorizar los comprobantes en ARCA y consultar los ya emitidos.
- Administrar los datos fiscales de cada CUIT, los usuarios habilitados y los datos de terceros (facturación a empresas).
- Registrar una auditoría completa de todas las acciones.

**Actores**

| Actor | Descripción |
| --- | --- |
| Usuario no staff | Usuario de un centro autorizado a facturar. Opera sobre los centros que tiene asignados. |
| Usuario staff | Administra CUIT, usuarios y utilidades; accede a todos los módulos. |

**Fuera de alcance de este documento:** el sistema de gestión Eddis, la API de validación de usuarios y los servicios de ARCA. Solo se documenta cómo se integran con ellos.

## 2. Requisitos generales y no funcionales

Tres requisitos transversales condicionan todo el diseño: base MySQL, auditoría de cada tarea y tema claro/oscuro.

| ID | Requisito | Criterio de aceptación |
| --- | --- | --- |
| RNF-01 | Base de datos MySQL | Todo el modelo persistente reside en MySQL; migraciones versionadas. |
| RNF-02 | Registro de auditoría | Cada tarea (login, alta, edición, baja, selección de pagos, autorización en ARCA, cambios de configuración) genera un registro inmutable. |
| RNF-03 | Interfaz clara y oscura | El usuario alterna el tema desde la barra superior; la preferencia se recuerda entre sesiones. |
| RNF-04 | Multi-centro | Toda consulta y escritura se filtra por los centros que el usuario tiene asignados. |
| RNF-05 | Modo prueba por CUIT | Con "Modo Prueba" activo, la autorización usa el entorno de homologación de ARCA y no impacta producción. |
| RNF-06 | Secretos protegidos | Claves de API y certificados digitales se almacenan cifrados y nunca se exponen al frontend ni a los logs. |

Los puntos RNF-04 a RNF-06 son criterios técnicos derivados del documento funcional; conviene validarlos con el equipo de producto.

## 3. Arquitectura e integraciones

El sistema se compone de una aplicación web, un backend propio y una base MySQL, y consume APIs externas. El documento funcional no fija tecnologías; las capas se describen de forma neutra.

&#91;embedded content: arquitectura · 3 capas, 3 APIs externas\]

El navegador solo habla con el backend; este concentra la lógica, la persistencia y las llamadas a las APIs externas.

| Integración | Uso | Módulos que la usan |
| --- | --- | --- |
| API de validación de usuarios | Login con documento y clave Eddis (o Studio Beauty) y confirmación de que el usuario puede facturar | Login |
| API del sistema de gestión Eddis | Obtener los pagos de los alumnos | Pagos |
| API de ARCA | Autorizar comprobantes y consultarlos | Comprobantes Fiscales, Consulta ARCA |
| API de usuarios (combo de alta) | Traer nombre, apellido y documento de las personas a habilitar | Usuarios |

Las credenciales de estas APIs se administran en el módulo Configuración, y toda llamada saliente queda registrada en auditoría.

## 4. Autenticación y autorización

El acceso se valida contra una API externa con documento y clave Eddis, con respaldo en los datos de Studio Beauty; el sistema no guarda claves de usuario.

1. El usuario ingresa documento y clave.
2. El backend consulta la API de validación con las credenciales Eddis.
3. Si el documento no existe en Eddis, repite la validación con los datos de Studio Beauty.
4. La API devuelve la identidad y si el usuario está autorizado a facturar. Si no lo está, se rechaza el acceso.
5. Con el documento validado, el backend carga los centros Eddis y SB asignados al usuario en la tabla `usuario_centro` y emite la sesión.
6. Se registra el evento de login (éxito o fallo) en auditoría.

**Reglas**

- Un mismo documento da acceso directo a los centros de Eddis y de SB que tenga asignados, sin segundo login.
- La condición de "autorizado a facturar" se verifica en cada login; si la API deja de confirmarla, el acceso se deniega.
- Roles: `staff` y `no staff`. El rol determina qué módulos y campos se muestran (ver matriz de permisos).
- Toda acción del backend valida centro y rol; ocultar un menú en la interfaz no es una medida de seguridad suficiente.

## 5. Estructura de la interfaz

La interfaz tiene una barra superior fija con el contexto de trabajo y un menú lateral colapsable.

**Barra superior (de izquierda a derecha)**

| Elemento | Comportamiento |
| --- | --- |
| Logo | Eddis o Studio Beauty, según la sede seleccionada. |
| Icono almohadilla | Contrae o expande el menú lateral. |
| Icono nueva pestaña | Abre el sistema en una pestaña nueva, en el Dashboard. |
| Selector de sede | Combo con los centros Eddis y SB a los que el usuario puede acceder. Al cambiarlo se recarga el contexto de todos los módulos. |
| Renovación del certificado digital | Muestra el vencimiento del certificado ARCA de la sede activa. |
| Icono claro/oscuro | Alterna el tema. |
| Usuario logueado | Menú con Configuración y Logout. |

**Menú lateral**

- Dashboard
- Administración: Pagos, Comprobantes Fiscales, CUIT, Consulta ARCA, Datos de Terceros
- Utilidades (solo staff): Usuarios, Configuración
- Auditoría

El documento original lista Utilidades, Usuarios, Configuración y Auditoría como entradas del menú; la agrupación anterior es una propuesta y debe confirmarse.

## 6. Especificación por módulo

### 6.1 Dashboard

Muestra la facturación del año seleccionado, con un selector de año.

- Facturación por mes y por centro dentro del año.
- Total por mes del año.
- Vencimiento del certificado digital por centro.

Los datos salen de los comprobantes del sistema, no de ARCA, para evitar consultas externas en cada carga. Se debe definir si cuentan solo comprobantes autorizados (supuesto recomendado).

### 6.2 Pagos

Lista los pagos de un centro en un rango de fechas, obtenidos de la API del sistema de gestión Eddis.

- **Filtros:** rango de fechas, centro, desde número de cuota, origen del pago (central o propio).
- **Selección:** cada fila tiene un checkbox para pasar el pago a factura.
- **Control de tope:** un contador muestra el importe acumulado de lo seleccionado frente al tope de facturación del CUIT; no permite confirmar una selección que lo supere.
- **Acción:** "Generar comprobantes" crea registros en estado *pendiente* en el módulo Comprobantes Fiscales.
- Si el alumno está cargado en Datos de Terceros, el comprobante se emite a nombre de la empresa indicada.
- Un pago ya vinculado a un comprobante no puede volver a seleccionarse.
- El parámetro "Importar cuota 99" del CUIT define si las cuotas con número 99 se incluyen en el listado.

### 6.3 Comprobantes Fiscales

Contiene los comprobantes generados desde Pagos. Nacen sin autorización de ARCA.

- Listado con estado: pendiente, autorizado, error.
- Checkbox por registro para autorizar en lote usando la API de ARCA.
- Por cada comprobante autorizado se guardan CAE, fecha de vencimiento del CAE, tipo, punto de venta y número.
- Si ARCA rechaza un comprobante, se guarda el mensaje de error y el registro puede reintentarse.
- Un comprobante autorizado no se edita ni se elimina.

### 6.4 CUIT

Administra los datos fiscales de cada centro. Los campos editables dependen del rol.

| Campo | Staff | No staff |
| --- | --- | --- |
| Razón social | Edita | Edita |
| Nombre fantasía | Edita | Edita |
| Domicilio | Edita | Edita |
| Ciudad | Edita | Edita |
| CUIT | Edita | Edita |
| Condición IVA | Edita | Edita |
| Alícuota | Edita | Edita |
| Punto de venta | Edita | Edita |
| Fecha de inicio de actividades | Edita | Edita |
| Vencimiento del certificado ARCA | Edita | Edita |
| Tope de facturación | Edita | Edita |
| Modo Prueba | Edita | Edita |
| Centro | Edita | No visible |
| Importar cuota 99 | Edita | No visible |
| Alta y baja de registros | Sí (CRUD) | No |

El staff tiene CRUD completo; el no staff solo actualiza los registros de sus centros.

### 6.5 Consulta ARCA

Consulta los comprobantes emitidos directamente en ARCA. El usuario elige el tipo de comprobante, que depende de la condición de IVA del CUIT:

| Condición IVA | Tipos de comprobante disponibles |
| --- | --- |
| Monotributo | Factura C, Nota de Crédito C |
| Exento | Factura C, Nota de Crédito C |
| Responsable Inscripto | Factura A, Factura B, Nota de Crédito A, Nota de Crédito B |

El combo de tipos se arma a partir de la condición IVA del CUIT de la sede activa.

### 6.6 Datos de Terceros

Permite facturar a una empresa cuando un alumno lo requiere. Se carga una vez y se aplica automáticamente en cada facturación posterior.

- **Campos:** documento del alumno, razón social, dirección, ciudad, CUIT, condición IVA.
- **Regla:** al generar un comprobante para un alumno que figura aquí, los datos del receptor son los de la empresa.
- El documento del alumno es la clave de búsqueda; no puede repetirse por centro.

### 6.7 Utilidades

Solo accesible para usuarios staff. El documento original no detalla su contenido; contiene los submódulos Usuarios y Configuración.

### 6.8 Usuarios

Lista los usuarios habilitados para usar el sistema.

- El alta se hace eligiendo a la persona de un combo alimentado por una API, que trae nombre, apellido y documento.
- Al dar de alta se asignan los centros en los que puede facturar.
- No se almacenan claves: la autenticación es siempre contra la API de validación.

### 6.9 Configuración

Pantalla para configurar las APIs externas:

- API de pagos del sistema de gestión Eddis.
- API de facturación ARCA.

Los parámetros exactos (URL, credenciales, entorno, timeouts) no están definidos en el documento; ver puntos abiertos. Todo cambio se audita sin registrar valores secretos.

### 6.10 Auditoría

Muestra el registro de cada acción realizada en el sistema.

- Columnas mínimas: fecha y hora, usuario, centro, módulo, acción, entidad afectada, valores anterior y nuevo, IP.
- Filtros: rango de fechas, usuario, centro, módulo y acción.
- Solo lectura: nadie puede editar ni eliminar registros.

## 7. Modelo de datos MySQL (propuesta)

El modelo propuesto tiene nueve tablas; los nombres y tipos son una base para discutir, no un esquema final.

| Tabla | Propósito | Campos principales |
| --- | --- | --- |
| `centro` | Sedes de Eddis y SB | id, nombre, marca (Eddis/SB), activo |
| `cuit` | Datos fiscales por centro | id, centro\_id, cuit, razon\_social, nombre\_fantasia, domicilio, ciudad, condicion\_iva, alicuota, punto\_venta, inicio\_actividades, venc\_certificado, tope\_facturacion, importar\_cuota\_99, modo\_prueba |
| `usuario` | Usuarios habilitados | id, documento (único), nombre, apellido, es\_staff, activo |
| `usuario_centro` | Centros que factura cada usuario | usuario\_id, centro\_id |
| `tercero` | Facturación a empresas | id, documento\_alumno, razon\_social, direccion, ciudad, cuit, condicion\_iva |
| `comprobante` | Comprobantes fiscales | id, cuit\_id, tipo, punto\_venta, numero, receptor (datos congelados), importe, estado, cae, venc\_cae, error\_arca, creado\_por, fecha |
| `comprobante_pago` | Pagos incluidos en cada comprobante | comprobante\_id, pago\_id\_eddis (único), nro\_cuota, importe |
| `auditoria` | Registro de acciones | id, fecha\_hora, usuario\_id, centro\_id, modulo, accion, entidad, entidad\_id, valor\_anterior (JSON), valor\_nuevo (JSON), ip |
| `configuracion` | Parámetros de APIs | clave, valor (cifrado si es secreto), actualizado\_por, fecha |

**Reglas de integridad**

- `comprobante_pago.pago_id_eddis` es único: impide facturar dos veces el mismo pago.
- Los datos del receptor se copian dentro del comprobante al generarlo, de modo que un cambio posterior en `tercero` no altera comprobantes ya emitidos.
- `auditoria` solo admite inserciones; el usuario de base de la aplicación no tiene permisos de UPDATE ni DELETE sobre ella.
- El estado de `comprobante` se limita a: pendiente, autorizado, error.

## 8. Flujo principal: del pago al comprobante autorizado

Un pago de Eddis pasa por cuatro pasos antes de quedar facturado; el comprobante nace sin autorizar y solo ARCA lo habilita.

&#91;embedded content: flujo · 4 pasos, 1 decisión, 1 reintento\]

Si ARCA rechaza el comprobante, queda con su mensaje de error y puede reintentarse; si lo aprueba, se guardan el CAE y su vencimiento.

**Reglas del flujo**

- El control del tope se hace en el backend, no solo en la pantalla: la suma de lo seleccionado más lo ya facturado no puede superar el tope del CUIT.
- La generación de comprobantes y su vínculo con los pagos ocurre en una sola transacción de base de datos.
- La autorización en ARCA se hace comprobante por comprobante; el fallo de uno no frena los demás de la selección.
- Con "Modo Prueba" activo en el CUIT, el flujo completo usa el entorno de pruebas de ARCA.
- Cada paso (selección, generación, intento de autorización, resultado) deja un registro en auditoría.

## 9. Matriz de permisos

El staff accede a todo; el no staff queda limitado a la operación de facturación de sus centros.

| Módulo | No staff | Staff |
| --- | --- | --- |
| Dashboard | Ve sus centros | Ve todos |
| Pagos | Selecciona y genera comprobantes | Igual |
| Comprobantes Fiscales | Ve y autoriza los de sus centros | Ve y autoriza todos |
| CUIT | Actualiza campos limitados | CRUD completo |
| Consulta ARCA | Sí | Sí |
| Datos de Terceros | Sí | Sí |
| Utilidades (Usuarios, Configuración) | No | Sí |
| Auditoría | Solo lo que corresponde a sus centros | Sí |

El documento no dice quién puede ver Auditoría; ver puntos abiertos.

## 10. Puntos abiertos y supuestos

Estos puntos no figuran en el documento funcional y deben resolverse antes de cerrar el diseño.

- [x] Contrato de la API de validación de usuarios: endpoint, formato de respuesta, manejo de sesión y tiempo de vida.
- [x] Contrato de la API de pagos Eddis: filtros soportados, paginación, identificador único de pago.
- [x] Cómo se autentica el sistema contra ARCA (WSAA/WSFE) y dónde se guardan certificado y clave privada. Esto se hace por una api que lo resuelve.
- [x] Permisos de Auditoría: ¿la ve todo usuario o solo staff? El usuario ve la auditoria a los que corresponde a su usuario
- [x] Contenido de Utilidades: el documento solo lo menciona como módulo exclusivo de staff. Si, solo exclusivo de Staff. El caso de auditoria para el usuario, lo ponemos en el menú de Administración
- [x] Tope de facturación:  mensual
- [x] Alícuota por CUIT: se aplica a toda la factura
- [x] Notas de crédito: se emiten desde este sistema. Se pueden generar en forma de lote de las facturas emitidas para luego autorizar
- [x] Un pago ya facturado si el comprobante se anula con nota de crédito: vuelve a quedar disponible
- [x] Parámetros exactos de la pantalla de Configuración: link de apis (pagos eddis, aprobar comprobantes, usuarios autorizados).
- [x] Qué significa "Importar cuota 99" y qué cuotas incluye: La cuota 99 es la cuota de derecho de examen. En casos normales, no se muestra en pagos, pero podemos pedir mostrarla para generar su factura
