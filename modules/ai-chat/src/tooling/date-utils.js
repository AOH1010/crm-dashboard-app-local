const DEFAULT_TIMEZONE = process.env.CRM_TIMEZONE || "Asia/Bangkok";

export function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function compareDateKeys(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

export function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateKey, amount) {
  const date = typeof dateKey === "string" ? parseDateKey(dateKey) : new Date(dateKey.getTime());
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateKey(date);
}

export function startOfMonthKey(dateKey) {
  return `${String(dateKey).slice(0, 7)}-01`;
}

export function endOfMonthKey(dateKey) {
  const [year, month] = String(dateKey).slice(0, 7).split("-").map((part) => Number.parseInt(part, 10));
  const nextMonth = month === 12 ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, month, 1));
  nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);
  return formatDateKey(nextMonth);
}

export function monthKey(dateKey) {
  return String(dateKey).slice(0, 7);
}

export function addMonthsToMonthKey(monthValue, amount) {
  const [year, month] = String(monthValue).split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getSystemTodayDateKey(timeZone = DEFAULT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatMonthLabel(monthValue) {
  const [year, month] = String(monthValue).split("-");
  return `${month}/${year}`;
}

export function resolveFilterPeriod(selectedFilters, fallbackFrom, fallbackTo) {
  const from = isValidDateKey(selectedFilters?.from) ? selectedFilters.from : fallbackFrom;
  const to = isValidDateKey(selectedFilters?.to) ? selectedFilters.to : fallbackTo;
  if (compareDateKeys(from, to) <= 0) {
    return { from, to };
  }
  return { from: to, to: from };
}
