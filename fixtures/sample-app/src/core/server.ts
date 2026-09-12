import type { OrderService } from "../services/orders";
import { helperFromB } from "./b";

export function createServer(service: OrderService) {
  return { service, helper: helperFromB() };
}

export function unusedServerHelper(): number {
  return 42;
}
