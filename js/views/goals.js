import { formatPrettyDate, weekDayLetters, weekMeta } from "../dates.js";
import { validateGoalConfig } from "../scoring.js";
import { buildGoalWeek, goalStats, milestoneCards } from "../selectors.js";
import { blankGoal, fileToImageBlob, uid } from "../store.js";
import { ICON_CHOICES, h, imageUrl, renderTodayAction, seriesCard, showToast, topbar } from "../ui.js";

let editor = null;

export function renderGoals(ctx) {
  if (ctx.route.name === "goal-edit") return renderEditor(ctx);
  editor = null;
  if (ctx.route.name === "goal") return renderDetail(ctx);
  return renderList(ctx);
}

function renderList(ctx) {
  const groups = [
    ["Active", ctx.state.goals.filter((goal) => goal.status === "active")],
    ["Paused", ctx.state.goals.filter((goal) => goal.status === "paused")],
    ["Archived", ctx.state.goals.filter((goal) => goal.status === "archived")],
  ];
  return h("div", {}, [
    topbar({ title: "Goals", onSettings: () => ctx.go("/settings") }),
    ctx.state.goals.length ? null : h("p", { class: "muted", text: "Each goal keeps its own series. Nothing here is combined into one score." }),
    ...groups.map(([label, goals]) => goals.length ? h("section", {}, [
      h("p", { class: "eyebrow", text: label }),
      h("div", { class: "list" }, goals.map((goal) => goalRow(ctx, goal))),
    ]) : null),
    h("button", { class: "btn primary block", style: { marginTop: "18px" }, onClick: () => ctx.go("/goals/new") }, "Add a goal"),
  ]);
}

function goalRow(ctx, goal) {
  const weekStart = weekMeta(ctx.today, ctx.state.settings.weekStartsOn).start;
  const week = buildGoalWeek(goal, ctx.state, weekStart, ctx.today, ctx.now);
  return h("button", { class: "list-row", onClick: () => ctx.go(`/goals/${goal.id}`) }, [
    h("span", { class: "emoji", text: goal.icon || "•" }),
    h("span", { class: "grow" }, [
      h("strong", { text: goal.name }),
      h("span", { class: "sub", text: `${goal.weeklyTarget} to win the week` }),
    ]),
    h("span", { class: "row-score", text: goal.status === "active" ? week.result.score : goal.status }),
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
        goal.status === "active" ? renderTodayAction(ctx, goal, week) : h("span", { class: "pill", text: goal.status }),
      ]),
    }),
    goal.description ? h("p", { class: "muted", style: { marginTop: "14px" }, text: goal.description }) : null,
    goal.notes ? h("p", { class: "note-body", text: goal.notes }) : null,
    h("div", { class: "stats", style: { marginTop: "16px" } }, [
      stat(String(stats.totalWon), "Weeks won"),
      stat(String(stats.totalLost), "Weeks closed"),
      stat(String(stats.currentStreak), "Current streak"),
      stat(String(stats.longestStreak), "Longest streak"),
    ]),
    week.snapshot.reward ? rewardBlock(week) : null,
    milestones.length ? h("section", {}, [
      h("p", { class: "eyebrow", text: "Milestones" }),
      h("div", { class: "stack" }, milestones.map(({ milestone, progress }) => h("div", { class: "card" }, [
        h("strong", { text: milestone.kind === "consecutive" ? "Consecutive series" : "Total series" }),
        h("p", { class: "hint", text: `${progress.current} / ${progress.required} · ${progress.remaining} remaining` }),
        milestone.rewardDescription ? h("p", { style: { marginTop: "8px" }, text: milestone.rewardDescription }) : null,
      ]))),
    ]) : null,
    h("div", { class: "stack", style: { marginTop: "18px" } }, [
      h("button", { class: "btn primary block", onClick: () => ctx.go(`/goals/${goal.id}/edit`) }, "Edit"),
      goal.status === "active"
        ? h("button", { class: "btn ghost block", onClick: () => ctx.actions.setGoalMode(goal.id, "pause") }, "Pause")
        : h("button", { class: "btn ghost block", onClick: () => ctx.actions.setGoalMode(goal.id, "active") }, goal.status === "archived" ? "Reactivate" : "Resume"),
      goal.status !== "archived"
        ? h("button", { class: "btn ghost block", onClick: () => ctx.actions.setGoalMode(goal.id, "archive") }, "Archive")
        : null,
      h("button", {
        class: "btn danger block",
        onClick: () => ctx.confirm({
          title: `Delete ${goal.name}?`,
          text: "The goal, its days, and its rewards are removed. Sleep nights and journal notes stay.",
          confirmLabel: "Delete goal",
          danger: true,
          onConfirm: async () => {
            await ctx.actions.deleteGoal(goal.id);
            ctx.closeModal();
            ctx.go("/goals");
          },
        }),
      }, "Delete"),
    ]),
  ]);
}

function rewardBlock(week) {
  const reward = week.snapshot.reward;
  return h("section", {}, [
    h("p", { class: "eyebrow", text: "This week's reward" }),
    h("div", { class: `card reward ${week.rewardStatus || "locked"}` }, [
      h("p", { class: "status-line", text: (week.rewardStatus || "locked").toUpperCase() }),
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
  return h("form", {
    onSubmit: (event) => {
      event.preventDefault();
      save(ctx);
    },
  }, [
    topbar({
      title: existing ? "Edit goal" : "New goal",
      onBack: () => ctx.go(existing ? `/goals/${existing.id}` : "/goals"),
    }),
    editor.error ? h("p", { class: "error", text: editor.error }) : null,
    fieldLive("Name", "name", goal.name, (value) => { goal.name = value; }),
    fieldLive("Description", "description", goal.description, (value) => { goal.description = value; }, true),
    h("p", { class: "field-label", style: { marginTop: "16px" }, text: "Icon" }),
    h("div", { class: "icon-grid" }, ICON_CHOICES.map((emoji) => h("button", {
      type: "button",
      class: `icon-choice${goal.icon === emoji ? " on" : ""}`,
      onClick: () => { goal.icon = emoji; ctx.draw(); },
    }, emoji))),
    fieldLive("Or type an emoji", "icon", goal.icon, (value) => { goal.icon = value; }),
    photoField(ctx, "Goal photo", goal.imageId, "image"),
    h("div", { class: "spread", style: { marginTop: "16px" } }, [
      h("div", {}, [
        h("p", { class: "field-label", text: "Weekly win target" }),
        h("p", { class: "score", text: String(goal.weeklyTarget) }),
      ]),
      h("div", { class: "correct-row" }, [
        h("button", { type: "button", class: "btn ghost", onClick: () => stepTarget(ctx, -1) }, "−"),
        h("button", { type: "button", class: "btn ghost", onClick: () => stepTarget(ctx, 1) }, "+"),
      ]),
    ]),
    h("p", { class: "field-label", style: { marginTop: "8px" }, text: "How a day is won" }),
    h("div", { class: "seg" }, [
      ["manual", "Confirm"],
      ["timer", "Timer"],
      ["threshold", "Count"],
      ["sleep", "Sleep"],
    ].map(([value, label]) => h("button", {
      type: "button",
      class: goal.completionMethod === value ? "on" : "",
      onClick: () => { goal.completionMethod = value; ctx.draw(); },
    }, label))),
    goal.completionMethod === "timer" ? fieldLive("Minutes", "minutes", String(goal.timerDurationMinutes || ""), (value) => { goal.timerDurationMinutes = Number(value); }, false, "number") : null,
    goal.completionMethod === "threshold" ? h("div", { class: "two" }, [
      fieldLive("What you count", "count", goal.thresholdLabel || "", (value) => { goal.thresholdLabel = value; }),
      fieldLive("How many", "countTarget", String(goal.thresholdTarget ?? ""), (value) => { goal.thresholdTarget = Number(value); }, false, "number"),
    ]) : null,
    goal.completionMethod === "sleep" ? h("p", { class: "hint", text: "Wins come from the Sleep tab. This goal only adds a weekly target." }) : null,
    h("p", { class: "field-label", style: { marginTop: "16px" }, text: "Rest days" }),
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
    check.ok ? h("p", { class: "hint", text: `${check.playable} playable days. The target stays reachable.` }) : h("p", { class: "error", text: check.reason }),
    h("div", { class: "switch-row", style: { marginTop: "12px" } }, [
      h("span", { text: "Reminder" }),
      h("button", {
        type: "button",
        class: `toggle${goal.reminder?.enabled ? " on" : ""}`,
        "aria-pressed": goal.reminder?.enabled ? "true" : "false",
        onClick: () => {
          goal.reminder = { ...(goal.reminder || { time: "21:00" }), enabled: !goal.reminder?.enabled };
          ctx.draw();
        },
      }, [h("i")]),
    ]),
    goal.reminder?.enabled ? fieldLive("Time", "reminder", goal.reminder.time || "21:00", (value) => { goal.reminder.time = value; }, false, "time") : null,
    goal.reminder?.enabled ? h("p", { class: "hint", text: "On iPhone this can only appear while B4O7 is open." }) : null,
    fieldLive("Notes", "notes", goal.notes || "", (value) => { goal.notes = value; }, true),
    h("p", { class: "eyebrow", text: "Weekly reward" }),
    fieldLive("Reward name", "rewardName", goal.weeklyReward?.name || "", (value) => { goal.weeklyReward.name = value; }),
    fieldLive("Reward description", "rewardDescription", goal.weeklyReward?.description || "", (value) => { goal.weeklyReward.description = value; }, true),
    fieldLive("Estimated price", "price", goal.weeklyReward?.priceLabel || "", (value) => { goal.weeklyReward.priceLabel = value; }),
    photoField(ctx, "Reward photo", goal.weeklyReward?.imageId, "reward"),
    h("p", { class: "hint", text: "Leave the name blank if this goal has no weekly reward. A missed week starts a consecutive count over. Totals stay." }),
    h("p", { class: "eyebrow", text: "Milestones" }),
    h("div", { class: "stack" }, editor.milestones.map((milestone, index) => h("div", { class: "card" }, [
      h("div", { class: "seg" }, [
        h("button", { type: "button", class: milestone.kind === "consecutive" ? "on" : "", onClick: () => { milestone.kind = "consecutive"; ctx.draw(); } }, "Consecutive"),
        h("button", { type: "button", class: milestone.kind === "total" ? "on" : "", onClick: () => { milestone.kind = "total"; ctx.draw(); } }, "Total"),
      ]),
      fieldLive("Weeks", `ms-${index}`, String(milestone.required), (value) => { milestone.required = Number(value); }, false, "number"),
      fieldLive("Reward", `msd-${index}`, milestone.rewardDescription || "", (value) => { milestone.rewardDescription = value; }),
      h("button", { type: "button", class: "btn ghost small", onClick: () => { editor.milestones.splice(index, 1); ctx.draw(); } }, "Remove"),
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
    }, "Add milestone"),
    h("button", { class: "btn primary block", style: { marginTop: "18px" }, type: "submit" }, "Save goal"),
  ]);
}

function fieldLive(label, name, value, onValue, area = false, type = "text") {
  const control = area
    ? h("textarea", { name, "data-live": "text", value, onInput: (event) => onValue(event.target.value) })
    : h("input", { name, type, "data-live": "text", value, onInput: (event) => onValue(event.target.value) });
  return h("label", { class: "field" }, [h("span", { class: "field-label", text: label }), control]);
}

function photoField(ctx, label, imageId, key) {
  const preview = editor.previews[key] || imageUrl(ctx.state, imageId);
  return h("div", { class: "field" }, [
    h("span", { class: "field-label", text: label }),
    preview ? h("img", { class: "photo-preview", alt: "", src: preview }) : null,
    h("input", {
      type: "file",
      accept: "image/*",
      onChange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const blob = await fileToImageBlob(file);
        editor.previews[key] = URL.createObjectURL(blob);
        editor.files = editor.files || {};
        editor.files[key] = blob;
        ctx.draw();
      },
    }),
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
  showToast("Saved");
  editor = null;
  ctx.go(`/goals/${result.id}`);
}

function stat(num, label) {
  return h("div", { class: "stat" }, [h("p", { class: "stat-num", text: num }), h("p", { text: label })]);
}

function missing(ctx) {
  return h("div", {}, [
    topbar({ title: "Goal", onBack: () => ctx.go("/goals") }),
    h("p", { class: "muted", text: "That goal is not on this device." }),
  ]);
}
