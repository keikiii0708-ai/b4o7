import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { backupToRows, buildBackup, buildCsv, validateBackup } from "../js/backup.js";
import { DB_VERSION, STORE_NAMES, upgradeDatabase } from "../js/db.js";
import { setLocale, t } from "../js/i18n.js";
import { CHECK_MS } from "../js/motion.js";
import {
  countdownFor,
  countdownPhrase,
  groupNotes,
  nearestUpcoming,
  normalizeNote,
  prepareNote,
} from "../js/notes.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const today = "2026-11-09";
const now = "2026-11-09T12:00:00.000Z";

function stamp() {
  return { now, today, newId: () => "fresh" };
}

function fakeDatabase(existing) {
  const names = new Set(existing);
  const db = {
    created: [],
    indexed: [],
    objectStoreNames: { contains: (name) => names.has(name) },
    createObjectStore(name) {
      names.add(name);
      db.created.push(name);
      return {
        createIndex(indexName) {
          db.indexed.push(`${name}:${indexName}`);
        },
      };
    },
  };
  return db;
}

describe("countdown", () => {
  it("counts the internship date as 17 days left, today, and days since", () => {
    assert.deepEqual(countdownFor("2026-11-26", today), { days: 17, phase: "upcoming" });
    assert.deepEqual(countdownFor(today, today), { days: 0, phase: "today" });
    assert.deepEqual(countdownFor("2026-11-01", today), { days: 8, phase: "past" });
    assert.equal(countdownFor("26 Nov 2026", today), null);
    assert.equal(countdownFor("", today), null);

    setLocale("en");
    assert.equal(countdownPhrase(countdownFor("2026-11-26", today)), "17 days left");
    assert.equal(t("notes.daysLeft", { count: 1 }), "1 day left");
    assert.equal(countdownPhrase(countdownFor(today, today)), "Today");
    assert.equal(countdownPhrase(countdownFor("2026-11-01", today)), "8 days ago");
    assert.equal(t("notes.daysAgo", { count: 1 }), "1 day ago");

    setLocale("zh");
    assert.equal(countdownPhrase(countdownFor("2026-11-26", today)), "还有 17 天");
    assert.equal(countdownPhrase(countdownFor(today, today)), "就是今天");
    assert.equal(countdownPhrase(countdownFor("2026-11-01", today)), "已经 8 天");
    setLocale("en");
  });
});

describe("note list order", () => {
  it("keeps countdowns ahead of plain notes and does not mix them into the day groups", () => {
    const notes = [
      {
        id: "plain",
        title: "Odds and ends",
        body: "Milk",
        countdownDate: null,
        createdOn: today,
        updatedAt: "2026-11-09T01:00:00.000Z",
        items: [],
      },
      {
        id: "later",
        title: "Later",
        body: "",
        countdownDate: "2026-11-30",
        createdOn: "2026-11-01",
        updatedAt: "2026-11-09T08:00:00.000Z",
        items: [],
      },
      {
        id: "intern",
        title: "Internship",
        body: "Pack up the desk",
        countdownDate: "2026-11-26",
        createdOn: "2026-11-01",
        updatedAt: "2026-11-08T00:00:00.000Z",
        items: [{ id: "a", text: "Badge", checked: true }],
      },
      {
        id: "old",
        title: "Past",
        body: "",
        countdownDate: "2026-11-01",
        createdOn: "2026-10-01",
        updatedAt: "2026-11-02T00:00:00.000Z",
        items: [],
      },
    ];
    const grouped = groupNotes(notes, today);
    assert.deepEqual(grouped.upcoming.map((item) => item.note.id), ["intern", "later"]);
    assert.equal(grouped.upcoming[0].count.days, 17);
    assert.deepEqual(grouped.past.map((item) => item.note.id), ["old"]);
    assert.equal(grouped.past[0].count.days, 8);
    assert.equal(grouped.days.length, 1);
    assert.equal(grouped.days[0].date, today);
    assert.equal(grouped.days[0].notes[0].id, "plain");
    assert.equal(nearestUpcoming(notes, today).note.id, "intern");
    assert.equal(nearestUpcoming([{ id: "old", countdownDate: "2026-11-01", updatedAt: now }], today), null);
  });
});

describe("saving a note", () => {
  it("keeps checklist ticks, drops blank lines, and can turn the countdown off without deleting the note", () => {
    const saved = prepareNote({
      title: "  Internship ",
      body: " Pack up the desk \n",
      countdownOn: true,
      countdownDate: "2026-11-26",
      items: [
        { id: "a", text: " Return the badge ", checked: true },
        { id: "a", text: "Send the notes", checked: false },
        { id: "b", text: "   ", checked: true },
      ],
    }, null, stamp());
    assert.equal(saved.ok, true);
    assert.equal(saved.note.title, "Internship");
    assert.equal(saved.note.body, "Pack up the desk");
    assert.equal(saved.note.countdownDate, "2026-11-26");
    assert.equal(saved.note.createdOn, today);
    assert.deepEqual(saved.note.items, [
      { id: "a", text: "Return the badge", checked: true },
      { id: "fresh", text: "Send the notes", checked: false },
    ]);

    const kept = prepareNote({
      title: saved.note.title,
      body: saved.note.body,
      countdownOn: false,
      countdownDate: "2026-11-26",
      items: saved.note.items,
    }, saved.note, stamp());
    assert.equal(kept.ok, true);
    assert.equal(kept.note.countdownDate, null);
    assert.equal(kept.note.title, "Internship");
    assert.equal(kept.note.items[0].checked, true);
    assert.equal(kept.note.createdAt, now);

    assert.equal(prepareNote({ title: " ", body: "", items: [] }, null, stamp()).reason, "empty");
    assert.equal(prepareNote({
      title: "Internship",
      countdownOn: true,
      countdownDate: "",
      items: [],
    }, null, stamp()).reason, "date");
  });
});

describe("backup and schema", () => {
  it("adds the notes store without touching stores that already exist", () => {
    assert.equal(DB_VERSION, 2);
    assert.ok(STORE_NAMES.includes("journal"));
    assert.ok(STORE_NAMES.includes("notes"));
    const fresh = fakeDatabase([]);
    upgradeDatabase(fresh);
    assert.deepEqual(fresh.created, [...STORE_NAMES]);
    assert.ok(fresh.indexed.includes("dailyRecords:goalId"));

    const existing = fakeDatabase(STORE_NAMES.filter((name) => name !== "notes"));
    upgradeDatabase(existing);
    assert.deepEqual(existing.created, ["notes"]);
    assert.deepEqual(existing.indexed, []);
    assert.equal(existing.objectStoreNames.contains("journal"), true);
    assert.equal(existing.objectStoreNames.contains("goals"), true);

    const again = fakeDatabase([...STORE_NAMES]);
    upgradeDatabase(again);
    assert.deepEqual(again.created, []);
  });

  it("round-trips checklist state and still accepts a backup from before notes existed", async () => {
    const note = {
      id: "n1",
      title: "Internship",
      body: "Pack up the desk",
      countdownDate: "2026-11-26",
      createdAt: now,
      createdOn: today,
      updatedAt: now,
      items: [
        { id: "a", text: "Return the badge", checked: true },
        { id: "b", text: "Last lunch", checked: false },
      ],
    };
    const payload = await buildBackup({
      settings: { id: "app" },
      goals: [],
      dailyRecords: [],
      sleepRecords: [],
      milestones: [],
      journal: [],
      weeklyReviews: [],
      weekSnapshots: [],
      rewardClaims: [],
      images: [],
      notes: [note],
    });
    assert.equal(payload.version, 2);
    assert.equal(payload.notes[0].items[0].checked, true);
    assert.equal(validateBackup(payload), "");

    const rows = backupToRows(payload);
    assert.equal(rows.notes[0].items[0].checked, true);
    assert.equal(rows.notes[0].items[1].checked, false);
    assert.equal(rows.notes[0].countdownDate, "2026-11-26");

    const legacy = { app: "B4O7", version: 1, goals: [], journal: [{ id: "2026-11-09", date: "2026-11-09", body: "Today" }] };
    assert.equal(validateBackup(legacy), "");
    assert.deepEqual(backupToRows(legacy).notes, []);

    assert.match(validateBackup({ app: "B4O7", version: 2, notes: {} }), /notes/);
    assert.match(validateBackup({ app: "B4O7", version: 2, notes: [{ id: "n1", countdownDate: "Nov 26" }] }), /date|日期/);
    assert.match(validateBackup({
      app: "B4O7",
      version: 2,
      notes: [{ id: "n1", items: [{ text: "Badge" }] }],
    }), /id|编号/);

    const csv = buildCsv({
      goals: [],
      sleepRecords: [],
      journal: [{ id: today, date: today, body: "Kept the evening", mood: "Focused" }],
      weeklyReviews: [],
      rewardClaims: [],
      notes: [note],
    }, today);
    assert.match(csv, /journal,2026-11-09/);
    assert.match(csv, /note,2026-11-26,Internship,countdown,2026-11-26/);
    assert.match(csv, /\[x\] Return the badge/);
    assert.match(csv, /\[ \] Last lunch/);
    assert.equal(normalizeNote({ id: "n1", countdownDate: "bad", items: [{ id: "a", text: "Badge", checked: 1 }] }).countdownDate, null);
    assert.equal(normalizeNote({ id: "n1", items: [{ id: "a", text: "Badge", checked: 1 }] }).items[0].checked, true);
  });
});

describe("checklist motion", () => {
  it("reuses the existing check stroke and only arms it when a line is ticked", () => {
    assert.equal(CHECK_MS, 200);
    const view = readFileSync(`${root}/js/views/notes.js`, "utf8");
    assert.match(view, /import \{ armCheck \} from "\.\.\/motion\.js"/);
    assert.match(view, /import \{ checkHost, field, h, icon, topbar \} from "\.\.\/ui\.js"/);
    assert.match(view, /if \(!item\.checked\) armCheck\(key\)/);
    assert.equal([...view.matchAll(/armCheck\(key\)/g)].length, 2);
    assert.match(view, /checkHost\(key, item\.checked\)/);
    const sw = readFileSync(`${root}/sw.js`, "utf8");
    assert.match(sw, /const CACHE = "b4o7-v7"/);
    assert.match(sw, /"\.\/js\/notes\.js"/);
    assert.match(sw, /"\.\/js\/views\/notes\.js"/);
  });
});
