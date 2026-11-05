import { localParts } from "./dates.js";
import { dueReminder, markReminderSeen, reminderSeen } from "./reminders.js";
import {
  cancelTimer,
  claimMilestone,
  claimReward,
  deleteAllData,
  deleteGoal,
  deleteJournal,
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
  updateSettings,
  zone,
} from "./store.js";
import { formatClock, h, icon, renderModal, showToast } from "./ui.js";
import { renderGoals } from "./views/goals.js";
import { renderHistory } from "./views/history.js";
import { renderHome } from "./views/home.js";
import { renderRewards } from "./views/rewards.js";
import { renderSettings } from "./views/settings.js";
import { renderSleep } from "./views/sleep.js";

const memory = {
  sleepMonth: null,
  historyMonth: null,
  journalEditing: false,
  journalDraft: null,
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
  saveReview,
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
    showToast(persistInfo.persisted ? "This device will try to keep your data." : "The browser did not grant persistent storage.");
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
          showToast("That file could not be read.");
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
    else view = renderSettings(ctx);
  } catch (error) {
    console.error(error);
    view = h("p", { class: "error", text: "This screen hit a problem. Your data is still on the device." });
  }
  const shell = h("div", { class: "app" }, [
    h("main", { class: "main", "data-view": route.name }, [view]),
    tabbar(),
    updateReady ? h("div", { class: "update-bar banner spread" }, [
      h("span", { text: "A new version is ready." }),
      h("button", { class: "btn primary small", onClick: reloadApp }, "Reload"),
    ]) : null,
    modal ? renderModal(modal, () => { modal = null; paint(); }) : null,
  ]);
  app.replaceChildren(shell);
  const sheetOpen = route.name === "goal-edit" || route.name === "sleep-day" || route.name === "review";
  document.body.classList.toggle("modal-open", Boolean(modal) || sheetOpen);
  if (paint.routeKey !== location.hash) {
    paint.routeKey = location.hash;
    window.scrollTo(0, 0);
  }
}

function titleFor(name) {
  const names = {
    home: "Home",
    goals: "Goals",
    goal: "Goal",
    "goal-edit": "Edit goal",
    sleep: "Sleep",
    "sleep-day": "Sleep",
    rewards: "Rewards",
    history: "History",
    day: "Day",
    review: "Review",
    settings: "Settings",
  };
  return `B4O7 · ${names[name] || "Home"}`;
}

function tabbar() {
  const tabs = [
    ["home", "Home", "home"],
    ["goals", "Goals", "goals"],
    ["sleep", "Sleep", "moon"],
    ["rewards", "Rewards", "gift"],
    ["history", "History", "calendar"],
  ];
  const current = route.name === "goal" || route.name === "goal-edit" ? "goals"
    : route.name === "sleep-day" ? "sleep"
      : route.name === "day" || route.name === "review" ? "history"
        : route.name;
  return h("nav", { class: "tabbar", "aria-label": "Main" }, [
    h("div", { class: "tabbar-inner" }, tabs.map(([id, label, glyph]) => h("button", {
      class: `tab${current === id ? " active" : ""}`,
      "data-tab": id,
      "aria-current": current === id ? "page" : null,
      onClick: () => go(`/${id}`),
    }, [icon(glyph), label]))),
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
  subscribe(schedulePaint);
  window.addEventListener("hashchange", onHash);
  try {
    await init();
    booted = true;
  } catch (error) {
    console.error(error);
    document.querySelector("#app").replaceChildren(h("div", { class: "boot-error" }, [
      h("p", { class: "brand", text: "B4O7" }),
      h("p", { text: "This browser could not open the on-device database." }),
      h("p", { class: "hint", text: "Private mode on some browsers blocks storage. Open B4O7 in a normal Safari tab." }),
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
