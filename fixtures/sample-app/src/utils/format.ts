export function formatMoney(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `$${dollars}.${String(rest).padStart(2, "0")}`;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
