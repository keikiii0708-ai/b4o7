import { formatPrettyDate, weekDayLetters, weekMeta } from "../dates.js";
import { getLocale, goalStatusLabel, rewardStatusLabel, t } from "../i18n.js";
import { validateGoalConfig } from "../scoring.js";
import { buildGoalWeek, goalStats, milestoneCards } from "../selectors.js";
import { blankGoal, fileToImageBlob, uid } from "../store.js";
import { ICON_CHOICES, h, imageUrl, progressRing, renderTodayAction, seriesCard, sheetFrame, showToast, topbar } from "../ui.js";

let editor = null;

export function renderGoals(ctx) {
  if (ctx.route.name === "goal-edit") {
    const missingGoal = ctx.route.id && !ctx.state.goals.some((goal) => goal.id === ctx.route.id);
    if (missingGoal) return renderEditor(ctx);
    const under = ctx.route.id ? renderDetail(ctx) : renderList(ctx);
    return h("div", {}, [under, renderEditor(ctx)]);
  }
  editor = null;
  if (ctx.route.name === "goal") return renderDetail(ctx);
  return renderList(ctx);
}

function renderList(ctx) {
  const groups = [
    ["active", ctx.state.goals.filter((goal) => goal.status === "active")],
    ["paused", ctx.state.goals.filter((goal) => goal.status === "paused")],
    ["archived", ctx.state.goals.filter((goal) => goal.status === "archived")],
  ];
  return h("div", {}, [
    topbar({ title: t("title.goals"), onSettings: () => ctx.go("/settings") }),
    ctx.state.goals.length ? null : h("p", { class: "muted", text: t("goal.empty") }),
    ...groups.map(([status, goals]) => goals.length ? h("section", {}, [
      h("p", { class: "eyebrow", text: goalStatusLabel(status) }),
      h("div", { class: "list" }, goals.map((goal) => goalRow(ctx, goal))),
    ]) : null),
    h("button", { class: "btn primary block", style: { marginTop: "18px" }, onClick: () => ctx.go("/goals/new") }, t("goal.add")),
  ]);
}

function goalRow(ctx, goal) {
  const weekStart = weekMeta(ctx.today, ctx.state.settings.weekStartsOn).start;
  const week = buildGoalWeek(goal, ctx.state, weekStart, ctx.today, ctx.now);
  return h("button", { class: "list-row", onClick: () => ctx.go(`/goals/${goal.id}`) }, [
    h("span", { class: "emoji", text: goal.icon || "•" }),
    h("span", { class: "grow" }, [
      h("strong", { text: goal.name }),
      h("span", { class: "sub", text: t("goal.toWin", { count: goal.weeklyTarget }) }),
    ]),
    h("span", { class: "row-trail" }, [
      progressRing(week.dayStates, { size: 32, hidden: true }),
      goal.status === "active"
        ? h("span", { class: "row-score", "data-metric-key": `row:${goal.id}`, text: week.result.score })
        : h("span", { class: "row-score", text: goalStatusLabel(goal.status) }),
    ]),
  ]);
}

function renderDetail(ctx) {
  const goal = ctx.state.goals.find((item) => item.id === ctx.route.id);
  if (!goal) return missing(ctx);
  const weekStart = weekMeta(ctx.today, ctx.state.settings.weekStartsOn).start;
  const week = buildGoalWeek(goal, ctx.state, weekStart, ctx.today, ctx.now);
  const stats = goalStats(goal, ctx.state, ctx.today, ctx.now).stats;
  const milestones = milestoneCards(goal, ctx.state, ctx.today, ctx.now);
  const photo = imageUrl(ctx.state, goal.imageId);
  return h("div", {}, [
    topbar({ title: goal.name, onBack: () => ctx.go("/goals"), onSettings: () => ctx.go("/settings") }),
    photo ? h("img", { class: "reward-photo", alt: "", src: photo }) : null,
    seriesCard({
      goal,
      week,
      weekStartsOn: ctx.state.settings.weekStartsOn,
      featured: true,
      onOpen: null,
      footer: h("div", { class: "spread", style: { padding: "12px 8px 4px" } }, [
        h("span", { class: "hint", text: formatPrettyDate(ctx.today) }),
        goal.status === "active" ? renderTodayAction(ctx, goal, week) : h("span", { class: "pill", text: goalStatusLabel(goal.status) }),
      ]),
    }),
    goal.description ? h("p", { class: "muted", style: { marginTop: "14px" }, text: goal.description }) : null,
    goal.notes ? h("p", { class: "note-body", text: goal.notes }) : null,
    h("div", { class: "stats", style: { marginTop: "16px" } }, [
      stat(String(stats.totalWon), t("goal.weeksWon"), `stat:${goal.id}:won`),
      stat(String(stats.totalLost), t("goal.weeksClosed"), `stat:${goal.id}:lost`),
      stat(String(stats.currentStreak), t("goal.currentStreak"), `stat:${goal.id}:streak`),
      stat(String(stats.longestStreak), t("goal.longestStreak"), `stat:${goal.id}:best`),
    ]),
    week.snapshot.reward ? rewardBlock(week) : null,
    milestones.length ? h("section", {}, [
      h("p", { class: "eyebrow", text: t("goal.milestones") }),
      h("div", { class: "stack" }, milestones.map(({ milestone, progress }) => h("div", { class: "card" }, [
        h("strong", { text: milestone.kind === "consecutive" ? t("goal.consecutiveSeries") : t("goal.totalSeries") }),
        h("p", {
          class: "hint",
          "data-metric-key": `progress:${milestone.id}`,
          text: t("goal.progress", { current: progress.current, required: progress.required, remaining: progress.remaining }),
        }),
        milestone.rewardDescription ? h("p", { style: { marginTop: "8px" }, text: milestone.rewardDescription }) : null,
      ]))),
    ]) : null,
    h("div", { class: "stack", style: { marginTop: "18px" } }, [
      h("button", { class: "btn primary block", onClick: () => ctx.go(`/goals/${goal.id}/edit`) }, t("goal.edit")),
      goal.status === "active"
        ? h("button", { class: "btn ghost block", onClick: () => ctx.actions.setGoalMode(goal.id, "pause") }, t("goal.pause"))
        : h("button", { class: "btn ghost block", onClick: () => ctx.actions.setGoalMode(goal.id, "active") }, goal.status === "archived" ? t("goal.reactivate") : t("goal.resume")),
      goal.status !== "archived"
        ? h("button", { class: "btn ghost block", onClick: () => ctx.actions.setGoalMode(goal.id, "archive") }, t("goal.archive"))
        : null,
      h("button", {
        class: "btn danger block",
        onClick: () => ctx.confirm({
          title: t("goal.deleteTitle", { name: goal.name }),
          text: t("goal.deleteText"),
          confirmLabel: t("goal.deleteGoal"),
          danger: true,
          onConfirm: async () => {
            await ctx.actions.deleteGoal(goal.id);
            ctx.closeModal();
            ctx.go("/goals");
          },
        }),
      }, t("goal.delete")),
    ]),
  ]);
}

function rewardBlock(week) {
  const reward = week.snapshot.reward;
  return h("section", {}, [
    h("p", { class: "eyebrow", text: t("goal.thisReward") }),
    h("div", { class: `card reward ${week.rewardStatus || "locked"}` }, [
      h("p", { class: "status-line", text: rewardStatusLabel(week.rewardStatus || "locked") }),
      h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: reward.name }),
      reward.description ? h("p", { class: "muted", style: { marginTop: "6px" }, text: reward.description }) : null,
      reward.priceLabel ? h("p", { class: "price", text: reward.priceLabel }) : null,
    ]),
  ]);
}

function renderEditor(ctx) {
  const existing = ctx.route.id ? ctx.state.goals.find((goal) => goal.id === ctx.route.id) : null;
  if (ctx.route.id && !existing) return missing(ctx);
  if (!editor || editor.key !== (ctx.route.id || "new")) {
    const goal = existing ? structuredClone(existing) : blankGoal();
    if (!existing && getLocale() === "zh" && goal.thresholdLabel === "pages") goal.thresholdLabel = "页";
    editor = {
      key: ctx.route.id || "new",
      goal,
      milestones: ctx.state.milestones.filter((item) => item.goalId === goal.id).map((item) => ({ ...item })),
      error: "",
      previews: {},
    };
  }
  const goal = editor.goal;
  const check = validateGoalConfig({ weeklyTarget: Number(goal.weeklyTarget), restDays: goal.restDays });
  const letters = weekDayLetters(ctx.state.settings.weekStartsOn);
  const start = ctx.state.settings.weekStartsOn === "sunday" ? 0 : 1;
  const close = () => ctx.go(existing ? `/goals/${existing.id}` : "/goals");
  return sheetFrame({
    title: existing ? t("goal.editTitle") : t("goal.newTitle"),
    onClose: close,
    children: h("form", {
      class: "sheet-form",
      onSubmit: (event) => {
        event.preventDefault();
        save(ctx);
      },
    }, [
    editor.error ? h("p", { class: "error", text: editor.error }) : null,
    fieldLive(t("goal.name"), "name", goal.name, (value) => { goal.name = value; }),
    fieldLive(t("goal.description"), "description", goal.description, (value) => { goal.description = value; }, true),
    h("p", { class: "field-label", style: { marginTop: "16px" }, text: t("goal.icon") }),
    h("div", { class: "icon-grid" }, ICON_CHOICES.map((emoji) => h("button", {
      type: "button",
      class: `icon-choice${goal.icon === emoji ? " on" : ""}`,
      onClick: () => { goal.icon = emoji; ctx.draw(); },
    }, emoji))),
    fieldLive(t("goal.emoji"), "icon", goal.icon, (value) => { goal.icon = value; }),
    photoField(ctx, t("goal.photo"), goal.imageId, "image"),
    h("div", { class: "spread", style: { marginTop: "16px" } }, [
      h("div", {}, [
        h("p", { class: "field-label", text: t("goal.weeklyTarget") }),
        h("p", { class: "score", "data-metric-key": `target:${goal.id}`, text: String(goal.weeklyTarget) }),
      ]),
      h("div", { class: "correct-row" }, [
        h("button", { type: "button", class: "btn ghost", "aria-label": t("action.decrease"), onClick: () => stepTarget(ctx, -1) }, "−"),
        h("button", { type: "button", class: "btn ghost", "aria-label": t("action.increase"), onClick: () => stepTarget(ctx, 1) }, "+"),
      ]),
    ]),
    h("p", { class: "field-label", style: { marginTop: "8px" }, text: t("goal.howWon") }),
    h("div", { class: "seg" }, [
      ["manual", t("goal.confirm")],
      ["timer", t("goal.timer")],
      ["threshold", t("goal.count")],
      ["sleep", t("goal.sleep")],
    ].map(([value, label]) => h("button", {
      type: "button",
      class: goal.completionMethod === value ? "on" : "",
      onClick: () => { goal.completionMethod = value; ctx.draw(); },
    }, label))),
    goal.completionMethod === "timer" ? fieldLive(t("goal.minutes"), "minutes", String(goal.timerDurationMinutes || ""), (value) => { goal.timerDurationMinutes = Number(value); }, false, "number") : null,
    goal.completionMethod === "threshold" ? h("div", { class: "two" }, [
      fieldLive(t("goal.countWhat"), "count", goal.thresholdLabel || "", (value) => { goal.thresholdLabel = value; }),
      fieldLive(t("goal.howMany"), "countTarget", String(goal.thresholdTarget ?? ""), (value) => { goal.thresholdTarget = Number(value); }, false, "number"),
    ]) : null,
    goal.completionMethod === "sleep" ? h("p", { class: "hint", text: t("goal.sleepHint") }) : null,
    h("p", { class: "field-label", style: { marginTop: "16px" }, text: t("goal.rest") }),
    h("div", { class: "seg" }, letters.map((letter, index) => {
      const weekday = (start + index) % 7;
      const on = goal.restDays.includes(weekday);
      return h("button", {
        type: "button",
        class: on ? "on" : "",
        onClick: () => {
          goal.restDays = on ? goal.restDays.filter((day) => day !== weekday) : [...goal.restDays, weekday];
          ctx.draw();
        },
      }, letter);
    })),
    check.ok ? h("p", { class: "hint", text: t("error.playable", { count: check.playable }) }) : h("p", { class: "error", text: check.reason }),
    h("div", { class: "switch-row", style: { marginTop: "12px" } }, [
      h("span", { text: t("goal.reminder") }),
      h("button", {
        type: "button",
        class: `toggle${goal.reminder?.enabled ? " on" : ""}`,
        "data-switch-key": "goal-reminder",
        "aria-pressed": goal.reminder?.enabled ? "true" : "false",
        onClick: () => {
          goal.reminder = { ...(goal.reminder || { time: "21:00" }), enabled: !goal.reminder?.enabled };
          ctx.draw();
        },
      }, [h("i")]),
    ]),
    goal.reminder?.enabled ? fieldLive(t("goal.time"), "reminder", goal.reminder.time || "21:00", (value) => { goal.reminder.time = value; }, false, "time") : null,
    goal.reminder?.enabled ? h("p", { class: "hint", text: t("goal.reminderHint") }) : null,
    fieldLive(t("goal.notes"), "notes", goal.notes || "", (value) => { goal.notes = value; }, true),
    h("p", { class: "eyebrow", text: t("goal.weeklyReward") }),
    fieldLive(t("goal.rewardName"), "rewardName", goal.weeklyReward?.name || "", (value) => { goal.weeklyReward.name = value; }),
    fieldLive(t("goal.rewardDescription"), "rewardDescription", goal.weeklyReward?.description || "", (value) => { goal.weeklyReward.description = value; }, true),
    fieldLive(t("goal.price"), "price", goal.weeklyReward?.priceLabel || "", (value) => { goal.weeklyReward.priceLabel = value; }),
    photoField(ctx, t("goal.rewardPhoto"), goal.weeklyReward?.imageId, "reward"),
    h("p", { class: "hint", text: t("goal.rewardHint") }),
    h("p", { class: "eyebrow", text: t("goal.milestones") }),
    h("div", { class: "stack" }, editor.milestones.map((milestone, index) => h("div", { class: "card" }, [
      h("div", { class: "seg" }, [
        h("button", { type: "button", class: milestone.kind === "consecutive" ? "on" : "", onClick: () => { milestone.kind = "consecutive"; ctx.draw(); } }, t("goal.consecutive")),
        h("button", { type: "button", class: milestone.kind === "total" ? "on" : "", onClick: () => { milestone.kind = "total"; ctx.draw(); } }, t("goal.total")),
      ]),
      fieldLive(t("goal.weeks"), `ms-${index}`, String(milestone.required), (value) => { milestone.required = Number(value); }, false, "number"),
      fieldLive(t("goal.reward"), `msd-${index}`, milestone.rewardDescription || "", (value) => { milestone.rewardDescription = value; }),
      h("button", { type: "button", class: "btn ghost small", onClick: () => { editor.milestones.splice(index, 1); ctx.draw(); } }, t("goal.remove")),
    ]))),
    h("button", {
      type: "button",
      class: "btn ghost block",
      onClick: () => {
        editor.milestones.push({
          id: uid(),
          goalId: goal.id,
          kind: "consecutive",
          required: 4,
          rewardDescription: "",
          unlockedAt: null,
          claimedAt: null,
        });
        ctx.draw();
      },
    }, t("goal.addMilestone")),
    h("button", { class: "btn primary block", style: { marginTop: "18px" }, type: "submit" }, t("goal.save")),
    ]),
  });
}

function fieldLive(label, name, value, onValue, area = false, type = "text") {
  const control = area
    ? h("textarea", { name, "data-live": "text", value, onInput: (event) => onValue(event.target.value) })
    : h("input", { name, type, "data-live": "text", value, onInput: (event) => onValue(event.target.value) });
  return h("label", { class: "field" }, [h("span", { class: "field-label", text: label }), control]);
}

function photoField(ctx, label, imageId, key) {
  const preview = editor.previews[key] || imageUrl(ctx.state, imageId);
  const input = h("input", {
    class: "file-input",
    type: "file",
    accept: "image/*",
    "aria-label": label,
    onChange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const blob = await fileToImageBlob(file);
      editor.previews[key] = URL.createObjectURL(blob);
      editor.files = editor.files || {};
      editor.files[key] = blob;
      ctx.draw();
    },
  });
  return h("div", { class: "field" }, [
    h("span", { class: "field-label", text: label }),
    preview ? h("img", { class: "photo-preview", alt: "", src: preview }) : null,
    input,
    h("button", { type: "button", class: "btn ghost block", onClick: () => input.click() }, t("goal.choosePhoto")),
  ]);
}

function stepTarget(ctx, delta) {
  const next = Math.min(7, Math.max(1, Number(editor.goal.weeklyTarget) + delta));
  editor.goal.weeklyTarget = next;
  ctx.draw();
}

async function save(ctx) {
  const goal = { ...editor.goal, weeklyReward: { ...editor.goal.weeklyReward } };
  if (editor.files?.image) goal.imageId = await ctx.actions.saveImage(editor.files.image, "image/jpeg", { silent: true });
  if (editor.files?.reward) goal.weeklyReward.imageId = await ctx.actions.saveImage(editor.files.reward, "image/jpeg", { silent: true });
  const result = await ctx.actions.saveGoal(goal, editor.milestones);
  if (!result.ok) {
    editor.error = result.reason;
    ctx.draw();
    return;
  }
  showToast(t("toast.saved"));
  editor = null;
  ctx.go(`/goals/${result.id}`);
}

function stat(num, label, key) {
  const numAttrs = { class: "stat-num", text: num };
  if (key) numAttrs["data-metric-key"] = key;
  return h("div", { class: "stat" }, [h("p", numAttrs), h("p", { text: label })]);
}

function missing(ctx) {
  return h("div", {}, [
    topbar({ title: t("title.goal"), onBack: () => ctx.go("/goals") }),
    h("p", { class: "muted", text: t("goal.missing") }),
  ]);
}
