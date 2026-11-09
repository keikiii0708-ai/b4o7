import { formatPrettyDate, weekDayLetters } from "./dates.js";
import { stateLabel, t } from "./i18n.js";
import { CHECK_PATH, armCheck } from "./motion.js";
import { statusLabel, timerStatus } from "./scoring.js";

const urls = new Map();

export const MOODS = ["Productive", "Focused", "Tired", "Unmotivated", "Great", "Neutral"];

export const ICON_CHOICES = ["🎯", "📖", "🏋️", "🏃", "🚶", "💧", "🧘", "✍️", "💪", "🧠", "🌙", "📚", "💼", "🎨", "🎵", "🍎", "🚴", "🏊", "☀️", "🪴", "🧩", "💤"];

export function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "value") node.value = value;
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "disabled") node.disabled = Boolean(value);
    else if (key === "dataset" && value && typeof value === "object") {
      for (const [name, item] of Object.entries(value)) node.dataset[name] = item;
    } else if (key === "style" && value && typeof value === "object") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  if (tag === "button" && !attrs.type) node.type = "button";
  append(node, children);
  return node;
}

function append(node, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    for (const item of child) append(node, item);
    return;
  }
  node.append(child instanceof Node ? child : document.createTextNode(String(child)));
}

export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ico");
  const add = (tag, attrs) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    svg.append(el);
  };
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.6",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };
  if (name === "settings") {
    add("circle", { ...stroke, cx: "12", cy: "12", r: "3" });
    add("path", { ...stroke, d: "M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12H20.5M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" });
    return svg;
  }
  const paths = {
    home: "M4 10.5 12 4l8 6.5V20H15v-6H9v6H4z",
    goals: "M12 3.5l1.9 4.2 4.6.5-3.4 3.1.9 4.5L12 13.6 8 15.8l.9-4.5L5.5 8.2l4.6-.5z",
    moon: "M20 14.5A8.2 8.2 0 0 1 9.6 3.2 6.6 6.6 0 1 0 20 14.5z",
    gift: "M4 10h16v9H4zM3 7h18v3H3zM12 7v12",
    calendar: "M5 5h14v15H5zM5 9h14M8 3.5V6M16 3.5V6",
    back: "M15 5 8 12l7 7",
    plus: "M12 5v14M5 12h14",
    close: "M6 6l12 12M18 6 6 18",
  };
  add("path", { ...stroke, d: paths[name] || paths.home });
  if (name === "gift") add("path", { ...stroke, d: "M12 7c-1.8 0-3-1.6-2-2.8C11.2 3 12 5.2 12 7c1.8 0 3-1.6 2-2.8C12.8 3 12 5.2 12 7z" });
  return svg;
}

export function checkMark() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "check-mark");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", CHECK_PATH);
  path.setAttribute("pathLength", "1");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

export function checkHost(key, checked) {
  return h("span", {
    class: "check-host",
    "data-check-key": key,
    "data-checked": checked ? "1" : "0",
    "aria-hidden": "true",
  }, checked ? [checkMark()] : null);
}

const RING_SWEEP = 360 / 7 - 18;
const RING_STEP = 360 / 7;
const RING_START = -81;
const RING_RADIUS = 32.2266;

const RING_PALETTES = {
  status: {
    win: "#8DBF8F",
    loss: "#C47D7D",
    pending: "#8E9198",
    neutral: "#2C2E32",
    upcoming: "#3A3C42",
    incomplete: "#8E9198",
    none: "#3A3C42",
  },
  mark: {
    win: "#8DBF8F",
    mark: "#34363A",
  },
};

function ringArc(index) {
  const start = (RING_START + index * RING_STEP) * Math.PI / 180;
  const end = start + RING_SWEEP * Math.PI / 180;
  const cx = 50;
  const cy = 50;
  const r = RING_RADIUS;
  const x0 = cx + r * Math.cos(start);
  const y0 = cy + r * Math.sin(start);
  const x1 = cx + r * Math.cos(end);
  const y1 = cy + r * Math.sin(end);
  const n = (value) => value.toFixed(2);
  return `M ${n(x0)} ${n(y0)} A ${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y1)}`;
}

export function progressRing(states, options = {}) {
  const palette = RING_PALETTES[options.palette || "status"];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "12 12 76 76");
  svg.setAttribute("width", String(options.size || 64));
  svg.setAttribute("height", String(options.size || 64));
  svg.classList.add("ring");
  if (options.hidden) svg.setAttribute("aria-hidden", "true");
  else {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", options.label || states.map((state) => stateLabel(state)).join(", "));
  }
  states.forEach((state, index) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ringArc(index));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", palette[state] || palette.none || "#3A3C42");
    path.setAttribute("stroke-width", "5.66");
    path.setAttribute("stroke-linecap", "round");
    svg.append(path);
  });
  return svg;
}

export function brandMark(size = 30) {
  return progressRing(["win", "win", "win", "win", "mark", "mark", "mark"], {
    size,
    label: "B4O7",
    palette: "mark",
  });
}

export function sheetFrame({ title, onClose, children }) {
  return h("div", {
    class: "sheet-back",
    onClick: (event) => {
      if (event.target === event.currentTarget) onClose?.();
    },
  }, [
    h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title }, [
      h("div", { class: "sheet-grab", "aria-hidden": "true" }),
      h("header", { class: "sheet-head" }, [
        h("h2", { text: title }),
        h("button", { class: "icon-btn", "aria-label": t("action.close"), onClick: onClose }, [icon("close")]),
      ]),
      children,
    ]),
  ]);
}

export function field(label, control, hint) {
  return h("label", { class: "field" }, [
    h("span", { class: "field-label", text: label }),
    control,
    hint ? h("span", { class: "hint", text: hint }) : null,
  ]);
}

export function dots(states, letters) {
  const label = states.map((state, index) => `${letters[index]} ${stateLabel(state)}`).join(", ");
  return h("div", { class: "week-dots" }, [
    h("div", { class: "dots", role: "img", "aria-label": label }, states.map((state) => h("span", { class: `dot ${state}` }))),
    h("div", { class: "dot-letters", "aria-hidden": "true" }, letters.map((letter) => h("span", { text: letter }))),
  ]);
}

export function meter(wins, target, key) {
  const ratio = target ? Math.min(1, Math.max(0, wins / target)) : 0;
  const bar = { style: { "--p": String(Math.round(ratio * 1000) / 1000) } };
  if (key) bar["data-meter-key"] = key;
  const label = { class: "meter-label", text: t("meter", { wins, target }) };
  if (key) label["data-metric-key"] = `${key}:label`;
  return h("div", { class: "meter-row" }, [
    h("div", { class: "meter", "aria-hidden": "true" }, [h("span", bar)]),
    h("span", label),
  ]);
}

export function seriesCard({ goal, week, weekStartsOn, featured, footer, onOpen }) {
  const result = week.result;
  const open = typeof onOpen === "function";
  const letters = weekDayLetters(weekStartsOn);
  const ring = progressRing(week.dayStates, { size: featured ? 108 : 52, hidden: true });
  return h("article", { class: `card series ${result.status}${featured ? " featured" : ""}` }, [
    h(open ? "button" : "div", { class: "series-hit", onClick: open ? onOpen : null }, [
      h("div", { class: "series-top" }, [
        h("div", { class: "series-id" }, [
          featured ? null : h("span", { class: "emoji", "aria-hidden": "true", text: goal.icon || "•" }),
          h("div", { class: "series-copy" }, featured ? [
            h("p", { class: `status-line ${result.status}`, text: statusLabel(result.status) }),
            h("p", { class: "score", "data-metric-key": `score:${goal.id}:${week.weekStart}`, text: result.score }),
            h("h2", { class: "goal-name", text: goal.name }),
          ] : [
            h("h2", { class: "goal-name", text: goal.name }),
            h("p", { class: `status-line ${result.status}`, text: statusLabel(result.status) }),
          ]),
        ]),
        featured ? ring : h("div", { class: "series-side" }, [
          h("p", { class: "score", "data-metric-key": `score:${goal.id}:${week.weekStart}`, text: result.score }),
          ring,
        ]),
      ]),
      h("p", { class: "copy", text: week.copy }),
      dots(week.dayStates, letters),
      meter(result.wins, result.target, `meter:${goal.id}:${week.weekStart}`),
    ]),
    footer || null,
  ]);
}

function withDayMark(node, goalId, date, on) {
  node.prepend(checkHost(`day:${goalId}:${date}`, on));
  return node;
}

export function renderTodayAction(ctx, goal, week) {
  const index = week.dates.indexOf(ctx.today);
  const dayState = week.dayStates[index];
  const date = ctx.today;
  if (dayState === "neutral") return withDayMark(h("span", { class: "pill", text: t("state.neutral") }), goal.id, date, false);
  if (dayState === "win") {
    if (goal.completionMethod === "manual") {
      return withDayMark(h("button", {
        class: "btn ghost small with-check",
        onClick: () => ctx.actions.setDayExplicit(goal.id, date, null),
      }, t("action.undo")), goal.id, date, true);
    }
    return withDayMark(h("span", { class: "pill win with-check", text: t("state.win") }), goal.id, date, true);
  }
  if (dayState === "loss") return withDayMark(h("span", { class: "pill loss", text: t("state.loss") }), goal.id, date, false);
  if (goal.completionMethod === "timer") {
    const record = ctx.state.dailyRecords.find((item) => item.goalId === goal.id && item.date === date);
    const minutes = week.snapshot.timerDurationMinutes || goal.timerDurationMinutes || 25;
    if (record?.timerStartedAt && !record.timerEndedAt) {
      const status = timerStatus(record.timerStartedAt, minutes, ctx.now);
      return withDayMark(h("div", { class: "timer-live" }, [
        h("span", {
          class: "timer-readout",
          dataset: {
            remaining: "1",
            start: record.timerStartedAt,
            need: String(minutes * 60000),
            goal: goal.id,
            date,
          },
          text: formatClock(status.remainingMs),
        }),
        h("button", { class: "btn ghost small", onClick: () => ctx.actions.cancelTimer(goal.id, date) }, t("action.cancel")),
      ]), goal.id, date, false);
    }
    return withDayMark(h("button", { class: "btn primary small", onClick: () => ctx.actions.startTimer(goal.id, date) }, t("goal.startTimer", { minutes })), goal.id, date, false);
  }
  if (goal.completionMethod === "threshold") {
    const record = ctx.state.dailyRecords.find((item) => item.goalId === goal.id && item.date === date);
    const label = week.snapshot.thresholdLabel || goal.thresholdLabel || t("goal.countFallback");
    const target = week.snapshot.thresholdTarget ?? goal.thresholdTarget ?? "";
    return withDayMark(h("form", {
      class: "inline-form",
      onSubmit: (event) => {
        event.preventDefault();
        armCheck(`day:${goal.id}:${date}`);
        const value = new FormData(event.currentTarget).get("value");
        ctx.actions.logThreshold(goal.id, date, value);
      },
    }, [
      h("input", {
        name: "value",
        type: "number",
        inputmode: "decimal",
        step: "any",
        min: "0",
        "aria-label": label,
        value: record?.thresholdValue ?? "",
        placeholder: String(target),
        "data-live": "text",
      }),
      h("button", { type: "submit", class: "btn primary small" }, t("action.log")),
    ]), goal.id, date, false);
  }
  if (goal.completionMethod === "sleep") {
    return withDayMark(h("button", { class: "btn ghost small", onClick: () => ctx.go("/sleep") }, t("nav.sleep")), goal.id, date, false);
  }
  return withDayMark(h("button", {
    class: "btn primary small",
    onClick: () => {
      armCheck(`day:${goal.id}:${date}`);
      ctx.actions.setDayExplicit(goal.id, date, "win");
    },
  }, t("goal.logWin")), goal.id, date, false);
}

export function topbar({ title, date, brand, onBack, onSettings }) {
  return h("header", { class: "topbar" }, [
    onBack
      ? h("button", { class: "icon-btn", "aria-label": t("action.back"), onClick: onBack }, [icon("back")])
      : null,
    h("div", { class: "topbar-copy" }, [
      brand ? h("div", { class: "brand-lockup" }, [
        brandMark(30),
        h("h1", { class: "brand", text: "B4O7" }),
      ]) : null,
      title ? h("h1", { class: "page-title", text: title }) : null,
      date ? h("p", { class: "date-line", text: date }) : null,
    ]),
    onSettings
      ? h("button", { class: "icon-btn", "aria-label": t("action.settings"), "data-action": "settings", onClick: onSettings }, [icon("settings")])
      : h("span", { class: "icon-spacer" }),
  ]);
}

export function emptyState(title, body, action) {
  return h("section", { class: "empty card" }, [
    h("h2", { text: title }),
    h("p", { class: "muted", text: body }),
    action || null,
  ]);
}

export function imageUrl(state, id) {
  if (!id) return "";
  const image = (state.images || []).find((item) => item.id === id);
  if (!image?.blob) return "";
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(image.blob));
  return urls.get(id);
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPercent(rate) {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function showToast(message) {
  document.querySelector(".toast")?.remove();
  const node = h("div", { class: "toast", role: "status" }, message);
  document.body.append(node);
  setTimeout(() => node.remove(), 2800);
}

export function renderModal(modal, close) {
  const confirmBtn = h("button", {
    type: "button",
    class: modal.danger ? "btn danger block" : "btn primary block",
    "data-action": "confirm-modal",
    disabled: Boolean(modal.typed),
    onClick: () => modal.onConfirm?.(),
  }, modal.confirmLabel || t("action.confirm"));
  const typed = modal.typed
    ? h("input", {
      type: "text",
      autocomplete: "off",
      autocapitalize: "characters",
      "aria-label": t("confirm.type", { word: modal.typed }),
      "data-live": "text",
      onInput: (event) => {
        confirmBtn.disabled = event.target.value.trim() !== modal.typed;
      },
    })
    : null;
  return sheetFrame({
    title: modal.title,
    onClose: close,
    children: [
      modal.text ? h("p", { class: "muted", text: modal.text }) : null,
      modal.body || null,
      typed ? field(t("confirm.type", { word: modal.typed }), typed) : null,
      h("div", { class: "stack tight sheet-actions" }, [
        modal.confirmLabel === null ? null : confirmBtn,
        h("button", { class: "btn ghost block", onClick: close }, modal.cancelLabel || t("action.cancel")),
      ]),
    ],
  });
}

export function calendar({ cells, marks, today, onPick, letters }) {
  return h("div", { class: "calendar" }, [
    h("div", { class: "cal-letters", "aria-hidden": "true" }, letters.map((letter) => h("span", { text: letter }))),
    ...cells.map((cell) => {
      const mark = marks(cell.date);
      const classes = ["cal-cell", mark || "none"];
      if (!cell.inMonth) classes.push("out");
      if (cell.date === today) classes.push("today");
      return h("button", {
        class: classes.join(" "),
        "aria-label": `${formatPrettyDate(cell.date)}, ${stateLabel(mark || "empty")}`,
        onClick: () => onPick(cell.date),
      }, String(Number(cell.date.slice(8))));
    }),
  ]);
}

export function monthSwitcher(label, onPrev, onNext) {
  return h("div", { class: "month-switch" }, [
    h("button", { class: "icon-btn", "aria-label": t("month.prev"), onClick: onPrev }, [icon("back")]),
    h("h2", { class: "month-label", text: label }),
    h("button", { class: "icon-btn flip", "aria-label": t("month.next"), onClick: onNext }, [icon("back")]),
  ]);
}
