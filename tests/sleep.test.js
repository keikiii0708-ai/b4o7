import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, enumerateDates, offsetString, zonedDateTimeToUtc } from "../js/dates.js";
import {
  attributeWakeDate,
  bedtimePasses,
  defaultSleepTargets,
  evaluateSleep,
  expectedWakeDate,
  formatDuration,
  sleepCalendarMark,
  submissionCheck,
} from "../js/sleep.js";

const ZONE = "Australia/Melbourne";

function utc(iso, hhmm, zone = ZONE) {
  return zonedDateTimeToUtc(iso, hhmm, zone).toISOString();
}

function session({ bedDate, bedTime, wakeDate, wakeTime, targets = defaultSleepTargets(), bedZone = ZONE, wakeZone = ZONE }) {
  const wakeUtc = wakeDate ? utc(wakeDate, wakeTime, wakeZone) : null;
  return {
    bedtimeUtc: bedDate ? utc(bedDate, bedTime, bedZone) : null,
    bedtimeTz: bedZone,
    bedtimeOffset: bedDate ? offsetString(new Date(utc(bedDate, bedTime, bedZone)), bedZone) : null,
    wakeUtc,
    wakeTz: wakeDate ? wakeZone : null,
    wakeOffset: wakeUtc ? offsetString(new Date(wakeUtc), wakeZone) : null,
    wakeDate: wakeDate || null,
    targets,
  };
}

describe("sleep evaluation", () => {
  it("accepts an after-midnight bedtime before a 01:00 deadline", () => {
    const wakeDate = "2026-11-05";
    assert.equal(bedtimePasses({ bedtimeUtc: utc("2026-11-05", "00:42"), wakeDate, latestBedtime: "01:00", zone: ZONE }), true);
    assert.equal(bedtimePasses({ bedtimeUtc: utc("2026-11-05", "01:00"), wakeDate, latestBedtime: "01:00", zone: ZONE }), true);
    assert.equal(bedtimePasses({ bedtimeUtc: utc("2026-11-05", "01:01"), wakeDate, latestBedtime: "01:00", zone: ZONE }), false);
    assert.equal(bedtimePasses({ bedtimeUtc: utc("2026-11-04", "22:30"), wakeDate, latestBedtime: "01:00", zone: ZONE }), true);
    assert.equal(bedtimePasses({ bedtimeUtc: utc("2026-11-04", "23:00"), wakeDate, latestBedtime: "23:00", zone: ZONE }), true);
    assert.equal(bedtimePasses({ bedtimeUtc: utc("2026-11-04", "23:30"), wakeDate, latestBedtime: "23:00", zone: ZONE }), false);
    assert.equal(bedtimePasses({ bedtimeUtc: utc("2026-11-05", "00:30"), wakeDate, latestBedtime: "23:00", zone: ZONE }), false);
  });

  it("records 7h 53m from the timestamps and wins only when every enabled check passes", () => {
    const record = session({ bedDate: "2026-11-04", bedTime: "23:11", wakeDate: "2026-11-05", wakeTime: "07:04" });
    const result = evaluateSleep(record);
    assert.equal(result.durationLabel, "7h 53m");
    assert.equal(formatDuration(result.durationMs).label, "7h 53m");
    assert.equal(result.win, true);
    assert.deepEqual(result.checks.map((check) => check.passed), [true, true, true]);

    const short = evaluateSleep(session({ bedDate: "2026-11-05", bedTime: "00:42", wakeDate: "2026-11-05", wakeTime: "07:20" }));
    assert.equal(short.durationLabel, "6h 38m");
    assert.equal(short.win, false);
    assert.equal(short.checks.find((check) => check.id === "bedtime").passed, true);
    assert.equal(short.checks.find((check) => check.id === "wake").passed, true);
    assert.equal(short.checks.find((check) => check.id === "duration").passed, false);

    const lateWake = evaluateSleep(session({ bedDate: "2026-11-04", bedTime: "23:00", wakeDate: "2026-11-05", wakeTime: "09:31" }));
    assert.equal(lateWake.checks.find((check) => check.id === "wake").passed, false);
    assert.equal(lateWake.win, false);

    const exact = evaluateSleep(session({ bedDate: "2026-11-05", bedTime: "00:00", wakeDate: "2026-11-05", wakeTime: "07:00" }));
    assert.equal(exact.checks.find((check) => check.id === "duration").passed, true);
    assert.equal(exact.win, true);
  });

  it("ignores disabled checks and uses the targets stored on the record", () => {
    const targets = {
      ...defaultSleepTargets(),
      latestBedtimeEnabled: false,
      latestWakeEnabled: false,
      minDurationEnabled: false,
    };
    const result = evaluateSleep(session({
      bedDate: "2026-11-05",
      bedTime: "03:00",
      wakeDate: "2026-11-05",
      wakeTime: "05:00",
      targets,
    }));
    assert.equal(result.checks.length, 0);
    assert.equal(result.win, true);
    assert.equal(result.durationLabel, "2h 0m");
  });

  it("does not invent a duration for an incomplete session", () => {
    const open = evaluateSleep({
      bedtimeUtc: utc("2026-11-04", "23:40"),
      bedtimeTz: ZONE,
      wakeUtc: null,
      targets: defaultSleepTargets(),
    });
    assert.equal(open.complete, false);
    assert.equal(open.durationMs, null);
    assert.equal(open.durationLabel, null);
    assert.equal(open.win, false);
    const backwards = evaluateSleep(session({ bedDate: "2026-11-05", bedTime: "09:00", wakeDate: "2026-11-05", wakeTime: "07:00" }));
    assert.equal(backwards.invalidOrder, true);
    assert.equal(backwards.durationLabel, null);
    assert.equal(backwards.win, false);
  });

  it("attributes the session to the wake-up date in the stored timezone", () => {
    const wake = utc("2026-11-05", "07:30");
    assert.equal(attributeWakeDate(wake, ZONE), "2026-11-05");
    assert.equal(attributeWakeDate(wake, "UTC"), "2026-11-04");
    assert.equal(attributeWakeDate(utc("2026-11-05", "00:30"), ZONE), "2026-11-05");
    assert.equal(expectedWakeDate(utc("2026-11-04", "23:10"), ZONE), "2026-11-05");
    assert.equal(expectedWakeDate(utc("2026-11-05", "00:42"), ZONE), "2026-11-05");
  });
});

describe("Melbourne daylight saving", () => {
  it("springs forward on the first Sunday of October and shortens the night", () => {
    assert.equal(new Date(Date.UTC(2026, 9, 4)).getUTCDay(), 0);
    const before = zonedDateTimeToUtc("2026-10-04", "01:30", ZONE);
    const after = zonedDateTimeToUtc("2026-10-04", "03:30", ZONE);
    assert.equal(offsetString(before, ZONE), "+10:00");
    assert.equal(offsetString(after, ZONE), "+11:00");
    assert.equal(after.getTime() - before.getTime(), 60 * 60 * 1000);

    const result = evaluateSleep(session({
      bedDate: "2026-10-03",
      bedTime: "23:30",
      wakeDate: "2026-10-04",
      wakeTime: "07:30",
    }));
    assert.equal(result.wakeDate, "2026-10-04");
    assert.equal(result.durationLabel, "7h 0m");
    assert.equal(result.win, true);
    assert.notEqual(result.durationLabel, "8h 0m");
  });

  it("falls back on the first Sunday of April and lengthens the night", () => {
    assert.equal(new Date(Date.UTC(2026, 3, 5)).getUTCDay(), 0);
    const before = zonedDateTimeToUtc("2026-04-05", "01:30", ZONE);
    const after = zonedDateTimeToUtc("2026-04-05", "03:30", ZONE);
    assert.equal(offsetString(before, ZONE), "+11:00");
    assert.equal(offsetString(after, ZONE), "+10:00");
    assert.equal(after.getTime() - before.getTime(), 3 * 60 * 60 * 1000);

    const result = evaluateSleep(session({
      bedDate: "2026-04-04",
      bedTime: "23:30",
      wakeDate: "2026-04-05",
      wakeTime: "07:30",
    }));
    assert.equal(result.durationLabel, "9h 0m");
    assert.equal(result.win, true);
    assert.notEqual(result.durationLabel, "8h 0m");
  });

  it("does not skip or duplicate civil wake dates across either transition", () => {
    for (const [start, end] of [["2026-04-01", "2026-04-07"], ["2026-10-01", "2026-10-07"]]) {
      const attributed = enumerateDates(start, end).map((date) => (
        attributeWakeDate(utc(date, "07:30"), ZONE)
      ));
      assert.deepEqual(attributed, enumerateDates(start, end));
      assert.equal(new Set(attributed).size, attributed.length);
      assert.equal(addDays(start, 6), end);
    }
  });

  it("keeps a Melbourne wake date when the same instant is another day in UTC", () => {
    const records = [
      { id: "a", wakeDate: attributeWakeDate(utc("2026-10-04", "07:30"), ZONE), bedtimeUtc: utc("2026-10-03", "23:00"), wakeUtc: utc("2026-10-04", "07:30") },
      { id: "b", wakeDate: attributeWakeDate(utc("2026-10-05", "07:30"), ZONE), bedtimeUtc: utc("2026-10-04", "23:00"), wakeUtc: utc("2026-10-05", "07:30") },
    ];
    assert.deepEqual(records.map((record) => record.wakeDate), ["2026-10-04", "2026-10-05"]);
    assert.equal(submissionCheck(records, "manual", { wakeDate: "2026-10-04" }).ok, false);
    assert.equal(submissionCheck(records, "manual", { wakeDate: "2026-10-06" }).ok, true);
  });
});

describe("duplicate sleep submissions", () => {
  const records = [
    { id: "done", wakeDate: "2026-11-04", bedtimeUtc: "2026-11-03T12:00:00.000Z", wakeUtc: "2026-11-03T20:00:00.000Z" },
    { id: "open", bedtimeUtc: "2026-11-04T12:00:00.000Z", wakeUtc: null, wakeDate: null },
  ];

  it("blocks a second bedtime while a session is open", () => {
    const check = submissionCheck(records, "bedtime");
    assert.equal(check.ok, false);
    assert.equal(check.reason, "open");
    assert.equal(check.existing.id, "open");
  });

  it("blocks a wake that would collide with a recorded morning", () => {
    const check = submissionCheck(records, "wake", { wakeDate: "2026-11-04", recordId: "open" });
    assert.equal(check.ok, false);
    assert.equal(check.reason, "wake-date");
    assert.equal(check.existing.id, "done");
  });

  it("allows the open session to close on a free morning", () => {
    const check = submissionCheck(records, "wake", { wakeDate: "2026-11-05", recordId: "open" });
    assert.equal(check.ok, true);
    assert.equal(check.existing.id, "open");
  });

  it("blocks a manual entry on top of an open session or a taken wake date", () => {
    assert.equal(submissionCheck(records, "manual", { wakeDate: "2026-11-05" }).reason, "open");
    assert.equal(submissionCheck([{ id: "done", wakeDate: "2026-11-05", bedtimeUtc: "x", wakeUtc: "y" }], "manual", { wakeDate: "2026-11-05" }).reason, "wake-date");
    assert.equal(submissionCheck(records, "manual", { wakeDate: "2026-11-05", recordId: "open" }).ok, true);
  });
});

describe("sleep calendar marks", () => {
  it("separates wins, losses, incomplete nights, and empty days", () => {
    assert.equal(sleepCalendarMark({ evaluation: { complete: true, win: true }, record: { wakeUtc: "x" } }, "2026-11-03", "2026-11-05"), "win");
    assert.equal(sleepCalendarMark({ evaluation: { complete: true, win: false }, record: { wakeUtc: "x" } }, "2026-11-03", "2026-11-05"), "loss");
    assert.equal(sleepCalendarMark({ open: true, record: { bedtimeUtc: "x", wakeUtc: null } }, "2026-11-04", "2026-11-05"), "incomplete");
    assert.equal(sleepCalendarMark({ record: null, evaluation: null }, "2026-11-05", "2026-11-05"), "pending");
    assert.equal(sleepCalendarMark({ record: null, evaluation: null }, "2026-11-01", "2026-11-05"), "none");
  });
});
