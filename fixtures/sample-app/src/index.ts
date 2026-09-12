import { createServer } from "./core/server";
import { OrderService } from "./services/orders";
import { formatMoney } from "@/utils/format";

const service = new OrderService();
createServer(service);
console.log(formatMoney(1200));
