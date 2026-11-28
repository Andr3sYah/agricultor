export const ORDER_LIST_PAGE_SIZE = 12;

export function parseOrderPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) {
    return 1;
  }

  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function getOrderPagination(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / ORDER_LIST_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  return {
    page,
    pageCount,
    skip: (page - 1) * ORDER_LIST_PAGE_SIZE,
    take: ORDER_LIST_PAGE_SIZE,
  };
}
