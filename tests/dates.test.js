import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  daysBetween,
  enumerateDates,
  monthGrid,
  offsetString,
  weekDates,
  weekDayLetters,
  weekMeta,
  weekStartDate,
  zonedDateTimeToUtc,
} from "../js/dates.js";

describe("week boundaries", () => {
  it("starts Monday weeks on Monday and runs seven days", () => {
    assert.equal(weekStartDate("2026-11-05", "monday"), "2026-11-02");
    assert.deepEqual(weekDates("2026-11-05", "monday"), [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    assert.equal(weekStartDate("2026-11-02", "monday"), "2026-11-02");
    assert.equal(weekStartDate("2026-11-08", "monday"), "2026-11-02");
    assert.equal(weekStartDate("2026-11-09", "monday"), "2026-11-09");
  });

  it("starts Sunday weeks on Sunday and stops before the next Sunday", () => {
    assert.equal(weekStartDate("2026-11-05", "sunday"), "2026-11-01");
    assert.deepEqual(weekDates("2026-11-05", "sunday"), [
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
    assert.equal(weekDates("2026-11-05", "sunday").includes("2026-11-08"), false);
    assert.equal(weekStartDate("2026-11-01", "sunday"), "2026-11-01");
  });

  it("keeps the year boundary in the week that contains 1 January", () => {
    assert.equal(weekStartDate("2026-01-01", "monday"), "2025-12-29");
    assert.equal(weekStartDate("2026-01-01", "sunday"), "2025-12-28");
    const monday = weekMeta("2026-01-01", "monday");
    const sunday = weekMeta("2026-01-01", "sunday");
    assert.equal(monday.number, 1);
    assert.equal(monday.year, 2026);
    assert.equal(sunday.number, 1);
    assert.equal(sunday.year, 2026);
    assert.equal(weekMeta("2026-11-05", "monday").label, weekMeta("2026-11-02", "monday").label);
    assert.equal(weekMeta("2026-11-09", "monday").number, weekMeta("2026-11-05", "monday").number + 1);
  });

  it("labels weekdays in series order", () => {
    assert.deepEqual(weekDayLetters("monday"), ["M", "T", "W", "T", "F", "S", "S"]);
    assert.deepEqual(weekDayLetters("sunday"), ["S", "M", "T", "W", "T", "F", "S"]);
  });

  it("builds a full month grid for both week starts", () => {
    const monday = monthGrid(2026, 11, "monday");
    assert.equal(monday[0].date, "2026-10-26");
    assert.equal(monday.at(-1).date, "2026-12-06");
    assert.equal(monday.filter((cell) => cell.inMonth).length, 30);
    assert.equal(monday.length % 7, 0);

    const sunday = monthGrid(2026, 11, "sunday");
    assert.equal(sunday[0].date, "2026-11-01");
    assert.equal(sunday.at(-1).date, "2026-12-05");
    assert.equal(sunday.filter((cell) => cell.inMonth).length, 30);
  });

  it("counts civil days across a DST boundary as one date each", () => {
    assert.equal(daysBetween("2026-10-03", "2026-10-05"), 2);
    assert.deepEqual(enumerateDates("2026-10-03", "2026-10-05"), ["2026-10-03", "2026-10-04", "2026-10-05"]);
    assert.equal(addDays("2026-04-04", 1), "2026-04-05");
  });

  it("converts Melbourne wall time and reports the real offset", () => {
    const before = zonedDateTimeToUtc("2026-10-04", "01:30", "Australia/Melbourne");
    const after = zonedDateTimeToUtc("2026-10-04", "03:30", "Australia/Melbourne");
    assert.equal(offsetString(before, "Australia/Melbourne"), "+10:00");
    assert.equal(offsetString(after, "Australia/Melbourne"), "+11:00");
    assert.equal(after.getTime() - before.getTime(), 60 * 60 * 1000);
  });
});
