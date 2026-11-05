/** Civil dates as YYYY-MM-DD. Day arithmetic uses the UTC calendar so DST cannot skip or repeat a date. */

export function parseISODate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!match) throw new Error(`Bad date: ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function formatISODate(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(iso, n) {
  const { y, m, d } = parseISODate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return formatISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(a, b) {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  const ua = Date.UTC(pa.y, pa.m - 1, pa.d);
  const ub = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ub - ua) / 86400000);
}

export function compareISO(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 0 Sunday … 6 Saturday. */
export function weekdayIndex(iso) {
  const { y, m, d } = parseISODate(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekStartDate(iso, weekStartsOn) {
  const day = weekdayIndex(iso);
  const offset = weekStartsOn === "sunday" ? day : (day + 6) % 7;
  return addDays(iso, -offset);
}

export function weekEndDate(weekStart) {
  return addDays(weekStart, 6);
}

export function weekDates(iso, weekStartsOn) {
  const start = weekStartDate(iso, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isSameWeek(a, b, weekStartsOn) {
  return weekStartDate(a, weekStartsOn) === weekStartDate(b, weekStartsOn);
}

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function weekDayLetters(weekStartsOn) {
  const start = weekStartsOn === "sunday" ? 0 : 1;
  return Array.from({ length: 7 }, (_, i) => LETTERS[(start + i) % 7]);
}

export function weekMeta(iso, weekStartsOn) {
  const start = weekStartDate(iso, weekStartsOn);
  const end = weekEndDate(start);
  const thursdayOffset = weekStartsOn === "sunday" ? 4 : 3;
  const thursday = addDays(start, thursdayOffset);
  const year = Number(thursday.slice(0, 4));
  const first = weekStartDate(`${year}-01-01`, weekStartsOn);
  const number = Math.floor(daysBetween(first, start) / 7) + 1;
  return {
    start,
    end,
    year,
    number,
    label: `WEEK ${String(number).padStart(2, "0")}`,
  };
}

export function localParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const minute = Number(map.minute);
  const second = Number(map.second);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute,
    second,
    isoDate: `${map.year}-${map.month}-${map.day}`,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function localDateISO(date, timeZone) {
  return localParts(date, timeZone).isoDate;
}

export function todayISO(timeZone, now = new Date()) {
  return localDateISO(now, timeZone);
}

/** Wall clock minus the UTC instant, in milliseconds. Positive east of Greenwich. */
export function offsetMs(date, timeZone) {
  const parts = localParts(date, timeZone);
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUTC - date.getTime();
}

export function offsetString(date, timeZone) {
  const mins = Math.round(offsetMs(date, timeZone) / 60000);
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * UTC instant whose wall clock in `timeZone` is `isoDate` at `hhmm`.
 * A second offset pass follows DST. In a fall-back overlap, the result is
 * the instant the correction settles on.
 */
export function zonedDateTimeToUtc(isoDate, hhmm, timeZone) {
  const { y, m, d } = parseISODate(isoDate);
  const bits = String(hhmm).split(":").map((n) => Number(n));
  const desired = Date.UTC(y, m - 1, d, bits[0] || 0, bits[1] || 0, bits[2] || 0);
  let utc = desired;
  for (let i = 0; i < 4; i += 1) {
    const next = desired - offsetMs(new Date(utc), timeZone);
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc);
}

export function captureStamp(date, timeZone) {
  const instant = date instanceof Date ? date : new Date(date);
  const parts = localParts(instant, timeZone);
  return {
    utc: instant.toISOString(),
    tz: timeZone,
    offset: offsetString(instant, timeZone),
    isoDate: parts.isoDate,
    hhmm: parts.hhmm,
  };
}

export function currentTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatPrettyDate(iso) {
  const { y, m, d } = parseISODate(iso);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatShortDate(iso) {
  const { y, m, d } = parseISODate(iso);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatRange(start, end) {
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

export function formatMonthYear(year, month) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function monthGrid(year, month, weekStartsOn) {
  const first = formatISODate(year, month, 1);
  const start = weekStartDate(first, weekStartsOn);
  const nextMonth = month === 12 ? formatISODate(year + 1, 1, 1) : formatISODate(year, month + 1, 1);
  const cells = [];
  let cursor = start;
  while (cells.length < 42 && (cursor < nextMonth || cells.length % 7 !== 0)) {
    const parts = parseISODate(cursor);
    cells.push({ date: cursor, inMonth: parts.m === month && parts.y === year });
    cursor = addDays(cursor, 1);
  }
  return cells;
}

export function shiftMonth(year, month, delta) {
  const dt = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1 };
}

export function enumerateDates(start, end) {
  const out = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}
