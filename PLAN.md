# Agricultor | Plan de ventas por volumen

## Enfoque

Ayudar a productores a publicar lo que tienen disponible y vender por volumen a quienes compran para revender, abastecer o distribuir. En el catálogo, esos compradores deben poder decidir rápido si una oferta les sirve por cantidad, unidad, ubicación, precio y fecha. El productor debe obtener valor incluso antes de cerrar su primera venta con el conversor, la calculadora de costos y su inventario.

El primer piloto se propone en una zona y con uno o dos productos que los participantes ya comercialicen. Se usará el acceso comprador existente para probar con distribuidores y comercios. La identidad comercial, sus requisitos y quién puede comprar o vender por volumen se definirán según el piloto.

La cuenta de comprador seguirá disponible y se recomendará para ver respuestas y conservar el historial. La solicitud como invitado es un flujo pendiente y se añadirá como alternativa, con datos mínimos de contacto y entrega.

## Punto de partida

La aplicación ya tiene cuentas y recuperación por Brevo, catálogo público, inventario, reservas, solicitudes con aceptación o rechazo, seguimiento, favoritos, agenda, conversor y calculadora. Los pedidos guardan el precio y la unidad de la solicitud y el flujo actual pide revisar la oferta si cambia antes de reservar. El historial de este archivo conserva las propuestas anteriores. Las prioridades de esta versión guían el trabajo nuevo.

## 1. Ofertas por volumen y precios del día

**Razón para volver.** El productor puede actualizar lo que vende desde el celular. El comprador puede consultar una oferta útil antes de llamar o hacer un viaje.

- En «Mis productos» el productor puede cambiar por separado el precio y la cantidad disponible desde cada tarjeta. El piloto debe validar estas acciones. Un cambio de cantidad conserva las reservas y la fecha del precio. Para ofertas antiguas sin historial de precio, el catálogo indica que la fecha no está disponible.
- Validar pedido mínimo, unidad y presentación comercial con operaciones reales. Para un bulto de peso variable, indicar su peso acordado o cotizar en kilos. Confirmar con compradores qué datos necesitan sobre calidad y fecha disponible antes de convertirlos en campos obligatorios.
- Explorar vigencia elegida por el productor y la opción «Consultar precio» si acuerdan el valor por llamada o mensaje. Definir con el piloto qué ocurre al vencer una oferta, cómo se confirma una cotización y cuándo se libera inventario antes de implementar esos flujos.
- Mantener el precio manual bajo control del productor. Al confirmar un pedido, ambas partes deben ver la cantidad, unidad, precio acordado y total. Una edición posterior de la oferta solo aplica a nuevas operaciones. Si cambia antes de solicitar, el comprador revisa el nuevo dato.
- Evaluar SIPSA como referencia optativa por producto, mercado, unidad y fecha. La investigación encontró un XLSX diario con cotizaciones en 11 mercados y una observación en COP/kg por mercado y día, pero no una licencia de reutilización automatizada confirmada ni equivalencias validadas entre producto, unidad y mercado. Los clones OSS del mismo feed no son fuentes independientes. Mantener el precio manual y su historial auditable; no habilitar auto-feed ni servicios pagos hasta validar una fuente gratuita/legal y equivalencias. [DANE, boletín diario SIPSA](https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/sistema-de-informacion-de-precios-sipsa/componente-precios-mayoristas)

## 2. Pedido y entrega coordinados por el negocio

**Razón para volver.** Comprador y productor ven qué se acordó y cuál es el siguiente paso, aunque coordinen por fuera de la aplicación.

- Conservar el seguimiento actual y validar una secuencia corta de entrega. Propuesta para probar con ambos roles: pedido aceptado, listo para recoger o despachado y recepción confirmada. Guardar actor y hora de cada cambio. Definir quién cambia cada estado y cómo se reporta una entrega parcial, dañada o que no llegó.
- Acordar recogida o envío, responsable, fecha o franja y costo si corresponde. Cada negocio organiza el transporte. Compartir direcciones exactas y datos de contacto solo entre las partes autorizadas.
- En pedidos aceptados, ambas partes pueden copiar el resumen para coordinar por WhatsApp o el canal que ya usen. El resumen contiene el producto, la cantidad y el importe registrado. Validar con el piloto si hace falta compartir enlaces de contacto con autorización.
- Probar que cualquier actualización repetida conserva un solo evento, que el pedido queda registrado si falla una notificación y que una persona ajena al pedido no puede verlo ni modificarlo.

## 3. Notificaciones y calificaciones

- «Avisos de pedidos» muestra al vendedor las solicitudes por responder y al comprador las respuestas recientes. Cada aviso abre el pedido correspondiente.

- El distribuidor puede publicar su perfil comercial con descripción, municipio y ofertas disponibles. El contacto de coordinación permanece en el pedido.

**Razón para volver.** El productor se entera a tiempo de una solicitud y quien compra puede evaluar negocios que sí completan entregas.

- Empezar con correo para el productor cuando recibe una solicitud y para el comprador cuando hay una respuesta. Considerar despacho o cambios de entrega solo si los participantes los necesitan. El correo debe llevar al pedido y omitir dirección, datos bancarios y detalles sensibles.
- Reutilizar Brevo cuando se autoricen el remitente y el entorno de prueba. Persistir cada evento en la transacción del pedido y probar el despacho inmediatamente después del commit con tiempo límite; el cron diario reintenta fallos. El outbox usa claim atómico y token de fencing para deduplicar workers concurrentes. El fallo del correo no revierte la reserva, y la interfaz no declara enviado el correo hasta confirmarlo. Probar con un sustituto local antes de cualquier piloto con destinatarios reales.
- El comprador puede confirmar la recepción completa y dejar una calificación de 1 a 5 por pedido. El perfil público muestra el promedio y el número de calificaciones. Para añadir reseñas escritas, definir reporte, moderación y correcciones. Validar si también hace falta calificar compradores.

## 4. Formas de pago

En pedidos con entrega confirmada y WhatsApp del vendedor, ya se pueden registrar instrucciones de transferencia, contra entrega o enlace externo de Wompi. El vendedor puede confirmar el abono completo después de revisarlo y el comprador ve el importe y la fecha. Quedan pendientes la verificación automática y el manejo de ajustes o pagos parciales. Un cambio previo en la entrega retira las instrucciones anteriores.

**Razón para volver.** Las partes conservan un resumen de cuánto se debe, a quién y en qué momento se acordó pagar.

| Opción | Alcance propuesto | Qué validar |
| --- | --- | --- |
| Transferencia directa | El comprador transfiere al vendedor por fuera de Agricultor. El vendedor puede registrar que recibió el pago. | Quién verifica en su banco, qué hacer con pagos parciales y cómo resolver desacuerdos. Un comprobante del comprador equivale a un reporte, y la confirmación de recepción corresponde al vendedor. |
| Pago contra entrega | Comprador y vendedor acuerdan pagar al recibir. El vendedor registra lo recibido cuando lo verifica. | Quién cobra, medios aceptados, costos de transporte y procedimiento si la entrega o el cobro falla. |
| Enlace externo de Wompi | Probar si al vendedor le basta compartir un enlace de su propio comercio para un monto acordado. Wompi permite generar enlaces desde su panel. | Alta del comercio, comisiones, conciliación, titularidad, reversos y soporte. Si se muestra un enlace en Agricultor, validar el dominio y tratar el pago como externo hasta contar con verificación confiable. [Wompi, enlaces de pago](https://docs.wompi.co/docs/colombia/links-de-pago/) |

Propuesta para el piloto: transferencia directa o contra entrega, según lo que las partes acepten. Guardar el método acordado y la confirmación del vendedor si hace falta. Mantener el estado de pago separado del de entrega. Dejar la custodia, el reparto de fondos y la integración de múltiples comercios para una decisión posterior con requisitos, revisión legal y un entorno de pruebas. El plan no requiere claves nuevas. Si luego se aprueba una integración, primero se definen la cuenta responsable, las credenciales de prueba y su configuración por un canal seguro.

## 5. Herramientas para gestionar el negocio

| Herramienta | Utilidad | Prioridad propuesta |
| --- | --- | --- |
| Conversor de peso y valor en COP | Comprobar cuánto pesa y cuánto vale una venta aunque el precio esté por libra o arroba. | Mejorar la herramienta existente con ejemplos del piloto. |
| Calculadora de costos y margen | Revisar si una venta cubre producción, empaque o transporte. | Validar qué costos usan los participantes y aprovechar la calculadora existente. |
| Inventario y disponibilidad | Saber qué se puede ofrecer sin prometer lo ya reservado. | Priorizar actualización rápida. Probar lotes y fechas de disponibilidad solo si una oferta por producto resulta insuficiente. |
| Resumen descargable de ventas y entregas | Preparar despachos con las cantidades y los precios registrados. | El productor ya puede descargar sus pedidos aceptados en CSV. Validar con el piloto el formato y si hace falta registrar entregas o cobros. |
| Repetir una compra frecuente | Ahorrar tiempo a distribuidores que vuelven a comprar al mismo productor. | Evaluar cuando haya compras repetidas. Confirmar precio y cantidad actuales cada vez. |

## Orden de trabajo y criterio para avanzar

1. **Validar operaciones reales.** Pedir a productores y compradores que reconstruyan una venta reciente, desde cuánto pudieron ofrecer hasta cómo confirmaron recepción y pago. Registrar palabras usadas, unidades, mínimos, cambios del precio durante el día, responsables, acuerdos y excepciones. Evitar recoger contactos privados o datos bancarios reales para la prueba.
2. **Validar el cambio de precio.** Probar en móvil la actualización rápida, la revisión del comprador y la conservación del precio acordado en un pedido previo. El catálogo y la ficha muestran la fecha cuando está registrada. Verificar la migración en producción para habilitar el registro allí. Acordar con el piloto las reglas de vigencia antes de introducir vencimientos.
3. **Completar una entrega.** Probar con pedido simulado y coordinación externa. Avanzar cuando comprador y productor puedan identificar quién actúa a continuación y qué hacer si no hay recepción conforme.
4. **Avisar y generar confianza.** Agregar correos de los eventos acordados y luego calificaciones verificadas. Evaluar pagos integrados solo si el piloto muestra que el acuerdo y la confirmación externa generan trabajo o errores frecuentes.

Medir en el piloto cuánto tarda publicar o actualizar una oferta desde el celular, cuántas solicitudes llegan con cantidad y precio entendidos, cuántas llegan a recepción confirmada y por qué se cae cada operación. Revisar también si los participantes vuelven al inventario o a las herramientas sin que alguien les recuerde. Acordar metas después de observar una primera ronda.

Mantener pruebas de permisos, integridad de reservas, concurrencia y recorridos móviles. Cada cambio de código debe pasar lint, typecheck, unitarias, smoke y build de producción. Ejecutar integración y E2E solo con PostgreSQL local desechable. Posponer pagos integrados, nuevos roles, integraciones sociales, sincronización sin conexión y automatización de precios hasta acordar su alcance y validación.
