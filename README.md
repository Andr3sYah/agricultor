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
  problema». Los reportes llegan a `andresdario.2001@gmail.com`. El build puede
  ejecutarse sin estas credenciales; para recibir reportes en Vercel, configura
  estas mismas dos variables y usa una dirección remitente verificada en Brevo.
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

El esquema y sus migraciones están versionados, pero no se aplican
automáticamente. Antes de desplegar una migración, verifica que `DATABASE_URL`
apunte al entorno previsto y que exista un respaldo adecuado.

El catálogo y la ficha muestran la fecha del precio en hora de Colombia
cuando la base tiene aplicada la migración
`20261119000000_product_price_updated_at` y existe una fecha registrada.
Mientras falte la migración o para precios antiguos sin fecha, se muestra
«Fecha del precio no disponible». Actualiza las bases con las migraciones
versionadas, que instalan también el registro automático de esta fecha.

## Catálogo, pedidos e inventario

El perfil comercial público requiere la migración
`20261120030000_seller_profile`. Cada vendedor decide si lo publica.

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
Registrar que el vendedor recibió el pago requiere la migración
`20261120060000_order_payment_receipt`.

Los productores administran sus productos y pueden publicarlos explícitamente.
El catálogo público muestra solo productos publicados con cantidad disponible y
no expone datos personales o de contacto. Categorías, unidades y precio por
unidad en pesos enteros COP siguen siendo hipótesis provisionales descritas en
`PLAN.md`.

Un comprador autenticado puede solicitar una cantidad. La solicitud reserva
inventario en una actualización condicional atómica; el productor propietario
puede aceptarla o rechazarla. Aceptar consume la reserva y rechazar la devuelve
a la disponibilidad. El pedido conserva una instantánea del nombre, unidad y
precio, además del historial básico de estados. No se procesan pagos, facturas,
transporte, notificaciones ni sincronización offline.

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
