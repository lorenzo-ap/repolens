import { helperFromB } from "./b";

export function helperFromA(): string {
  return `a:${helperFromB()}`;
}
