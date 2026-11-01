export function bangkokToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function bangkokDayBounds(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = new Date(day + "T00:00:00+07:00");
  if (!Number.isFinite(start.getTime()) || new Date(start.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== day) return null;
  return { gte: start, lt: new Date(start.getTime() + 86400000) };
}
