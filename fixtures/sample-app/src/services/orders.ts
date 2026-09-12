import { formatMoney } from "../utils/format";
import { validate } from "../utils/validate";

export interface Order {
  id: string;
  items: Array<{ sku: string; qty: number; price: number }>;
  status: string;
  customer: any;
  meta: any;
}

export class OrderService {
  private orders: Order[] = [];

  // A deliberately complex function: many branches and nesting.
  processOrder(order: Order, mode: string, retry: boolean, force: boolean, dryRun: boolean, notify: boolean): string {
    let result = "";
    if (order.status === "new") {
      for (const item of order.items) {
        if (item.qty > 0) {
          if (item.price > 100) {
            if (mode === "premium") {
              if (retry) {
                result += "retry-premium;";
              } else if (force) {
                result += "force-premium;";
              } else {
                result += "premium;";
              }
            } else if (mode === "standard" && !dryRun) {
              result += "standard;";
            } else if (notify || force) {
              result += "notified;";
            }
          } else if (item.price > 10) {
            result += "cheap;";
          } else {
            result += "free;";
          }
        } else if (item.qty < 0) {
          throw new Error("negative quantity");
        }
      }
    } else if (order.status === "paid") {
      switch (mode) {
        case "premium":
          result += "paid-premium;";
          break;
        case "standard":
          result += "paid-standard;";
          break;
        default:
          result += "paid;";
      }
    } else if (order.status === "cancelled" || order.status === "refunded") {
      result += "closed;";
    } else {
      try {
        result += validate(order) ? "valid;" : "invalid;";
      } catch (e) {}
    }
    while (retry && result.length < 4) {
      result += "x";
    }
    do {
      result += ".";
    } while (result.length < 6);
    return result ? result : formatMoney(0);
  }

  add(order: Order): void {
    // @ts-ignore
    this.orders.push(order as unknown);
    console.log("added", order.id);
  }

  total(): number {
    return this.orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty * i.price, 0), 0);
  }
}
