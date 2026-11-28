import Link from "next/link";
import { redirect } from "next/navigation";
import { getCatalogPageHref, getPublicProductOrderHref } from "@/features/catalog/public-products";
import { OrderCoordinationSummary } from "@/features/orders/order-coordination-summary";
import { getOptionalOrderSchemaAvailability } from "@/features/orders/order-schema";
import {
  getOrderPagination,
  parseOrderPage,
} from "@/features/orders/order-pagination";
import { OrderDeliveryConfirmationForm } from "@/features/orders/order-delivery-confirmation-form";
import { OrderRatingForm, OrderReceiptForm } from "@/features/orders/order-receipt-forms";
import { ExternalPaymentForm } from "@/features/orders/external-payment-form";
import { paymentLabels } from "@/features/orders/external-payment";
import { PaymentReceiptForm } from "@/features/orders/payment-receipt-form";
import { OrderDeliveryForm } from "@/features/orders/order-delivery-form";
import { OrderSellerContactForm } from "@/features/orders/order-seller-contact-form";
import { OrderDecisionForm } from "@/features/orders/order-decision-form";
import { PRODUCT_UNITS } from "@/features/products/product-validation";
import {
  calculateUnitPriceTotal,
  formatAgriculturalValue,
} from "@/features/unit-converter/agricultural-units";
import type { OrderStatus } from "@/generated/prisma/enums";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { Prisma, type OrderDeliveryDetails } from "@/generated/prisma/client";

const statusLabels: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
};
const statusClasses: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-950",
  ACCEPTED: "bg-emerald-100 text-emerald-950",
  REJECTED: "bg-rose-100 text-rose-950",
};
const quantityFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 3,
});
const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getCurrentIdentity();

  if (!identity) {
    redirect("/iniciar-sesion");
  }

  const isBuyer = identity.roles.includes("BUYER");
  const isProducer = identity.roles.includes("PRODUCER");
  if (!isBuyer && !isProducer) {
    redirect("/mi-cuenta");
  }
  const params = await searchParams;
  const registeredOrder = params.registrada;
  const buyerStatus = (Object.keys(statusLabels) as OrderStatus[])
    .find((status) => status === params.estado);
  const buyerReference = typeof params.referencia === "string"
    ? params.referencia.trim().slice(0, 100).replaceAll("\0", "")
    : "";
  const producerStatus: "ACCEPTED" | "REJECTED" | undefined = params.respuesta === "ACCEPTED"
    ? "ACCEPTED"
    : params.respuesta === "REJECTED"
      ? "REJECTED"
      : undefined;
  const producerProduct = typeof params.producto === "string"
    ? params.producto.trim().slice(0, 100).replaceAll("\0", "")
    : "";
  const buyerRequestedPage = parseOrderPage(params.compradorPagina);
  const pendingProducerRequestedPage = parseOrderPage(params.productorPendientePagina);
  const answeredProducerRequestedPage = parseOrderPage(params.productorRespondidoPagina);
  const buyerFilters = new URLSearchParams({
    ...(isBuyer && buyerStatus ? { estado: buyerStatus } : {}),
    ...(isBuyer && buyerReference ? { referencia: buyerReference } : {}),
  });
  const producerFilters = new URLSearchParams({
    ...(isProducer && producerStatus ? { respuesta: producerStatus } : {}),
    ...(isProducer && producerProduct ? { producto: producerProduct } : {}),
  });
  const resetBuyerHref = `/mi-cuenta/pedidos${producerFilters.size ? `?${producerFilters}` : ""}#solicitudes-enviadas`;
  const resetProducerHref = `/mi-cuenta/pedidos${buyerFilters.size ? `?${buyerFilters}` : ""}#pedidos-respondidos`;

  const buyerWhere = {
    buyerId: identity.userId,
    ...(buyerStatus ? { status: buyerStatus } : {}),
    ...(buyerReference ? { id: buyerReference } : {}),
  };
  const producerWhere = { producerId: identity.userId };
  const producerAnsweredWhere = {
    ...producerWhere,
    status: producerStatus ?? { not: "PENDING" as const },
    ...(producerProduct
      ? {
          OR: [
            {
              id: {
                equals: producerProduct,
                mode: "insensitive" as const,
              },
            },
            {
              productName: {
                contains: producerProduct,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  } satisfies Prisma.OrderWhereInput;
  const hasAnsweredFilters = Boolean(producerStatus || producerProduct);

  const [buyerTotal, producerStatusGroups, filteredAnsweredTotal] =
    await Promise.all([
      isBuyer ? prisma.order.count({ where: buyerWhere }) : Promise.resolve(0),
      isProducer
        ? prisma.order.groupBy({
            by: ["status"],
            where: producerWhere,
            _count: { _all: true },
          })
        : Promise.resolve([]),
      isProducer && hasAnsweredFilters
        ? prisma.order.count({ where: producerAnsweredWhere })
        : Promise.resolve(0),
    ]);

  const producerTotals: Record<OrderStatus, number> = {
    PENDING: 0,
    ACCEPTED: 0,
    REJECTED: 0,
  };
  for (const group of producerStatusGroups) {
    producerTotals[group.status] = group._count._all;
  }
  const pendingProducerTotal = producerTotals.PENDING;
  const answeredProducerTotal = hasAnsweredFilters
    ? filteredAnsweredTotal
    : producerTotals.ACCEPTED + producerTotals.REJECTED;
  const producerTotal = Object.values(producerTotals).reduce(
    (total, count) => total + count,
    0,
  );
  const buyerPagination = getOrderPagination(buyerTotal, buyerRequestedPage);
  const pendingProducerPagination = getOrderPagination(
    pendingProducerTotal,
    pendingProducerRequestedPage,
  );
  const answeredProducerPagination = getOrderPagination(
    answeredProducerTotal,
    answeredProducerRequestedPage,
  );

  const [buyerOrders, pendingProducerOrders, answeredProducerOrders] =
    await Promise.all([
      isBuyer
        ? prisma.order.findMany({
            where: buyerWhere,
            skip: buyerPagination.skip,
            take: buyerPagination.take,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            include: {
              product: {
                select: { id: true, isPublished: true, availableQuantity: true },
              },
              history: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  fromStatus: true,
                  toStatus: true,
                  createdAt: true,
                },
              },
              notifications: {
                select: { type: true, status: true },
              },
            },
          })
        : Promise.resolve([]),
      isProducer
        ? prisma.order.findMany({
            where: { ...producerWhere, status: "PENDING" },
            skip: pendingProducerPagination.skip,
            take: pendingProducerPagination.take,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            include: {
              history: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  fromStatus: true,
                  toStatus: true,
                  createdAt: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      isProducer
        ? prisma.order.findMany({
            where: producerAnsweredWhere,
            skip: answeredProducerPagination.skip,
            take: answeredProducerPagination.take,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            include: {
              history: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  fromStatus: true,
                  toStatus: true,
                  createdAt: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

  const acceptedOrderIds = [...new Set(
    [...buyerOrders, ...pendingProducerOrders, ...answeredProducerOrders]
      .filter(({ status }) => status === "ACCEPTED")
      .map(({ id }) => id),
  )];
  const schemaAvailability = acceptedOrderIds.length > 0
    ? await getOptionalOrderSchemaAvailability()
    : {
        contacts: false,
        delivery: false,
        confirmation: false,
        receipt: false,
        externalPayment: false,
        paymentReceipt: false,
        paymentEvent: false,
      };
  const {
    contacts: contactsAvailable,
    delivery: deliveryAvailable,
    confirmation: confirmationAvailable,
    receipt: receiptAvailable,
    externalPayment: paymentAvailable,
    paymentReceipt: paymentReceiptAvailable,
    paymentEvent: paymentEventAvailable,
  } = schemaAvailability;
  const [contacts, deliveries, receipts, paymentReceipts, paymentEvents] = await Promise.all([
    contactsAvailable ? prisma.orderSellerContact.findMany({
      where: { orderId: { in: acceptedOrderIds } },
      select: { orderId: true, phone: true },
    }) : [],
    deliveryAvailable && confirmationAvailable ? prisma.$queryRaw<(OrderDeliveryDetails & { confirmed: boolean; paymentMethod: string | null; wompiUrl: string | null })[]>`
      SELECT d.*, c."orderId" IS NOT NULL AS confirmed,
        ${paymentAvailable ? Prisma.sql`p."method" AS "paymentMethod", p."wompiUrl"` : Prisma.sql`NULL AS "paymentMethod", NULL AS "wompiUrl"`}
      FROM "OrderDeliveryDetails" d
      LEFT JOIN "OrderDeliveryConfirmation" c ON c."orderId" = d."orderId"
      ${paymentAvailable ? Prisma.sql`LEFT JOIN "OrderExternalPayment" p ON p."orderId" = c."orderId"` : Prisma.empty}
      WHERE d."orderId" IN (${Prisma.join(acceptedOrderIds)})
    ` : deliveryAvailable ? prisma.orderDeliveryDetails.findMany({
      where: { orderId: { in: acceptedOrderIds } },
    }) : [],
    receiptAvailable ? prisma.orderReceipt.findMany({
      where: { orderId: { in: acceptedOrderIds } },
      select: { orderId: true, receivedAt: true, rating: true },
    }) : [],
    paymentReceiptAvailable ? prisma.orderPaymentReceipt.findMany({
      where: { orderId: { in: acceptedOrderIds } },
    }) : [],
    paymentEventAvailable ? prisma.orderPaymentEvent.findMany({
      where: { orderId: { in: acceptedOrderIds } },
      orderBy: { createdAt: "desc" },
      select: {
        orderId: true,
        provider: true,
        method: true,
        externalReference: true,
        amountCOP: true,
        currency: true,
        status: true,
        createdAt: true,
      },
    }) : [],
  ]);
  const paymentReceiptByOrder = new Map(paymentReceipts.map((record) => [record.orderId, record]));
  const paymentEventsByOrder = new Map<string, typeof paymentEvents>();
  for (const event of paymentEvents) {
    paymentEventsByOrder.set(event.orderId, [...(paymentEventsByOrder.get(event.orderId) ?? []), event]);
  }
  const deliveryByOrder = new Map(deliveries.map((delivery) => [delivery.orderId, delivery]));
  const receiptByOrder = new Map(receipts.map((receipt) => [receipt.orderId, receipt]));
  const contactByOrder = new Map(contacts.map(({ orderId, phone }) => [orderId, phone]));
  function getPageHref(
    parameter: string,
    page: number,
    anchor: string,
  ): string {
    const query = new URLSearchParams(buyerFilters);
    producerFilters.forEach((value, key) => query.set(key, value));
    if (buyerPagination.page > 1 && parameter !== "compradorPagina") {
      query.set("compradorPagina", String(buyerPagination.page));
    }
    if (
      pendingProducerPagination.page > 1 &&
      parameter !== "productorPendientePagina"
    ) {
      query.set(
        "productorPendientePagina",
        String(pendingProducerPagination.page),
      );
    }
    if (
      answeredProducerPagination.page > 1 &&
      parameter !== "productorRespondidoPagina"
    ) {
      query.set(
        "productorRespondidoPagina",
        String(answeredProducerPagination.page),
      );
    }
    if (page > 1) query.set(parameter, String(page));
    return `/mi-cuenta/pedidos${query.size ? `?${query}` : ""}#${anchor}`;
  }

  function pageNavigation(
    pagination: ReturnType<typeof getOrderPagination>,
    parameter: string,
    anchor: string,
    label: string,
  ) {
    if (pagination.pageCount <= 1) return null;
    return (
      <nav aria-label={label} className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        {pagination.page > 1 && (
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline"
            href={getPageHref(parameter, pagination.page - 1, anchor)}
          >
            ← Anterior
          </Link>
        )}
        <span aria-current="page">
          Página {pagination.page} de {pagination.pageCount}
        </span>
        {pagination.page < pagination.pageCount && (
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline"
            href={getPageHref(parameter, pagination.page + 1, anchor)}
          >
            Siguiente →
          </Link>
        )}
      </nav>
    );
  }

  function orderCard(
    order:
      | (typeof buyerOrders)[number]
      | (typeof pendingProducerOrders)[number]
      | (typeof answeredProducerOrders)[number],
    producerView: boolean,
  ) {
    const ProductHeading = producerView ? "h4" : "h3";
    const TrackingHeading = producerView ? "h5" : "h4";
    if (!("history" in order)) {
      throw new Error("El pedido no incluye su historial de estado.");
    }
    const decisionEvent =
      order.status === "PENDING"
        ? null
        : order.history.find((event) => event.toStatus === order.status);
    const unit =
      PRODUCT_UNITS.find(({ value }) => value === order.unit)?.label ?? order.unit;
    const quantity = `${quantityFormatter.format(order.requestedQuantity.toNumber())} ${unit}`;
    const unitPrice = copFormatter.format(order.priceCOP);
    const requestedAt = dateFormatter.format(order.createdAt);
    const phone = contactByOrder.get(order.id);
    const delivery = deliveryByOrder.get(order.id);
    const paymentReceipt = paymentReceiptByOrder.get(order.id);
    const paymentEventsForOrder = paymentEventsByOrder.get(order.id) ?? [];
    const receipt = receiptByOrder.get(order.id);
    const confirmed = delivery && "confirmed" in delivery && delivery.confirmed === true;
    const payment = delivery && "paymentMethod" in delivery && typeof delivery.paymentMethod === "string"
      ? { orderId: order.id, method: delivery.paymentMethod, wompiUrl: "wompiUrl" in delivery && typeof delivery.wompiUrl === "string" ? delivery.wompiUrl : null }
      : undefined;
    const estimatedTotal = calculateUnitPriceTotal(
      order.requestedQuantity.toString(),
      String(order.priceCOP),
    ).value;
    const totalWithDelivery = delivery && estimatedTotal !== null
      ? String(BigInt(estimatedTotal) + BigInt(delivery.costCOP))
      : null;
    const currentOffer = !producerView && order.status === "ACCEPTED" && "product" in order
      ? order.product
      : null;
    const currentNotificationType = order.status === "ACCEPTED"
      ? "REQUEST_ACCEPTED"
      : order.status === "REJECTED"
        ? "REQUEST_REJECTED"
        : "REQUEST_CREATED";
    const notificationStatus = "notifications" in order
      ? order.notifications.find(({ type }) => type === currentNotificationType)?.status
      : undefined;

    return (
      <li
        className="scroll-mt-4 rounded-2xl border border-slate-200 p-5"
        id={producerView ? `recibida-${order.id}` : `solicitud-${order.id}`}
        key={`${producerView ? "producer" : "buyer"}-${order.id}`}
        tabIndex={-1}
      >
        {!producerView && registeredOrder === order.id && (
          <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-emerald-950" role="status">
            El pedido quedó registrado.
            {notificationStatus === "SENT"
              ? " El correo al vendedor fue enviado."
              : notificationStatus === "PENDING" ||
                  notificationStatus === "RETRY" ||
                  notificationStatus === "SENDING"
                ? notificationStatus === "RETRY"
                  ? " No se pudo confirmar el correo; se reintentará automáticamente. El vendedor puede ver la solicitud en sus avisos de pedidos."
                  : " El correo al vendedor está pendiente; puede ver la solicitud en sus avisos de pedidos."
                : notificationStatus
                ? " No pudimos confirmar el correo. El pedido sigue registrado y el vendedor puede verlo en sus avisos de pedidos."
                : ""}
          </p>
        )}
        {!producerView && notificationStatus && registeredOrder !== order.id && (
          <p className="mb-3 rounded-xl bg-slate-50 p-3 text-slate-800" role="status">
            {notificationStatus === "SENT"
              ? "El correo sobre esta actualización fue enviado."
              : notificationStatus === "RETRY"
                ? "No se pudo confirmar el correo; se reintentará automáticamente."
                : notificationStatus === "PENDING" ||
                    notificationStatus === "SENDING"
                ? "El correo sobre esta actualización está pendiente; puedes consultar el estado aquí."
                : "El correo sobre esta actualización no pudo confirmarse. Puedes consultar el estado aquí."}
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ProductHeading className="text-lg font-semibold">{order.productName}</ProductHeading>
          <span
            aria-label={`Estado del pedido: ${statusLabels[order.status]}`}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${statusClasses[order.status]}`}
          >
            {statusLabels[order.status]}
          </span>
        </div>
        <dl className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <div>
            <dt className="font-medium">Cantidad</dt>
            <dd>{quantity}</dd>
          </div>
          <div>
            <dt className="font-medium">Precio por unidad al solicitar</dt>
            <dd>{unitPrice}</dd>
          </div>
          {estimatedTotal !== null && (
            <div>
              <dt className="font-medium">Valor estimado al solicitar</dt>
              <dd>$ {formatAgriculturalValue(estimatedTotal)} COP</dd>
            </div>
          )}
          <div>
            <dt className="font-medium">Solicitud</dt>
            <dd>{requestedAt}</dd>
          </div>
          <div>
            <dt className="font-medium">Referencia del pedido</dt>
            <dd className="break-all font-mono">{order.id}</dd>
          </div>
        </dl>
        <section className="mt-4 rounded-xl bg-slate-50 p-4">
          <TrackingHeading className="font-medium">Seguimiento</TrackingHeading>
          <ol
            aria-label={
              producerView
                ? "Seguimiento de la solicitud recibida"
                : "Seguimiento de tu solicitud"
            }
            className="mt-2 space-y-3 text-sm text-slate-700"
          >
            <li>
              <p className="font-medium">
                <span
                  aria-hidden="true"
                  className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-950"
                >
                  1
                </span>
                Solicitud enviada
              </p>
              <time dateTime={order.createdAt.toISOString()}>
                {requestedAt}
              </time>
            </li>
            <li aria-current={order.status === "PENDING" ? "step" : undefined}>
              <p className="font-medium">
                <span
                  aria-hidden="true"
                  className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${order.status === "PENDING" ? "bg-amber-100 text-amber-950" : order.status === "REJECTED" ? "bg-rose-100 text-rose-950" : "bg-emerald-100 text-emerald-950"}`}
                >
                  2
                </span>
                {producerView ? "Tu respuesta" : "Respuesta del productor"}
              </p>
              {order.status === "PENDING" ? (
                <p>Esperando respuesta</p>
              ) : (
                <p>
                  {statusLabels[order.status]}
                  {decisionEvent && (
                    <>
                      {" · "}
                      <time dateTime={decisionEvent.createdAt.toISOString()}>
                        {dateFormatter.format(decisionEvent.createdAt)}
                      </time>
                    </>
                  )}
                </p>
              )}
            </li>
          </ol>
          {order.status === "REJECTED" && !producerView ? (
            <p className="mt-3 text-sm text-slate-700">
              El productor rechazó esta solicitud.{" "}
              <Link
                className="font-semibold text-emerald-900 underline"
                href="/catalogo"
              >
                Explora otros productos.
              </Link>
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              {order.status === "PENDING"
                ? producerView
                  ? "Revisa la solicitud y elige aceptar o rechazar."
                  : "El productor debe revisar la solicitud."
                : order.status === "ACCEPTED"
                  ? producerView
                    ? "Registraste la aceptación."
                    : "El productor aceptó esta solicitud."
                  : "La solicitud fue rechazada y la cantidad reservada volvió a estar disponible."}
            </p>
          )}
        </section>
        {order.status === "ACCEPTED" && (
          <OrderCoordinationSummary
            summary={[
              `Pedido aceptado en Agricultor · ${order.productName}`,
              `Referencia: ${order.id}`,
              `Solicitud: ${requestedAt} (hora de Colombia)`,
              `Cantidad: ${quantity}`,
              `Precio por unidad al solicitar: ${unitPrice} COP`,
              ...(estimatedTotal === null
                ? []
                : [`Valor estimado al solicitar: $ ${formatAgriculturalValue(estimatedTotal)} COP`]),
              "¿Acordamos si será envío o recogida, cuándo y dónde?",
            ].join("\n")}
          />
        )}
        {deliveryAvailable && order.status === "ACCEPTED" && (
          <>
            <section className="mt-4 rounded-xl bg-slate-50 p-4" aria-label="Datos de entrega">
              <TrackingHeading className="font-semibold">Datos de entrega</TrackingHeading>
              {delivery ? (
                <dl className="mt-2 space-y-2 break-words text-sm text-slate-700">
                  <div><dt className="font-medium">Forma de entrega</dt><dd>{delivery.method === "PICKUP" ? "Recogida" : "Envío"}</dd></div>
                  <div><dt className="font-medium">Cuándo</dt><dd>{delivery.when}</dd></div>
                  <div><dt className="font-medium">Lugar acordado</dt><dd>{delivery.place}</dd></div>
                  <div><dt className="font-medium">Costo de entrega</dt><dd>{copFormatter.format(delivery.costCOP)} COP</dd></div>
                  {totalWithDelivery !== null && (
                    <div><dt className="font-medium">Total estimado con entrega</dt><dd>$ {formatAgriculturalValue(totalWithDelivery)} COP</dd></div>
                  )}
                </dl>
              ) : <p className="mt-2 text-sm text-slate-700">Aún no se han registrado los datos de entrega.</p>}
              {delivery && confirmationAvailable && !receipt && (
                confirmed ? (
                  <p className="mt-3 text-sm font-semibold text-emerald-950">Datos confirmados por el comprador.</p>
                ) : producerView ? (
                  <p className="mt-3 text-sm text-slate-700">Pendiente de confirmación del comprador.</p>
                ) : (
                  <OrderDeliveryConfirmationForm delivery={delivery} />
                )
              )}
              {receipt ? (
                <>
                  <p className="mt-3 text-sm font-semibold text-emerald-950">Pedido recibido el {dateFormatter.format(receipt.receivedAt)}.</p>
                  {!producerView && (receipt.rating === null
                    ? <OrderRatingForm orderId={order.id} />
                    : <p className="mt-2 text-sm">Tu calificación: {receipt.rating} de 5.</p>)}
                </>
              ) : !producerView && delivery && confirmed && receiptAvailable ? (
                <OrderReceiptForm delivery={delivery} />
              ) : null}
            </section>
            {producerView && !receipt && !paymentReceipt && <OrderDeliveryForm orderId={order.id} delivery={delivery} />}
          </>
        )}
        {paymentReceipt ? (
          <section aria-label="Pago confirmado" className="mt-4 space-y-2 rounded-xl bg-emerald-50 p-4">
            <TrackingHeading className="font-semibold">Pago confirmado por el vendedor</TrackingHeading>
            <p>{paymentLabels[paymentReceipt.method as keyof typeof paymentLabels]} · $ {formatAgriculturalValue(String(paymentReceipt.amountCOP))} COP</p>
            <p className="text-sm text-slate-700">{dateFormatter.format(paymentReceipt.confirmedAt)}</p>
            {paymentEventsForOrder.map((event) => (
              <div className="border-t border-emerald-200 pt-2 text-sm text-slate-700" key={`${event.orderId}-${event.createdAt.toISOString()}`}>
                <p>Registro: {event.status === "CONFIRMED" ? "confirmado manualmente por el vendedor" : event.status}</p>
                <p>Proveedor: {event.provider === "WOMPI" ? "Wompi (confirmación manual)" : "Pago acordado directamente"}</p>
                {event.externalReference && <p>Referencia: {event.externalReference}</p>}
                <p>Fecha del registro: {dateFormatter.format(event.createdAt)}</p>
              </div>
            ))}
          </section>
        ) : paymentAvailable && delivery && confirmed && order.status === "ACCEPTED" && (
          <>
            {payment && phone && (
              <section className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4" aria-label="Forma de pago acordada">
                <TrackingHeading className="font-semibold">Forma de pago acordada</TrackingHeading>
                <p>{paymentLabels[payment.method as keyof typeof paymentLabels]}</p>
                {payment.method === "TRANSFER" && <p>Acuerda los datos de la transferencia con el vendedor por su teléfono de contacto.</p>}
                {payment.method === "ON_DELIVERY" && <p>Paga al vendedor al recibir o recoger el pedido.</p>}
                {!producerView && payment.wompiUrl && (
                  <a className="inline-flex min-h-11 items-center rounded-lg bg-emerald-800 px-3 font-semibold text-white" href={payment.wompiUrl} rel="noreferrer" target="_blank">
                    Pagar en Wompi
                  </a>
                )}
                <p className="text-sm text-slate-700">El vendedor recibe el pago. Para dudas sobre el cobro o devoluciones, contacta al vendedor por su teléfono de contacto. Agricultor no confirma el abono.</p>
                {paymentReceiptAvailable && (
                  <p className="text-sm font-semibold text-slate-700">Pendiente de confirmación del vendedor. Si ya pagaste, consulta al vendedor antes de pagar otra vez.</p>
                )}
                {producerView && paymentReceiptAvailable && totalWithDelivery !== null && (
                  <PaymentReceiptForm orderId={order.id} method={payment.method} wompiUrl={payment.wompiUrl} amountCOP={totalWithDelivery} />
                )}
              </section>
            )}
            {producerView && (phone || payment ? <ExternalPaymentForm delivery={delivery} payment={payment} /> : (
              <p className="mt-3 text-sm text-slate-700">Comparte tu teléfono de contacto para indicar la forma de pago.</p>
            ))}
          </>
        )}
        {contactsAvailable && order.status === "ACCEPTED" && (
          producerView ? <OrderSellerContactForm orderId={order.id} phoneShared={Boolean(phone)} /> : phone && (
            <div className="mt-4 flex flex-wrap gap-2">
              <a className="inline-flex min-h-12 items-center rounded-xl bg-emerald-800 px-4 font-semibold text-white hover:bg-emerald-900" href={`tel:+${phone}`}>
                Llamar al vendedor
              </a>
              <a
                className="inline-flex min-h-12 items-center rounded-xl border border-emerald-900 px-4 font-semibold text-emerald-950 hover:bg-emerald-50"
                href={`https://wa.me/${phone}?${new URLSearchParams({ text: `Hola, quiero coordinar la entrega de mi pedido de Agricultor. Referencia: ${order.id}` })}`}
                rel="noreferrer"
                target="_blank"
              >
                Escribir por WhatsApp
              </a>
            </div>
          )
        )}
        {producerView && order.status === "PENDING" && (
          <OrderDecisionForm orderId={order.id} />
        )}
        {!producerView && order.status === "ACCEPTED" && (
          <div className="mt-4">
            {currentOffer?.isPublished && currentOffer.availableQuantity.gt(0) ? (
              <Link
                className="inline-flex min-h-11 items-center rounded-xl border border-emerald-900 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-50"
                href={getPublicProductOrderHref(currentOffer.id)}
              >
                Volver a solicitar con el precio actual
              </Link>
            ) : (
              <>
                <p className="text-sm text-slate-700">La oferta original ya no está disponible.</p>
                <Link
                  className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline underline-offset-4"
                  href={getCatalogPageHref({ name: order.productName }, 1)}
                >
                  Buscar el producto en el catálogo
                </Link>
              </>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <nav
        aria-label="Navegación de pedidos"
        className="flex flex-wrap gap-x-5 gap-y-3"
      >
        <Link
          className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline underline-offset-4"
          href="/mi-cuenta"
        >
          Volver a mi cuenta
        </Link>
        <Link className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline underline-offset-4" href="/mi-cuenta/avisos">
          Avisos de pedidos
        </Link>
        {isBuyer && (
          <Link
            className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline underline-offset-4"
            href="/catalogo"
          >
            Explorar catálogo
          </Link>
        )}
        {isProducer && (
          <Link
            className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline underline-offset-4"
            href="/mi-cuenta/productos"
          >
            Gestionar productos
          </Link>
        )}
      </nav>
      <section className="mt-4 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Agricultor
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Mis pedidos</h1>
        <p className="mt-3 text-slate-700">
          Consulta el estado y la respuesta a cada solicitud. Las fechas y
          horas se muestran en hora de Colombia.
        </p>
      </section>
      {isBuyer && (
        <section
          aria-labelledby="buyer-orders-title"
          className="mt-6 scroll-mt-4 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm sm:p-8"
          id="solicitudes-enviadas"
          tabIndex={-1}
        >
          <h2 className="text-2xl font-semibold" id="buyer-orders-title">
            Solicitudes que enviaste
          </h2>
          {(buyerOrders.length > 0 || buyerStatus || buyerReference) && (
            <form action="/mi-cuenta/pedidos#solicitudes-enviadas" method="get" className="mt-4 flex flex-wrap items-end gap-3" key={buyerFilters.toString()}>
              {isProducer && producerStatus && <input type="hidden" name="respuesta" value={producerStatus} />}
              {isProducer && producerProduct && <input type="hidden" name="producto" value={producerProduct} />}
              <div className="w-full sm:w-auto">
                <label className="mb-2 block text-sm font-medium" htmlFor="referencia">
                  Referencia del pedido
                </label>
                <input
                  className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
                  defaultValue={buyerReference}
                  id="referencia"
                  maxLength={100}
                  name="referencia"
                  type="search"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="mb-2 block text-sm font-medium" htmlFor="estado">
                  Estado de la solicitud
                </label>
                <select
                  className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                  defaultValue={buyerStatus ?? ""}
                  id="estado"
                  name="estado"
                >
                  <option value="">Todos los estados</option>
                  {(Object.keys(statusLabels) as OrderStatus[]).map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </div>
              <button className="min-h-11 rounded-lg border border-emerald-900 px-4 font-semibold text-emerald-950 hover:bg-emerald-50" type="submit">
                Filtrar solicitudes
              </button>
              {buyerFilters.size > 0 && (
                <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href={resetBuyerHref}>
                  Limpiar filtros de enviadas
                </Link>
              )}
            </form>
          )}
          {buyerOrders.length === 0 && (buyerStatus || buyerReference) ? (
            <p className="mt-5 text-slate-700">
              {buyerReference ? "No encontramos solicitudes con esa referencia y los filtros actuales." : "No tienes solicitudes en este estado."}
            </p>
          ) : buyerOrders.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:p-5">
              <p className="text-slate-700">
                Aún no has solicitado productos. Explora el catálogo para
                encontrar una oferta y enviar una solicitud.
              </p>
              <Link
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 text-center font-semibold text-white hover:bg-emerald-900 sm:w-auto"
                href="/catalogo"
              >
                Explorar el catálogo
              </Link>
            </div>
          ) : (
            <ul className="mt-5 space-y-4">
              {buyerOrders.map((order) => orderCard(order, false))}
            </ul>
          )}
          {pageNavigation(
            buyerPagination,
            "compradorPagina",
            "solicitudes-enviadas",
            "Paginación de solicitudes enviadas",
          )}
        </section>
      )}
      {isProducer && (
        <section
          aria-labelledby="producer-orders-title"
          className="mt-6 scroll-mt-4 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm sm:p-8"
          id="pedidos-recibidos"
          tabIndex={-1}
        >
          <h2 className="text-2xl font-semibold" id="producer-orders-title">
            Solicitudes recibidas
          </h2>
          {producerTotal === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:p-5">
              <p className="text-slate-700">
                Aún no has recibido pedidos. Revisa tus productos publicados
                para que las personas puedan encontrarlos.
              </p>
              <Link
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-900 px-5 py-3 text-center font-semibold text-emerald-950 hover:bg-emerald-50 sm:w-auto"
                href="/mi-cuenta/productos"
              >
                Gestionar mis productos
              </Link>
            </div>
          ) : (
            <div className="mt-5 space-y-8">
              <section
                aria-labelledby="pending-producer-orders-title"
                className="scroll-mt-4"
                id="pedidos-por-responder"
                tabIndex={-1}
              >
                <h3 className="text-lg font-semibold" id="pending-producer-orders-title">
                  Por responder
                </h3>
                {pendingProducerOrders.length > 0 ? (
                  <ul className="mt-3 space-y-4">
                    {pendingProducerOrders.map((order) => orderCard(order, true))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">
                    No tienes solicitudes por responder.
                  </p>
                )}
                {pageNavigation(
                  pendingProducerPagination,
                  "productorPendientePagina",
                  "pedidos-por-responder",
                  "Paginación de solicitudes por responder",
                )}
              </section>
              {(answeredProducerTotal > 0 || hasAnsweredFilters) && (
                <section
                  aria-labelledby="answered-producer-orders-title"
                  className="scroll-mt-4"
                  id="pedidos-respondidos"
                  tabIndex={-1}
                >
                  <h3 className="text-lg font-semibold" id="answered-producer-orders-title">
                    Ya respondidas
                  </h3>
                  <Link className="mt-2 flex min-h-11 w-fit items-center font-semibold text-emerald-900 underline" href="/mi-cuenta/pedidos/despacho">
                    Ver cantidades para despacho
                  </Link>
                  {producerTotals.ACCEPTED > 0 && (
                    <a
                      className="mt-2 inline-flex min-h-11 items-center font-semibold text-emerald-900 underline underline-offset-4"
                      href="/mi-cuenta/pedidos/aceptados.csv"
                      download
                    >
                      Descargar todos los pedidos aceptados (CSV)
                    </a>
                  )}
                  {producerTotals.ACCEPTED > 0 && (
                    <form action="/mi-cuenta/pedidos/aceptados.csv" method="get" className="mt-2 rounded-lg border border-slate-200 p-3">
                      <fieldset>
                        <legend className="font-medium">Descargar por fecha de aceptación</legend>
                        <p className="mt-1 text-sm text-slate-700">Hora de Colombia. Puedes indicar una fecha inicial, final o ambas.</p>
                        <div className="mt-3 flex flex-wrap items-end gap-3">
                          <label className="block text-sm font-medium">
                            Desde
                            <input className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-3" name="desde" type="date" />
                          </label>
                          <label className="block text-sm font-medium">
                            Hasta
                            <input className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-3" name="hasta" type="date" />
                          </label>
                          <button className="min-h-11 rounded-lg border border-emerald-900 px-3 font-semibold text-emerald-950 hover:bg-emerald-50" type="submit">
                            Descargar por fechas (CSV)
                          </button>
                          <button
                            className="min-h-11 rounded-lg border border-emerald-900 px-3 font-semibold text-emerald-950 hover:bg-emerald-50"
                            name="formato"
                            type="submit"
                            value="consolidado"
                          >
                            Descargar cantidades para despacho (CSV)
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  )}
                  <form action="/mi-cuenta/pedidos#pedidos-respondidos" method="get" className="mt-3 flex flex-wrap items-end gap-2" key={producerFilters.toString()}>
                    {buyerStatus && <input type="hidden" name="estado" value={buyerStatus} />}
                    {buyerReference && <input type="hidden" name="referencia" value={buyerReference} />}
                    {producerStatus && <input type="hidden" name="respuesta" value={producerStatus} />}
                    <div className="w-full sm:w-auto">
                      <label className="mb-2 block text-sm font-medium" htmlFor="producto-respondido">
                        Nombre del producto o referencia del pedido
                      </label>
                      <input
                        className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
                        defaultValue={producerProduct}
                        id="producto-respondido"
                        maxLength={100}
                        name="producto"
                        type="search"
                      />
                    </div>
                    <button className="min-h-11 rounded-lg border border-emerald-900 px-3 font-semibold text-emerald-950 hover:bg-emerald-50" type="submit">
                      Buscar en respondidas
                    </button>
                    {producerFilters.size > 0 && (
                      <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href={resetProducerHref}>
                        Limpiar filtros de respondidas
                      </Link>
                    )}
                  </form>
                  <nav aria-label="Filtrar pedidos respondidos" className="mt-3 flex flex-wrap gap-2">
                    {[
                      { status: undefined, label: "Todas" },
                      { status: "ACCEPTED", label: "Aceptadas" },
                      { status: "REJECTED", label: "Rechazadas" },
                    ].map(({ status, label }) => {
                      const query = new URLSearchParams(buyerFilters);
                      if (status) query.set("respuesta", status);
                      if (producerProduct) query.set("producto", producerProduct);
                      const active = status === producerStatus;
                      return (
                        <Link
                          aria-current={active ? "true" : undefined}
                          className={`inline-flex min-h-11 items-center rounded-lg border border-emerald-900 px-3 font-semibold ${active ? "bg-emerald-800 text-white" : "text-emerald-950 hover:bg-emerald-50"}`}
                          href={`/mi-cuenta/pedidos${query.size ? `?${query}` : ""}#pedidos-respondidos`}
                          key={label}
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </nav>
                  {answeredProducerOrders.length > 0 ? (
                    <ul className="mt-3 space-y-4">
                      {answeredProducerOrders.map((order) => orderCard(order, true))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-700">
                      {producerProduct
                        ? "No encontramos solicitudes respondidas con esos filtros."
                        : "No tienes solicitudes con esta respuesta."}
                    </p>
                  )}
                  {pageNavigation(
                    answeredProducerPagination,
                    "productorRespondidoPagina",
                    "pedidos-respondidos",
                    "Paginación de solicitudes respondidas",
                  )}
                </section>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
