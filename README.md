# Agricultor

Aplicación web en español para conectar el campo y el mercado, construida con
Next.js App Router, TypeScript, Prisma y PostgreSQL (Neon).

## Requisitos

- Node.js compatible con Next.js 16 (verificado localmente con 20.20.2).
- npm.

## Desarrollo

```bash
npm ci
npm run dev
```

La aplicación local se sirve en `http://localhost:3000`.

## Identidad y permisos

- `AUTH_SECRET`: secreto de al menos 32 caracteres usado para proteger las
  sesiones. No lo compartas ni lo guardes en el repositorio.
- `DATABASE_URL`: conexión PostgreSQL de Neon. La aplicación usa el adaptador
  serverless de Neon; configura la URL de conexión agrupada que entrega Neon.
- `API_KEY_BREVO` y `BREVO_SENDER_EMAIL`: clave y dirección remitente
  verificada en Brevo. Se usan para confirmar el correo, recuperar la
  contraseña y recibir por correo los reportes enviados desde «Reportar un
  problema», avisar al productor de una solicitud nueva y al comprador de su
  respuesta. Los reportes llegan a `andresdario.2001@gmail.com`. El build puede
  ejecutarse sin estas credenciales; para enviar correos, configura estas dos
  variables y usa una dirección remitente verificada en Brevo.
- `CRON_SECRET`: secreto aleatorio requerido para que el cron de Vercel procese
  el outbox de notificaciones una vez al día. La app intenta enviar al guardar
  el pedido; los errores recuperables se reintentan en el siguiente cron y los
  resultados ambiguos quedan registrados sin reenvío automático para evitar
  duplicados. En Vercel Hobby la hora puede variar hasta 59 minutos y un
  reintento puede tardar casi un día; el estado se muestra en el seguimiento
  del pedido. Nunca registres la clave ni direcciones de correo en logs.
- El registro manual requiere confirmar el correo. Al abrir el enlace,
  Better Auth inicia la sesión automáticamente.
- En Vercel, Better Auth usa los dominios de implementación que entrega el
  sistema (`VERCEL_URL`, `VERCEL_BRANCH_URL` y
  `VERCEL_PROJECT_PRODUCTION_URL`) para limitar los hosts permitidos.

La creación de cuenta ofrece correo y contraseña o Google. Después de confirmar
el correo del registro manual, la persona inicia sesión automáticamente y puede
comprar y consultar sus pedidos. Para Google OAuth, registra estas URI de
redirección autorizadas en las credenciales de Google:

- Desarrollo local: `http://localhost:3000/api/auth/callback/google`
- Producción de Vercel: `https://agricultor-blond.vercel.app/api/auth/callback/google`

Google bloquea el inicio de sesión desde algunos navegadores integrados en
aplicaciones. Si aparece el aviso de compatibilidad, abre el sitio directamente
en Safari o Chrome y vuelve a intentarlo. El callback conserva el dominio
original, por lo que la URI autorizada debe coincidir con el dominio desde el
que se inicia el acceso.

La URI de producción corresponde al endpoint de callback predeterminado de
Better Auth (`/api/auth/callback/google`). Si el dominio de producción de
Vercel cambia, actualiza esta URI con el nuevo dominio. Si habilitas Google en
un dominio de preview, registra también la URI exacta de ese dominio.

La opción
**Vender productos** abre el inventario de esa misma cuenta. Quienes tengan el
correo pendiente pueden solicitar el enlace desde el inicio de sesión.
La recuperación de contraseña
envía un enlace de un solo uso, válido por una hora, mediante Brevo; la pantalla
de solicitud no revela si el correo tiene una cuenta.

`META_WEBHOOK_VERIFY_TOKEN` se usa para la verificación inicial del webhook de
Meta. `META_APP_ID`, `META_APP_SECRET` y `META_GRAPH_API_VERSION` todavía no
son consumidas por el código. Cloudinary tampoco está integrado: las variables
`CLOUDINARY_API_SECRET`, `CLOUDINARY_CLOUD_NAME` y `CLOUDINARY_URL` no se usan,
y `COUDINARY_API_KEY` parece tener una errata; no se debe configurar ni usar
hasta implementar esa integración con el nombre correcto `CLOUDINARY_API_KEY`.
`.env.example` enumera las variables aplicables sin valores. No se puede
comprobar desde el repositorio cuáles variables están guardadas en Vercel.

El formulario público de reportes aplica una trampa honeypot, valida el origen y
el tamaño del mensaje, y limita cada dirección IP a tres envíos cada diez
minutos por instancia de servidor.

El esquema y sus migraciones están versionados, pero Vercel no las aplica
automáticamente: el build solo genera Prisma y compila Next.js. En el flujo de
release, antes de desplegar código que dependa de una migración, ejecuta
`npx prisma migrate deploy` desde un job de migración aprobado, con
`DATABASE_URL` proporcionada por el entorno seguro de ese release. No agregues
la migración al build de Vercel: también se ejecuta en previews y podría apuntar
a una base compartida. Verifica el entorno objetivo y un respaldo antes de
ejecutar; nunca uses la URL de producción para desarrollo o pruebas. CI aplica
las migraciones únicamente a su PostgreSQL local desechable.

El error Prisma `P2021` con `public.OrderNotification` faltante puede indicar
que no se aplicó `20261124010000_order_notifications_and_price_reference`, que
crea la tabla del historial de avisos. Revisa el ledger de Prisma y confirma
que la URL, base y esquema sean los mismos que usa el despliegue. Si la
migración figura aplicada pero la tabla no existe, hay drift de esquema:
`prisma migrate deploy` omitirá esa migración. No edites el ledger ni ejecutes
SQL manual para recrearla; detén el release y prepara una reparación revisada
o una restauración con respaldo verificado. Solo si la migración está pendiente
en la base correcta, aplícala mediante el flujo de release aprobado y después
despliega el código.

El catálogo y la ficha muestran la fecha del precio en hora de Colombia
cuando la base tiene aplicada la migración
`20261119000000_product_price_updated_at` y existe una fecha registrada.
Mientras falte la migración o para precios antiguos sin fecha, se muestra
«Fecha del precio no disponible». Actualiza las bases con las migraciones
versionadas, que instalan también el registro automático de esta fecha.

En «Mis productos» el vendedor puede activar o desactivar la revisión manual de
referencias para cada producto. Activarla requiere consentimiento explícito,
pero solo habilita revisión manual: no hay feed conectado ni actualizaciones
automáticas. El boletín diario SIPSA de DANE publica una observación mayorista
por producto y mercado en COP/kg, omite días sin publicación y no constituye un
rango de precios de transacción. No se encontró una segunda fuente comparable e
independiente ni una licencia explícita y verificable para reutilizar un feed
automatizado; el vendedor debe consultar la fuente oficial y confirmar
manualmente cualquier cambio. La preferencia no bloquea pedidos de ofertas con
precio ingresado manualmente. El precio publicado se presenta como referencia
del productor, no como una cotización oficial ni una garantía.
La fuente consultable es el [boletín diario de precios mayoristas de SIPSA](https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/sistema-de-informacion-de-precios-sipsa/componente-precios-mayoristas).
No hay descarga automática ni cron de precios: la programación de Vercel Hobby
admite como máximo una ejecución diaria, con precisión horaria de ±59 minutos;
no se habilita un servicio de pago para actualizar referencias.
La exploración encontró un XLSX diario de SIPSA con cotizaciones para 11
mercados y una observación en COP/kg por mercado y día. La licencia para
reutilización automatizada y la equivalencia de producto, unidad y mercado aún
no están verificadas; copias OSS del mismo feed no son fuentes independientes.
Por eso se conserva la revisión manual auditable hasta validar una fuente
gratuita y legal y su equivalencia.

Las reservas crean el evento de correo en la misma transacción y prueban su
despacho por Brevo inmediatamente después del commit, con un límite de cinco
segundos. El pedido permanece registrado aunque el correo falle o expire: el
estado de entrega queda en el outbox y el cron diario vuelve a intentar los
eventos pendientes. La interfaz informa por separado el estado del pedido y el
del correo; solo marca el correo como enviado tras una respuesta exitosa del
proveedor.

Los cambios manuales de precio guardan un historial transaccional con valor
anterior y nuevo, actor productor, observación y aplicación. Requieren la
migración `20261124120000_product_price_audit_and_reference_consent`.

## Catálogo, pedidos e inventario

El perfil comercial público requiere la migración
`20261120030000_seller_profile`. Cada vendedor decide si lo publica. Los
campos de contacto por canal y sus permisos de visibilidad requieren la
migración `20261125193000_seller_profile_contact_opt_in`; son privados por
defecto. La migración `20261127100000_public_seller_contacts` agrega el barrio
aproximado y el registro de aceptación explícita para publicar celular y correo.
No completa datos de vendedores existentes y retira del catálogo las ofertas ya
publicadas hasta que cada vendedor complete y acepte estos datos; después debe
volver a publicar sus ofertas. Los datos de contacto que anteriormente se
mantuvieron privados no se prellenan ni se publican automáticamente.

La opción de compartir WhatsApp en pedidos aceptados requiere aplicar en Neon
la migración `20261120000000_order_seller_contact`. Hasta entonces, sigue
disponible el resumen para copiar y coordinar la entrega.
Los datos acordados de entrega requieren la migración
`20261120010000_order_delivery_details`.
La confirmación del comprador requiere
`20261120020000_order_delivery_confirmation`. Cualquier cambio en el envío o la
recogida vuelve a dejar esos datos pendientes de confirmación.
Confirmar la recepción y calificar al vendedor requiere la migración
`20261120040000_order_receipt_rating`.
Las instrucciones de pago externo requieren la migración
`20261120050000_order_external_payment`. Si cambia el acuerdo de entrega,
el vendedor debe volver a configurar el pago después de la nueva confirmación.
Registrar que el vendedor recibió el pago requiere las migraciones
`20261120060000_order_payment_receipt` y
`20261123000000_order_payment_events`. En cada pedido aceptado, el vendedor
puede elegir transferencia, pago contra entrega o un enlace Wompi; esta
configuración es por pedido y no guarda credenciales del comercio. La
confirmación sigue siendo manual: ni Agricultor ni el enlace de Wompi verifican
automáticamente el abono. Al confirmar, el vendedor puede guardar una referencia
externa opcional; el comprador y el vendedor ven el estado, el importe y la
fecha en el historial del pedido. El sistema limita esa consulta a las personas
asociadas a la orden y registra cada confirmación una sola vez. No se almacenan
datos de tarjeta ni credenciales de pasarelas. Mercado Pago y otros proveedores
con cobro integrado no están habilitados: requieren integración del servidor y
validación de webhooks antes de ofrecer confirmación automática; no se requieren
variables de entorno nuevas para los métodos actuales.

Los productores administran sus productos y pueden publicarlos explícitamente.
El catálogo público conserva visibles las ofertas publicadas con inventario
disponible o reservado que tengan contacto y ubicación aproximada confirmados;
si todo está reservado, no se aceptan nuevas solicitudes. En cada oferta se
muestran el celular, correo y barrio/vereda y municipio, solo después de la
aceptación explícita del productor. No se publican direcciones exactas ni
coordenadas GPS.
Categorías, unidades y precio por unidad en pesos enteros COP siguen siendo
hipótesis provisionales descritas en `PLAN.md`.

La solicitud requiere una cuenta de comprador; el flujo de pedido como invitado
sigue pendiente de acuerdo con `PLAN.md`. Cada solicitud reserva inventario en
una actualización condicional atómica; el productor propietario puede aceptarla
o rechazarla. Aceptar consume la reserva y rechazar la devuelve a la
disponibilidad. El pedido conserva una instantánea del producto, unidad y
precio, además del historial de estados. Las notificaciones se registran en un
outbox transaccional y el correo se reintenta después del commit. La entrega y
el pago se coordinan entre las partes: Agricultor puede guardar instrucciones y
confirmaciones externas, pero no procesa ni custodia pagos, no factura ni
organiza transporte.

## Uso sin conexión (primer corte)

La aplicación registra un service worker propio, sin plugin adicional, y ofrece
una pantalla estática mínima cuando se intenta abrir `/` o `/catalogo` sin red.
Solo esa pantalla genérica se guarda en Cache Storage como respuesta creada por
el propio service worker; no contiene productos, cantidades ni datos de sesión.
La navegación pública siempre intenta consultar al servidor primero.

No se guardan páginas ni respuestas del catálogo, archivos de autenticación,
`/mi-cuenta`, pedidos, APIs ni mutaciones. El indicador sin conexión advierte
que el catálogo/las cantidades pueden no estar actualizados. Se requiere
conexión para solicitar: no se crean borradores, no se envían solicitudes y no
se confirma ninguna operación offline. El primer registro del service worker
requiere conexión; la pantalla mínima queda disponible después de que termine
su instalación. No se implementan sincronización ni resolución de conflictos.

## Comprobaciones

```bash
npm run db:generate
npm run db:validate
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm test
```

`npm run db:generate` genera el cliente Prisma y `npm run db:validate` valida el
esquema sin conectarse a la base. Las pruebas unitarias no requieren
credenciales. La prueba de integración solo se ejecuta con
`TEST_DATABASE_URL` apuntando a una base PostgreSQL local y desechable cuyo nombre
empiece por `agricultor_test` y con el esquema de migraciones ya aplicado; nunca
usa `DATABASE_URL` ni ejecuta migraciones. No apuntes `TEST_DATABASE_URL` a una
base de producción. `npm run test:e2e` prueba registro, inicio de sesión,
recuperación y el flujo de pedidos contra el servidor de producción construido;
también requiere esa base local desechable y el esquema aplicado. La recuperación
usa un stub HTTP local de Brevo y no envía correos reales. `npm test` ejecuta
pruebas HTTP de producción y necesita que se corra `npm run build` antes. El
build requiere `AUTH_SECRET` y `DATABASE_URL`, pero no ejecuta consultas ni
migraciones.

En CI, el workflow crea un servicio PostgreSQL 16 desechable por ejecución,
aplica allí las migraciones y pasa su URL de prueba explícitamente a integración
y E2E; no depende de un `TEST_DATABASE_URL` local, `.env` ni secretos de
producción. El build recibe una URL de marcador y un secreto temporal generado
para CI, y no conecta con la base.

Para poblar manualmente esa misma base local con productos visibles en el
catálogo, ejecuta `npm run db:seed:demo` con `TEST_DATABASE_URL` configurada
para una PostgreSQL en `localhost`, `127.0.0.1` o `::1` cuyo nombre empiece por
`agricultor_test`. El comando no carga `.env`, no usa `DATABASE_URL` y rechaza
conexiones remotas o bases con otro nombre. Es idempotente y solo inserta o
actualiza sus identificadores reservados `demo-*`; no borra filas. Crea un
productor ficticio sin credenciales y productos publicados marcados `DEMO`.
Registra manualmente tu propia cuenta para probar como comprador; el productor
de demostración no puede iniciar sesión ni responder pedidos. Para probar
respuestas, registra tu propia cuenta productora y publica un producto. Este
comando no siembra ni modifica la base del sitio desplegado; prepara únicamente
un entorno local descartable.
