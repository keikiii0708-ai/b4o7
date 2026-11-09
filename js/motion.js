// Interaction motion. Paint rebuilds the DOM, so gesture and tween state lives here
// and is reapplied after each paint. Values are transforms and opacity only.

export const PRESS_SCALE = 0.96;
export const PRESS_MS = 90;
export const RELEASE_MS = 460;
export const PRESS_CANCEL_DISTANCE = 12;
export const CHECK_MS = 200;
export const CHECK_PATH = "M4.5 12.5 L9.2 17.2 L19.5 6.2";
export const SWITCH_TRAVEL = 20;
export const SWITCH_MS = 440;
export const ICON_MS = 480;
export const BURST_MS = 420;
export const PARTICLE_LIMIT = 8;

const NAV_BURST = new Set(["goals", "sleep", "rewards"]);
const IGNORE_CLASS = new Set(["on", "active", "is-pressed", "just-unlocked"]);

export function easeOutCubic(t) {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - (1 - x) ** 3;
}

export function motionReduced() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

export function allowsNavBurst(tab) {
  return NAV_BURST.has(tab);
}

export function pressScale(from, t) {
  if (t <= 0) return from;
  if (t >= 1) return PRESS_SCALE;
  return from + (PRESS_SCALE - from) * easeOutCubic(t);
}

// Release starts at the live scale, overshoots a little past 1, then settles at 1.
export function buttonScale(from, t) {
  if (t <= 0) return from;
  if (t >= 1) return 1;
  const peak = 1.042;
  const dip = 0.988;
  let shaped;
  if (t < 0.4) shaped = PRESS_SCALE + (peak - PRESS_SCALE) * easeOutCubic(t / 0.4);
  else if (t < 0.7) shaped = peak + (dip - peak) * ((t - 0.4) / 0.3);
  else shaped = dip + (1 - dip) * easeOutCubic((t - 0.7) / 0.3);
  return from + (shaped - PRESS_SCALE);
}

export function reducePress(state, event) {
  if (event.type === "down") {
    if (event.disabled || !event.key) return { state, effect: "none" };
    if (state) return { state, effect: "none" };
    return { state: { phase: "down", key: event.key }, effect: "press" };
  }
  if (!state || (event.key && event.key !== state.key)) return { state, effect: "none" };
  if (event.type === "move") {
    if (state.phase !== "down") return { state, effect: "none" };
    if ((event.distance || 0) >= PRESS_CANCEL_DISTANCE) {
      return { state: { phase: "cancelled", key: state.key }, effect: "snap" };
    }
    return { state, effect: "none" };
  }
  if (event.type === "up") {
    const spring = state.phase === "down" && !event.reduced;
    return { state: null, effect: spring ? "spring" : "snap" };
  }
  if (event.type === "cancel") return { state: null, effect: "snap" };
  return { state, effect: "none" };
}

export function iconScale(t) {
  if (t <= 0 || t >= 1) return 1;
  if (t < 0.32) return 1 + 0.16 * easeOutCubic(t / 0.32);
  if (t < 0.55) return 1.16 + (0.94 - 1.16) * ((t - 0.32) / 0.23);
  return 0.94 + 0.06 * easeOutCubic((t - 0.55) / 0.45);
}

export function particleField(count = 7) {
  const n = Math.max(0, Math.min(PARTICLE_LIMIT, count));
  const dots = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = 22 + (i % 3) * 4;
    dots.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      size: i % 2 === 0 ? 4 : 3.5,
    });
  }
  return dots;
}

export function checkEndpoints(path = CHECK_PATH) {
  const nums = String(path).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  const points = [];
  for (let i = 0; i < nums.length - 1; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
}

export function checkOffset(progress) {
  if (progress <= 0) return 1;
  if (progress >= 1) return 0;
  return 1 - progress;
}

export function stepCheck(state, checked, now, { reduced = false, armed = false } = {}) {
  const on = Boolean(checked);
  if (reduced) return { state: { checked: on, started: 0, drawing: false }, progress: on ? 1 : 0, animate: false };
  if (!state) {
    const animate = on && armed;
    return {
      state: { checked: on, started: animate ? now : 0, drawing: animate },
      progress: on && !animate ? 1 : 0,
      animate,
    };
  }
  if (on && !state.checked) {
    return { state: { checked: true, started: now, drawing: true }, progress: 0, animate: true };
  }
  if (!on) return { state: { checked: false, started: 0, drawing: false }, progress: 0, animate: false };
  if (state.drawing) {
    const t = Math.min(1, (now - state.started) / CHECK_MS);
    if (t >= 1) return { state: { checked: true, started: state.started, drawing: false }, progress: 1, animate: false };
    return { state, progress: t, animate: true };
  }
  return { state: { checked: true, started: state.started, drawing: false }, progress: 1, animate: false };
}

export function switchFrame(fromX, toX, t) {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (clamped <= 0) return { x: fromX, scaleX: 1, scaleY: 1 };
  if (clamped >= 1) return { x: toX, scaleX: 1, scaleY: 1 };
  let x = fromX + (toX - fromX) * easeOutCubic(clamped);
  if (clamped > 0.82) {
    const u = (clamped - 0.82) / 0.18;
    const dir = Math.sign(toX - fromX) || 0;
    x += dir * Math.sin(u * Math.PI) * 0.6 * (1 - u);
  }
  x = Math.min(SWITCH_TRAVEL + 0.8, Math.max(-0.8, x));
  const strength = Math.min(1, Math.abs(toX - fromX) / SWITCH_TRAVEL);
  let scaleX = 1;
  let scaleY = 1;
  if (clamped < 0.66) {
    const hump = Math.sin((clamped / 0.66) * Math.PI);
    scaleX = 1 + 0.4 * hump * strength;
    scaleY = 1 - (scaleX - 1) * 0.28;
  } else {
    const u = (clamped - 0.66) / 0.34;
    const bounce = Math.sin(u * Math.PI) * 0.06 * (1 - u * 0.2);
    scaleX = 1 + bounce;
    scaleY = 1 - bounce * 0.35;
  }
  return { x, scaleX, scaleY };
}

export function stepSwitch(state, on, now, { reduced = false } = {}) {
  const toX = on ? SWITCH_TRAVEL : 0;
  const rest = () => ({ state: { on, fromX: toX, toX, started: 0, dur: 0 }, pose: { x: toX, scaleX: 1, scaleY: 1 }, animate: false });
  if (!state || reduced) return rest();
  const running = state.dur > 0 && (now - state.started) < state.dur;
  if (state.on !== on || state.toX !== toX) {
    const pose = running ? switchFrame(state.fromX, state.toX, (now - state.started) / state.dur) : { x: state.on ? SWITCH_TRAVEL : 0, scaleX: 1, scaleY: 1 };
    return {
      state: { on, fromX: pose.x, toX, started: now, dur: SWITCH_MS },
      pose: switchFrame(pose.x, toX, 0),
      animate: true,
    };
  }
  if (!running) return rest();
  const t = (now - state.started) / state.dur;
  return { state, pose: switchFrame(state.fromX, state.toX, t), animate: true };
}

export function parseMetric(text) {
  const s = String(text ?? "");
  const parts = [];
  const re = /(\d+(?:\.\d+)?)/g;
  let last = 0;
  let match;
  while ((match = re.exec(s))) {
    if (match.index > last) parts.push({ type: "text", value: s.slice(last, match.index) });
    const raw = match[1];
    const dot = raw.indexOf(".");
    parts.push({
      type: "num",
      value: Number(raw),
      decimals: dot === -1 ? 0 : raw.length - dot - 1,
    });
    last = match.index + raw.length;
  }
  if (last < s.length) parts.push({ type: "text", value: s.slice(last) });
  return parts;
}

export function sameMetricShape(a, b) {
  const left = parseMetric(a);
  const right = parseMetric(b);
  if (left.length !== right.length) return false;
  let nums = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].type !== right[i].type) return false;
    if (left[i].type === "text" && left[i].value !== right[i].value) return false;
    if (left[i].type === "num") nums += 1;
  }
  return nums > 0;
}

export function canRoll(text) {
  const s = String(text ?? "").trim();
  if (!s || s.length > 96) return false;
  if (/\d\s*:\s*\d/.test(s)) return false;
  if (/\d{4}-\d{2}-\d{2}/.test(s)) return false;
  if (/\d+\s*h\b/i.test(s)) return false;
  const nums = parseMetric(s).filter((part) => part.type === "num");
  return nums.length > 0 && nums.length <= 6;
}

export function metricFrame(fromText, toText, t) {
  if (t >= 1) return String(toText);
  if (t <= 0) return String(fromText);
  if (!sameMetricShape(fromText, toText)) return String(toText);
  const from = parseMetric(fromText);
  const to = parseMetric(toText);
  const e = easeOutCubic(t);
  let out = "";
  to.forEach((part, index) => {
    if (part.type === "text") out += part.value;
    else {
      const value = from[index].value + (part.value - from[index].value) * e;
      out += part.decimals ? value.toFixed(part.decimals) : String(Math.round(value));
    }
  });
  return out;
}

export function numericDistance(fromText, toText) {
  const from = parseMetric(fromText);
  const to = parseMetric(toText);
  let distance = 0;
  to.forEach((part, index) => {
    if (part.type === "num" && from[index]?.type === "num") {
      distance = Math.max(distance, Math.abs(part.value - from[index].value));
    }
  });
  return distance;
}

export function stackableMetric(fromText, toText) {
  if (!sameMetricShape(fromText, toText)) return false;
  const from = parseMetric(fromText);
  const to = parseMetric(toText);
  let changed = false;
  for (let i = 0; i < to.length; i += 1) {
    if (to[i].type !== "num") continue;
    if (to[i].decimals || from[i].decimals) return false;
    const delta = Math.abs(to[i].value - from[i].value);
    if (!Number.isInteger(delta) || delta > 8) return false;
    if (delta > 0) changed = true;
  }
  return changed;
}

export function metricDuration(fromText, toText) {
  const distance = numericDistance(fromText, toText);
  return Math.round(Math.min(680, Math.max(340, 300 + Math.min(distance, 12) * 28)));
}

export function stepMetric(state, exact, now, { reduced = false } = {}) {
  const next = String(exact ?? "");
  const settle = () => ({ state: { from: next, to: next, started: 0, dur: 0 }, display: next, animate: false });
  if (!state || reduced || !canRoll(next) || !sameMetricShape(state.to, next)) return settle();
  const running = state.dur > 0 && (now - state.started) < state.dur;
  if (state.to === next && !running) return settle();
  if (state.to === next) {
    const t = (now - state.started) / state.dur;
    return { state, display: metricFrame(state.from, state.to, t), animate: true };
  }
  const current = running ? metricFrame(state.from, state.to, (now - state.started) / state.dur) : state.to;
  if (current === next || !canRoll(current) || !sameMetricShape(current, next) || numericDistance(current, next) === 0) return settle();
  return {
    state: { from: current, to: next, started: now, dur: metricDuration(current, next) },
    display: current,
    animate: true,
  };
}

export function meterDuration(from, to) {
  return Math.round(Math.min(680, Math.max(340, 300 + Math.abs(to - from) * 320)));
}

export function stepMeter(state, target, now, { reduced = false } = {}) {
  const to = Math.min(1, Math.max(0, Number(target) || 0));
  const settle = () => ({ state: { from: to, to, started: 0, dur: 0 }, value: to, animate: false });
  if (!state || reduced) return settle();
  const running = state.dur > 0 && (now - state.started) < state.dur;
  const current = running ? state.from + (state.to - state.from) * easeOutCubic((now - state.started) / state.dur) : state.to;
  if (Math.abs(state.to - to) < 1e-6 && !running) return settle();
  if (Math.abs(state.to - to) < 1e-6) return { state, value: current, animate: true };
  if (Math.abs(current - to) < 1e-6) return settle();
  return {
    state: { from: current, to, started: now, dur: meterDuration(current, to) },
    value: current,
    animate: true,
  };
}

export function isFrozenMetric(el) {
  if (!el?.tagName) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.dataset?.live === "text" || el.dataset?.remaining != null || el.dataset?.clock != null) return true;
  const cls = typeof el.className === "string" ? el.className : "";
  return /\b(timer-readout|clock-xl|big-time|date-line|price|month-label)\b/.test(cls);
}

export function controlKey(el, root) {
  if (!el || el.nodeType !== 1) return "";
  if (el.dataset?.switchKey) return `switch:${el.dataset.switchKey}`;
  if (el.dataset?.tab) return `tab:${el.dataset.tab}`;
  if (el.dataset?.action) return `action:${el.dataset.action}`;
  if (el.dataset?.locale) return `locale:${el.dataset.locale}`;
  const label = el.getAttribute?.("aria-label");
  if (label) return `label:${el.tagName}:${label}`;
  return `struct:${structuralKey(el, root || el.ownerDocument?.body)}`;
}

function signature(el) {
  const classes = [...el.classList].filter((name) => !IGNORE_CLASS.has(name)).sort();
  return `${el.tagName}${classes.length ? `.${classes.join(".")}` : ""}`;
}

export function structuralKey(el, root) {
  const parts = [];
  let node = el;
  while (node && node !== root && node.parentElement) {
    const parent = node.parentElement;
    const sig = signature(node);
    let index = 0;
    for (const child of parent.children) {
      if (child === node) break;
      if (signature(child) === sig) index += 1;
    }
    parts.push(`${sig}:${index}`);
    node = parent;
  }
  return parts.reverse().join(">");
}

const checks = new Map();
const switches = new Map();
const metrics = new Map();
const meters = new Map();
const armed = new Map();

let press = null;
let release = null;
let iconFx = null;
let particleLayer = null;
let particleAnims = [];
let scheduled = 0;
let nextFrame = 0;
let installed = false;
let suppressBurstKey = null;

export function armCheck(key) {
  if (!key || typeof performance === "undefined") return;
  armed.set(String(key), performance.now() + 1200);
}

function armFresh(key, now) {
  const expires = armed.get(key);
  if (expires == null) return false;
  if (now > expires) {
    armed.delete(key);
    return false;
  }
  return true;
}

function appRoot() {
  return document.querySelector("#app");
}

function findControl(key) {
  const root = appRoot();
  if (!root || !key) return null;
  for (const button of root.querySelectorAll("button")) {
    if (controlKey(button, root) === key) return button;
  }
  return null;
}

function readScale(el) {
  if (!el) return 1;
  const inline = /scale\(\s*([0-9.]+)/.exec(el.style?.transform || "");
  if (inline) {
    const value = Number(inline[1]);
    return Number.isFinite(value) ? value : 1;
  }
  const computed = getComputedStyle(el).transform;
  if (!computed || computed === "none") return 1;
  const matrix = /matrix\(\s*([0-9.eE+-]+)/.exec(computed);
  const value = matrix ? Number(matrix[1]) : 1;
  return Number.isFinite(value) ? value : 1;
}

function setScale(el, scale) {
  if (!el) return;
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.001) el.style.transform = "";
  else el.style.transform = `scale(${scale})`;
}

function pressable(target) {
  const el = target instanceof Element ? target : target?.parentElement;
  const button = el?.closest?.("button");
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return null;
  return button;
}

function wake() {
  if (scheduled || typeof requestAnimationFrame !== "function") return;
  const token = ++nextFrame;
  scheduled = token;
  const step = (now) => {
    if (scheduled !== token) return;
    scheduled = 0;
    const root = appRoot();
    const more = root ? tick(root, now || performance.now()) : false;
    if (more) wake();
  };
  requestAnimationFrame(step);
  setTimeout(() => step(performance.now()), 32);
}

export function syncMotion(root) {
  if (!root || typeof performance === "undefined") return;
  if (tick(root, performance.now())) wake();
}

function tick(root, now) {
  const reduced = motionReduced();
  let live = false;
  if (press) {
    const button = findControl(press.key);
    if (!button || button.disabled || reduced || now - press.started > 8000) {
      if (button) button.style.transform = "";
      press = null;
    } else if (press.phase === "down") {
      setScale(button, PRESS_SCALE);
      live = true;
    }
  }
  if (release) {
    const button = findControl(release.key);
    const t = (now - release.started) / RELEASE_MS;
    if (!button || reduced || t >= 1) {
      if (button) button.style.transform = "";
      release = null;
    } else {
      setScale(button, buttonScale(release.from, t));
      live = true;
    }
  }
  if (syncSwitches(root, now, reduced)) live = true;
  if (syncChecks(root, now, reduced)) live = true;
  if (syncMetrics(root, now, reduced)) live = true;
  if (syncMeters(root, now, reduced)) live = true;
  if (syncIcon(root, now, reduced)) live = true;
  return live;
}

function beginPress(button, mode, pointerId, point) {
  if (motionReduced() || !button) return;
  const root = appRoot();
  const key = controlKey(button, root);
  const decision = reducePress(press, { type: "down", key, disabled: button.disabled });
  if (decision.effect !== "press") return;
  if (release) {
    const previous = findControl(release.key);
    if (previous) previous.style.transform = "";
    release = null;
  }
  press = {
    phase: "down",
    key,
    mode,
    pointerId,
    started: performance.now(),
    from: PRESS_SCALE,
    x: point?.x ?? 0,
    y: point?.y ?? 0,
  };
  setScale(button, PRESS_SCALE);
  wake();
}

function finishPress(type) {
  if (!press) return;
  const current = press;
  const button = findControl(current.key);
  const from = button ? readScale(button) : PRESS_SCALE;
  const decision = reducePress(current, { type, key: current.key, reduced: motionReduced() });
  press = null;
  if (decision.effect === "spring" && button && !motionReduced()) {
    release = { key: current.key, from, started: performance.now() };
    setScale(button, buttonScale(from, 0));
    wake();
    return;
  }
  if (button) button.style.transform = "";
  release = null;
}

function onPointerDown(event) {
  if (!press) suppressBurstKey = null;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const button = pressable(event.target);
  if (!button) return;
  beginPress(button, "pointer", event.pointerId, { x: event.clientX, y: event.clientY });
}

function onPointerMove(event) {
  if (!press || press.mode !== "pointer" || event.pointerId !== press.pointerId || press.phase !== "down") return;
  const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
  const decision = reducePress(press, { type: "move", key: press.key, distance });
  if (decision.effect !== "snap") return;
  press = { ...press, phase: "cancelled" };
  const button = findControl(press.key);
  if (button) button.style.transform = "";
  suppressBurstKey = press.key;
}

function onPointerUp(event) {
  if (!press || press.mode !== "pointer" || event.pointerId !== press.pointerId) return;
  finishPress("up");
}

function onPointerCancel(event) {
  if (!press || press.mode !== "pointer") return;
  if (event.pointerId != null && event.pointerId !== press.pointerId) return;
  finishPress("cancel");
}

function onKeyDown(event) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  const button = pressable(event.target);
  if (!button || document.activeElement !== button) return;
  beginPress(button, "key", "key");
}

function onKeyUp(event) {
  if (!press || press.mode !== "key") return;
  if (event.key !== "Enter" && event.key !== " ") return;
  finishPress("up");
}

function onFocusOut(event) {
  if (!press || press.mode !== "key") return;
  const button = findControl(press.key);
  const next = event.relatedTarget;
  if (button && (next === button || button.contains(next))) return;
  finishPress("cancel");
}

function onAbort() {
  if (press) {
    const button = findControl(press.key);
    if (button) button.style.transform = "";
    press = null;
  }
  if (release) {
    const button = findControl(release.key);
    if (button) button.style.transform = "";
    release = null;
  }
  iconFx = null;
  clearParticles();
  const root = appRoot();
  if (root) {
    for (const icon of root.querySelectorAll(".tab .ico")) icon.style.transform = "";
  }
}

function onClick(event) {
  const tab = event.target instanceof Element ? event.target.closest("button.tab") : null;
  if (!tab || event.button !== 0) return;
  const key = controlKey(tab, appRoot());
  if (suppressBurstKey && suppressBurstKey === key) {
    suppressBurstKey = null;
    return;
  }
  suppressBurstKey = null;
  const id = tab.dataset.tab;
  if (!allowsNavBurst(id) || tab.disabled || motionReduced()) return;
  clearParticles();
  iconFx = { tab: id, started: performance.now() };
  wake();
}

function syncSwitches(root, now, reduced) {
  const seen = new Set();
  let live = false;
  for (const el of root.querySelectorAll("button.toggle")) {
    const key = el.dataset.switchKey || controlKey(el, root);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const on = el.classList.contains("on") || el.getAttribute("aria-pressed") === "true";
    const result = stepSwitch(switches.get(key), on, now, { reduced });
    switches.set(key, result.state);
    const thumb = el.querySelector("i");
    if (thumb) {
      if (!result.animate) thumb.style.transform = "";
      else {
        const pose = result.pose;
        thumb.style.transform = `translateX(${pose.x}px) scale(${pose.scaleX}, ${pose.scaleY})`;
        live = true;
      }
    }
  }
  for (const key of switches.keys()) if (!seen.has(key)) switches.delete(key);
  return live;
}

function syncChecks(root, now, reduced) {
  const groups = new Map();
  for (const el of root.querySelectorAll("[data-check-key]")) {
    const key = el.dataset.checkKey;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }
  let live = false;
  const seen = new Set();
  for (const [key, items] of groups) {
    seen.add(key);
    const on = items.some((el) => el.dataset.checked === "1");
    const result = stepCheck(checks.get(key) || null, on, now, { reduced, armed: armFresh(key, now) });
    checks.set(key, result.state);
    if (on) armed.delete(key);
    if (result.animate) live = true;
    for (const el of items) paintCheck(el, result.progress, result.animate);
  }
  for (const key of checks.keys()) if (!seen.has(key)) checks.delete(key);
  return live;
}

function paintCheck(el, progress, animate) {
  const path = el.querySelector(".check-mark path");
  if (!path) return;
  if (!animate) {
    path.style.strokeDasharray = "";
    path.style.strokeDashoffset = "";
    return;
  }
  path.setAttribute("pathLength", "1");
  path.style.strokeDasharray = "1";
  path.style.strokeDashoffset = String(checkOffset(progress));
}

function syncMetrics(root, now, reduced) {
  const groups = new Map();
  for (const el of root.querySelectorAll("[data-metric-key]")) {
    if (isFrozenMetric(el)) continue;
    const key = el.dataset.metricKey;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }
  let live = false;
  const seen = new Set(groups.keys());
  for (const [key, items] of groups) {
    const exact = metricExact(items[0]);
    const result = stepMetric(metrics.get(key), exact, now, { reduced });
    metrics.set(key, result.state);
    if (result.animate) live = true;
    for (const el of items) {
      const visual = ensureMetric(el, exact);
      if (!visual) continue;
      paintMetricVisual(visual, result, exact, now);
      const sr = el.querySelector(":scope > .sr-only");
      if (sr && sr.textContent !== exact) sr.textContent = exact;
    }
  }
  for (const key of metrics.keys()) if (!seen.has(key)) metrics.delete(key);
  return live;
}

function metricExact(el) {
  if (el.dataset.metricBound === "1" && el.dataset.metricExact != null) return el.dataset.metricExact;
  return el.textContent;
}

function paintMetricVisual(visual, result, exact, now) {
  const state = result.state;
  const running = Boolean(result.animate && state?.dur > 0);
  const t = running ? Math.min(1, (now - state.started) / state.dur) : 1;
  if (!running || t >= 1 || !stackableMetric(state.from, exact)) {
    delete visual.dataset.roll;
    const text = !running || t >= 1 ? exact : result.display;
    if (visual.childElementCount || visual.textContent !== text) visual.replaceChildren(document.createTextNode(text));
    return;
  }
  const sig = `${state.from}→${exact}`;
  if (visual.dataset.roll !== sig) {
    visual.dataset.roll = sig;
    visual.replaceChildren(...rollNodes(state.from, exact));
  }
  const eased = easeOutCubic(t);
  const from = parseMetric(state.from);
  const to = parseMetric(exact);
  const strips = visual.querySelectorAll(".metric-strip");
  let index = 0;
  to.forEach((part, partIndex) => {
    if (part.type !== "num" || part.value === from[partIndex].value) return;
    const strip = strips[index];
    index += 1;
    if (!strip) return;
    const steps = Math.abs(part.value - from[partIndex].value);
    const line = strip.parentElement?.getBoundingClientRect().height || 0;
    if (line < 1) return;
    strip.style.transform = `translateY(${(-eased * steps * line).toFixed(3)}px)`;
  });
}

function rollNodes(fromText, toText) {
  const from = parseMetric(fromText);
  const to = parseMetric(toText);
  const nodes = [];
  to.forEach((part, index) => {
    if (part.type === "text") {
      nodes.push(document.createTextNode(part.value));
      return;
    }
    const start = from[index].value;
    const delta = part.value - start;
    if (!delta) {
      nodes.push(document.createTextNode(String(Math.round(part.value))));
      return;
    }
    const col = document.createElement("span");
    col.className = "metric-col";
    const strip = document.createElement("span");
    strip.className = "metric-strip";
    const steps = Math.abs(delta);
    const dir = Math.sign(delta);
    for (let i = 0; i <= steps; i += 1) {
      const line = document.createElement("span");
      line.textContent = String(start + dir * i);
      strip.append(line);
    }
    col.append(strip);
    nodes.push(col);
  });
  return nodes;
}

function ensureMetric(el, exact) {
  if (el.dataset.metricBound === "1") {
    el.dataset.metricExact = exact;
    return el.querySelector(":scope > .metric-vis");
  }
  const visual = document.createElement("span");
  visual.className = "metric-vis";
  visual.setAttribute("aria-hidden", "true");
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = exact;
  el.dataset.metricBound = "1";
  el.dataset.metricExact = exact;
  el.replaceChildren(visual, sr);
  return visual;
}

function syncMeters(root, now, reduced) {
  const groups = new Map();
  for (const el of root.querySelectorAll("[data-meter-key]")) {
    const key = el.dataset.meterKey;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }
  let live = false;
  const seen = new Set(groups.keys());
  for (const [key, items] of groups) {
    const target = readMeter(items[0]);
    const result = stepMeter(meters.get(key), target, now, { reduced });
    meters.set(key, result.state);
    if (result.animate) live = true;
    for (const el of items) {
      if (!result.animate) el.style.transform = "";
      else el.style.transform = `scaleX(${result.value})`;
    }
  }
  for (const key of meters.keys()) if (!seen.has(key)) meters.delete(key);
  return live;
}

function readMeter(el) {
  const raw = el.style.getPropertyValue("--p");
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function syncIcon(root, now, reduced) {
  if (!iconFx) return false;
  if (reduced) {
    clearIconMotion(root);
    return false;
  }
  const elapsed = now - iconFx.started;
  if (elapsed >= ICON_MS && elapsed >= BURST_MS) {
    clearIconMotion(root);
    return false;
  }
  const icon = root.querySelector(`.tab[data-tab="${iconFx.tab}"] .ico`);
  if (icon && elapsed < ICON_MS) {
    const scale = iconScale(elapsed / ICON_MS);
    icon.style.transform = Math.abs(scale - 1) < 0.001 ? "" : `scale(${scale})`;
  } else if (icon) icon.style.transform = "";
  if (icon && elapsed < BURST_MS) ensureParticles(icon, elapsed);
  else clearParticles();
  return true;
}

function clearIconMotion(root) {
  iconFx = null;
  clearParticles();
  for (const icon of root.querySelectorAll(".tab .ico")) icon.style.transform = "";
}

function ensureParticles(icon, elapsed) {
  if (particleLayer) {
    placeParticles(icon);
    return;
  }
  if (typeof icon.animate !== "function") return;
  const dots = particleField(7);
  const layer = document.createElement("span");
  layer.className = "nav-burst";
  layer.setAttribute("aria-hidden", "true");
  const anims = [];
  for (const dot of dots) {
    const node = document.createElement("span");
    node.style.width = `${dot.size}px`;
    node.style.height = `${dot.size}px`;
    node.style.marginLeft = `${-dot.size / 2}px`;
    node.style.marginTop = `${-dot.size / 2}px`;
    layer.append(node);
    try {
      const anim = node.animate([
        { transform: "translate(0px, 0px) scale(1)", opacity: 0.95, offset: 0 },
        { transform: `translate(${dot.x * 0.82}px, ${dot.y * 0.82}px) scale(1)`, opacity: 0.9, offset: 0.62 },
        { transform: `translate(${dot.x}px, ${dot.y}px) scale(0.6)`, opacity: 0, offset: 1 },
      ], { duration: BURST_MS, easing: "linear", fill: "forwards" });
      anim.currentTime = elapsed;
      anims.push(anim);
    } catch {
      node.remove();
    }
  }
  if (!layer.childElementCount) return;
  document.body.append(layer);
  particleLayer = layer;
  particleAnims = anims;
  placeParticles(icon);
}

function placeParticles(icon) {
  if (!particleLayer) return;
  const rect = icon.getBoundingClientRect();
  particleLayer.style.left = `${rect.left + rect.width / 2}px`;
  particleLayer.style.top = `${rect.top + rect.height / 2}px`;
}

function clearParticles() {
  for (const anim of particleAnims) {
    try { anim.cancel(); } catch { /* already finished */ }
  }
  particleAnims = [];
  particleLayer?.remove();
  particleLayer = null;
}

export function installMotion() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerCancel, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("blur", onAbort);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") onAbort();
  });
  try {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener?.("change", () => {
      if (media.matches) onAbort();
      const root = appRoot();
      if (root) syncMotion(root);
    });
  } catch { /* matchMedia is optional */ }
}
