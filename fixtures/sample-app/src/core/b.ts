import { helperFromA } from "./a";

export function helperFromB(): string {
  return "b";
}

export function roundTrip(): string {
  return helperFromA();
}
