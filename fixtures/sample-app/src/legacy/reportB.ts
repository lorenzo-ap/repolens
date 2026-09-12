export function buildReportB(rows: Array<{ name: string; value: number }>): string {
  const header = ["name", "value"].join(",");
  const lines = rows.map((row) => [row.name, String(row.value)].join(","));
  const footer = `total,${rows.reduce((sum, row) => sum + row.value, 0)}`;
  const body = lines.join("\n");
  const output = [header, body, footer].join("\n");
  const trimmed = output.trim();
  return trimmed.toUpperCase();
}
