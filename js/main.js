import { localParts } from "./dates.js";
import { applyDocumentLocale, onLocaleChange, t } from "./i18n.js";
import { dueReminder, markReminderSeen, reminderSeen } from "./reminders.js";
import {
  cancelTimer,
  claimMilestone,
  claimReward,
  deleteAllData,
  deleteGoal,
  deleteJournal,
  deleteNote,
  deleteSleep,
  exportBackup,
  exportCsv,
  getState,
  importBackup,
  init,
  loadDemo,
  logThreshold,
  removeDemo,
  requestPersist as askPersist,
  saveGoal,
  saveImage,
  saveJournal,
  saveNote,
  saveReview,
  saveSleepManual,
  setDayExplicit,
  setGoalMode,
  sleepBed,
  sleepWake,
  snoozeBackup,
  startTimer,
  subscribe,
  sync,
  today,
  toggleNoteItem,
  updateSettings,
  zone,
} from "./store.js";
import { installMotion, syncMotion } from "./motion.js";
import { formatClock, h, icon, renderModal, showToast } from "./ui.js";
import { renderGoals } from "./views/goals.js";
import { renderHistory } from "./views/history.js";
import { renderHome } from "./views/home.js";
import { renderRewards } from "./views/rewards.js";
import { renderNotes } from "./views/notes.js";
import { renderSettings } from "./views/settings.js";
import { renderSleep } from "./views/sleep.js";

const memory = {
  sleepMonth: null,
  historyMonth: null,
  journalEditing: false,
  journalDraft: null,
  noteDraft: null,
  dayNote: null,
  reviewDraft: null,
};
let route = parseRoute(location.hash);
let modal = null;
let reminder = null;
let updateReady = false;
let persistInfo = { supported: false, persisted: false };
let pendingPaint = false;
let booted = false;

const actions = {
  saveGoal,
  setGoalMode,
  deleteGoal,
  setDayExplicit,
  startTimer,
  cancelTimer,
  logThreshold,
  sleepBed,
  sleepWake,
  saveSleepManual,
  deleteSleep,
  saveJournal,
  deleteJournal,
  deleteNote,
  saveNote,
  saveReview,
  toggleNoteItem,
  claimReward,
  claimMilestone,
  updateSettings,
  snoozeBackup,
  saveImage,
  exportBackup,
  exportCsv,
  importBackup,
  deleteAllData,
  loadDemo,
  removeDemo,
  sync,
  requestPersist: async () => {
    persistInfo = await askPersist();
    showToast(persistInfo.persisted ? t("toast.persistOn") : t("toast.persistOff"));
    paint();
  },
};

function parseRoute(hash) {
  const parts = (hash || "").replace(/^#/, "").split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (!a || a === "home") return { name: "home" };
  if (a === "goals" && b === "new") return { name: "goal-edit", id: null };
  if (a === "goals" && c === "edit") return { name: "goal-edit", id: b };
  if (a === "goals" && b) return { name: "goal", id: b };
  if (a === "goals") return { name: "goals" };
  if (a === "sleep" && b) return { name: "sleep-day", date: decodeURIComponent(b) };
  if (a === "sleep") return { name: "sleep" };
  if (a === "rewards") return { name: "rewards" };
  if (a === "history" && b === "day" && c) return { name: "day", date: c };
  if (a === "history" && b === "review" && c) return { name: "review", weekStart: c };
  if (a === "history" && b) return { name: "history", goalId: decodeURIComponent(b) };
  if (a === "history") return { name: "history", goalId: null };
  if (a === "settings") return { name: "settings" };
  if (a === "notes" && b === "new") return { name: "note-edit", id: null };
  if (a === "notes" && c === "edit") return { name: "note-edit", id: decodeURIComponent(b) };
  if (a === "notes" && b) return { name: "note", id: decodeURIComponent(b) };
  if (a === "notes") return { name: "notes" };
  return { name: "home" };
}

function go(path) {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (location.hash === next) {
    route = parseRoute(next);
    paint();
    return;
  }
  location.hash = next;
}

function context() {
  return {
    state: getState(),
    today: today(),
    zone: zone(),
    now: Date.now(),
    route,
    memory,
    go,
    draw: paint,
    actions,
    reminder,
    dismissReminder: () => {
      reminder = null;
      paint();
    },
    persistInfo,
    confirm: (config) => {
      modal = config;
      paint();
    },
    closeModal: () => {
      modal = null;
      paint();
    },
    toast: showToast,
    pickJson: (onData) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          onData(JSON.parse(await file.text()));
        } catch {
          showToast(t("error.file"));
        }
      });
      input.click();
    },
  };
}

function paint() {
  const state = getState();
  const app = document.querySelector("#app");
  if (!state) return;
  document.title = titleFor(route.name);
  const ctx = context();
  let view;
  try {
    if (route.name === "home") view = renderHome(ctx);
    else if (route.name === "goals" || route.name === "goal" || route.name === "goal-edit") view = renderGoals(ctx);
    else if (route.name === "sleep" || route.name === "sleep-day") view = renderSleep(ctx);
    else if (route.name === "rewards") view = renderRewards(ctx);
    else if (route.name === "history" || route.name === "day" || route.name === "review") view = renderHistory(ctx);
    else if (route.name === "notes" || route.name === "note" || route.name === "note-edit") view = renderNotes(ctx);
    else view = renderSettings(ctx);
  } catch (error) {
    console.error(error);
    view = h("p", { class: "error", text: t("error.screen") });
  }
  const shell = h("div", { class: "app" }, [
    h("main", { class: "main", "data-view": route.name }, [view]),
    tabbar(),
    updateReady ? h("div", { class: "update-bar banner spread" }, [
      h("span", { text: t("update.ready") }),
      h("button", { class: "btn primary small", onClick: reloadApp }, t("action.reload")),
    ]) : null,
    modal ? renderModal(modal, () => { modal = null; paint(); }) : null,
  ]);
  const sameRoute = paint.routeKey === location.hash;
  const saved = sameRoute ? captureView(app) : null;
  app.replaceChildren(shell);
  const sheetOpen = route.name === "goal-edit" || route.name === "sleep-day" || route.name === "review";
  document.body.classList.toggle("modal-open", Boolean(modal) || sheetOpen);
  if (!sameRoute) {
    paint.routeKey = location.hash;
    paint.sheets = new Set();
    window.scrollTo(0, 0);
  }
  paint.sheets = restoreView(app, saved, paint.sheets || new Set());
  syncMotion(app);
}

// A repaint rebuilds the whole DOM. Keep scroll offsets, focus, and open sheets
// steady so picking an option does not throw the page back to the top.
const STATE_CLASSES = new Set(["on", "active"]);

function signature(el) {
  // Ignore selection classes so a button keeps its key when it becomes "on".
  const classes = [...el.classList].filter((name) => !STATE_CLASSES.has(name)).sort();
  return `${el.tagName}${classes.length ? `.${classes.join(".")}` : ""}`;
}

// Walk the tree once and give each element a structural key that survives a rebuild.
function keyIndex(root) {
  const byKey = new Map();
  const byNode = new Map();
  const walk = (parent, prefix) => {
    const counts = new Map();
    for (const el of parent.children) {
      const sig = signature(el);
      const n = counts.get(sig) || 0;
      counts.set(sig, n + 1);
      const key = el.dataset?.scrollKey ? `#${el.dataset.scrollKey}` : `${prefix}>${sig}:${n}`;
      byKey.set(key, el);
      byNode.set(el, key);
      if (el.children.length) walk(el, key);
    }
  };
  walk(root, "");
  return { byKey, byNode };
}

function captureView(root) {
  const scrolls = new Map();
  const { byNode } = keyIndex(root);
  for (const [el, key] of byNode) {
    if (el.scrollTop || el.scrollLeft) scrolls.set(key, [el.scrollTop, el.scrollLeft]);
  }
  const active = document.activeElement;
  let focus = null;
  if (active && active !== document.body && root.contains(active)) {
    focus = { key: byNode.get(active), tag: active.tagName, name: active.getAttribute("name"), label: active.getAttribute("aria-label") };
    try {
      if (typeof active.selectionStart === "number") focus.selection = [active.selectionStart, active.selectionEnd, active.selectionDirection];
    } catch { /* inputs without selection support */ }
  }
  return { x: window.scrollX, y: window.scrollY, scrolls, focus };
}

function restoreView(root, saved, previousSheets) {
  const sheets = new Set();
  const { byKey: index, byNode } = keyIndex(root);
  for (const el of root.querySelectorAll(".sheet-back")) {
    const key = byNode.get(el);
    sheets.add(key);
    // Do not replay the slide-in animation for a sheet that was already open.
    if (saved && previousSheets.has(key)) {
      el.style.animation = "none";
      el.querySelector(".sheet")?.style.setProperty("animation", "none");
    }
  }
  if (!saved) return sheets;
  for (const [key, [top, left]] of saved.scrolls) {
    const el = index.get(key);
    if (el) { el.scrollTop = top; el.scrollLeft = left; }
  }
  if (window.scrollX !== saved.x || window.scrollY !== saved.y) window.scrollTo(saved.x, saved.y);
  if (saved.focus) {
    let target = index.get(saved.focus.key);
    if (!target || target.tagName !== saved.focus.tag) {
      target = [...root.querySelectorAll(saved.focus.tag)].find((el) => (saved.focus.name && el.getAttribute("name") === saved.focus.name)
        || (saved.focus.label && el.getAttribute("aria-label") === saved.focus.label)) || null;
    }
    if (target && typeof target.focus === "function") {
      try {
        target.focus({ preventScroll: true });
        if (saved.focus.selection && typeof target.setSelectionRange === "function") target.setSelectionRange(...saved.focus.selection);
      } catch { /* focus is best effort */ }
    }
  }
  return sheets;
}

function titleFor(name) {
  if (name === "note-edit" && !route.id) return `B4O7 · ${t("notes.newNote")}`;
  const names = {
    home: "title.home",
    goals: "title.goals",
    goal: "title.goal",
    "goal-edit": "title.goalEdit",
    sleep: "title.sleep",
    "sleep-day": "title.sleep",
    rewards: "title.rewards",
    history: "title.history",
    day: "title.day",
    review: "title.review",
    settings: "title.settings",
    notes: "title.notes",
    note: "title.note",
    "note-edit": "title.noteEdit",
  };
  return `B4O7 · ${t(names[name] || "title.home")}`;
}

function tabbar() {
  const tabs = [
    ["home", "nav.home", "home"],
    ["goals", "nav.goals", "goals"],
    ["sleep", "nav.sleep", "moon"],
    ["rewards", "nav.rewards", "gift"],
    ["history", "nav.history", "calendar"],
  ];
  const current = route.name === "goal" || route.name === "goal-edit" ? "goals"
    : route.name === "sleep-day" ? "sleep"
      : route.name === "day" || route.name === "review" ? "history"
        : route.name;
  return h("nav", { class: "tabbar", "aria-label": t("nav.main") }, [
    h("div", { class: "tabbar-inner" }, tabs.map(([id, label, glyph]) => h("button", {
      class: `tab${current === id ? " active" : ""}`,
      "data-tab": id,
      "aria-current": current === id ? "page" : null,
      onClick: () => go(`/${id}`),
    }, [icon(glyph), t(label)]))),
  ]);
}

function reloadApp() {
  const worker = navigator.serviceWorker?.controller;
  navigator.serviceWorker?.getRegistration().then((reg) => {
    reg?.waiting?.postMessage("skip-waiting");
    if (!reg?.waiting) location.reload();
  });
  if (worker) {
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  }
}

function onHash() {
  route = parseRoute(location.hash);
  modal = null;
  paint();
}

function schedulePaint() {
  const active = document.activeElement;
  if (active?.dataset?.live === "text") {
    pendingPaint = true;
    return;
  }
  paint();
}

function checkReminders() {
  const state = getState();
  if (!state) return;
  const hit = dueReminder(state, today(), zone(), new Date(), reminderSeen());
  if (!hit || reminder?.key === hit.key) return;
  markReminderSeen(hit.key);
  reminder = hit;
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("B4O7", { body: hit.text }); } catch { /* optional */ }
  }
  paint();
}

async function bootPersist() {
  persistInfo = await askPersist();
}

function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    const announce = () => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        updateReady = true;
        paint();
      }
    };
    announce();
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") announce();
      });
    });
  }).catch(() => {});
}

function startClock() {
  setInterval(() => {
    const clock = document.querySelector("[data-clock]");
    if (clock) clock.textContent = localParts(new Date(), zone()).hhmm;
    for (const node of document.querySelectorAll("[data-remaining]")) {
      const start = Date.parse(node.dataset.start);
      const need = Number(node.dataset.need);
      const left = Math.max(0, need - (Date.now() - start));
      node.textContent = formatClock(left);
      if (left === 0 && !node.dataset.settled) {
        node.dataset.settled = "1";
        sync();
      }
    }
  }, 1000);
  setInterval(checkReminders, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkReminders();
  });
  document.getElementById("app").addEventListener("focusout", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active?.dataset?.live === "text") return;
      if (pendingPaint) {
        pendingPaint = false;
        paint();
      }
    }, 0);
  });
}

async function main() {
  installMotion();
  applyDocumentLocale();
  onLocaleChange(() => {
    if (booted) paint();
  });
  subscribe(schedulePaint);
  window.addEventListener("hashchange", onHash);
  try {
    await init();
    booted = true;
  } catch (error) {
    console.error(error);
    document.querySelector("#app").replaceChildren(h("div", { class: "boot-error" }, [
      h("p", { class: "brand", text: "B4O7" }),
      h("p", { text: t("error.database") }),
      h("p", { class: "hint", text: t("error.privateMode") }),
    ]));
    return;
  }
  if (!booted) return;
  registerWorker();
  bootPersist().then(() => { if (route.name === "settings") paint(); });
  startClock();
  checkReminders();
}

main();
