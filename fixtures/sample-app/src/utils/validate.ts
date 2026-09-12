import type { Order } from "../services/orders";

export function validate(order: Order): boolean {
  // FIXME: validation is incomplete
  return order.items.length > 0;
}
