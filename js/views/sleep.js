import { addDays, formatMonthYear, formatPrettyDate, localParts, monthGrid, shiftMonth, weekDayLetters } from "../dates.js";
import { sleepCalendarMark, sleepSessionForDate, evaluateSleep, findOpenSleep } from "../sleep.js";
import { calendar, field, h, monthSwitcher, showToast, topbar } from "../ui.js";

let form = null;

export function renderSleep(ctx) {
  if (ctx.route.name === "sleep-day") return renderSleepDay(ctx);
  form = null;
  return renderSleepHome(ctx);
}

function renderSleepHome(ctx) {
  const open = findOpenSleep(ctx.state.sleepRecords);
  const month = ctx.memory.sleepMonth || monthOf(ctx.today);
  ctx.memory.sleepMonth = month;
  const cells = monthGrid(month.year, month.month, ctx.state.settings.weekStartsOn);
  return h("div", {}, [
    topbar({ title: "Sleep", onSettings: () => ctx.go("/settings") }),
    h("div", { class: "sleep-hero" }, [
      h("p", { class: "clock-xl", dataset: { clock: "1" }, text: localParts(new Date(), ctx.zone).hhmm }),
      h("p", { class: "hint", text: ctx.zone }),
    ]),
    open ? awakePanel(ctx, open) : h("button", {
      class: "sleep-cta",
      onClick: async () => {
        const result = await ctx.actions.sleepBed();
        if (!result.ok) {
          showToast("A bedtime is already open. You can correct it.");
          ctx.go("/sleep/open");
        }
      },
    }, "GO TO SLEEP"),
    latestCard(ctx),
    h("p", { class: "eyebrow", text: "Targets" }),
    targetsForm(ctx),
    h("p", { class: "eyebrow", text: "Month" }),
    monthSwitcher(formatMonthYear(month.year, month.month), () => {
      ctx.memory.sleepMonth = shiftMonth(month.year, month.month, -1);
      ctx.draw();
    }, () => {
      ctx.memory.sleepMonth = shiftMonth(month.year, month.month, 1);
      ctx.draw();
    }),
    calendar({
      cells,
      letters: weekDayLetters(ctx.state.settings.weekStartsOn),
      today: ctx.today,
      marks: (date) => sleepCalendarMark(sleepSessionForDate(ctx.state.sleepRecords, date), date, ctx.today),
      onPick: (date) => ctx.go(`/sleep/${date}`),
    }),
    h("p", { class: "hint", text: "Green passed, red missed a target, grey is unfinished, empty has no record." }),
    h("button", { class: "btn ghost block", style: { marginTop: "12px" }, onClick: () => ctx.go(`/sleep/${ctx.today}`) }, "Add or correct a night"),
  ]);
}

function awakePanel(ctx, open) {
  const label = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: open.bedtimeTz || ctx.zone,
  }).format(new Date(open.bedtimeUtc));
  return h("div", { class: "card" }, [
    h("p", { class: "hint", text: "Bedtime recorded" }),
    h("p", { class: "big-time", text: label }),
    h("p", { class: "hint", text: `${open.bedtimeOffset || ""} · ${open.bedtimeTz || ""}` }),
    h("button", {
      class: "sleep-cta",
      style: { marginTop: "14px" },
      onClick: async () => {
        const result = await ctx.actions.sleepWake();
        if (!result.ok) {
          showToast(result.reason === "wake-date" ? "This wake-up date already has a night." : "Wake time was not saved.");
          if (result.existing?.wakeDate) ctx.go(`/sleep/${result.existing.wakeDate}`);
        }
      },
    }, "I'M AWAKE"),
    h("button", { class: "btn ghost block", style: { marginTop: "8px" }, onClick: () => ctx.go("/sleep/open") }, "Correct bedtime"),
  ]);
}

function latestCard(ctx) {
  const latest = [...ctx.state.sleepRecords].filter((record) => record.wakeDate).sort((a, b) => (a.wakeDate < b.wakeDate ? 1 : -1))[0];
  if (!latest) return h("p", { class: "hint", style: { marginTop: "14px" }, text: "A night is attributed to the morning you wake up." });
  const evaluation = evaluateSleep(latest);
  return h("button", { class: "card", style: { width: "100%", textAlign: "left", marginTop: "14px" }, onClick: () => ctx.go(`/sleep/${latest.wakeDate}`) }, [
    h("p", { class: "hint", text: "Last recorded interval" }),
    h("p", { class: "big-time", text: evaluation.durationLabel || "Incomplete" }),
    h("p", { class: "hint", text: "Recorded interval, not a medical measure." }),
    checks(evaluation),
  ]);
}

function checks(evaluation) {
  if (!evaluation.checks?.length) return h("p", { class: "hint", text: evaluation.win ? "No extra targets were on." : "" });
  return h("div", { class: "checks" }, evaluation.checks.map((check) => h("div", { class: "check" }, [
    h("span", { text: `${check.label} · ${check.detail}` }),
    h("span", { class: check.passed ? "passed" : "unmet", text: check.passed ? "Passed" : "Not met" }),
  ])));
}

function targetsForm(ctx) {
  const targets = ctx.state.settings.sleepTargets;
  const patch = async (partial) => {
    await ctx.actions.updateSettings({ sleepTargets: { ...targets, ...partial } });
  };
  return h("div", { class: "card" }, [
    toggleRow("Latest bedtime", targets.latestBedtimeEnabled, (enabled) => patch({ latestBedtimeEnabled: enabled })),
    targets.latestBedtimeEnabled ? h("input", {
      type: "time",
      value: targets.latestBedtime,
      "aria-label": "Latest bedtime",
      onChange: (event) => patch({ latestBedtime: event.target.value }),
    }) : null,
    toggleRow("Latest wake", targets.latestWakeEnabled, (enabled) => patch({ latestWakeEnabled: enabled })),
    targets.latestWakeEnabled ? h("input", {
      type: "time",
      value: targets.latestWake,
      "aria-label": "Latest wake",
      onChange: (event) => patch({ latestWake: event.target.value }),
    }) : null,
    toggleRow("Minimum time asleep is mandatory", targets.minDurationEnabled, (enabled) => patch({ minDurationEnabled: enabled })),
    targets.minDurationEnabled ? h("div", { class: "two" }, [
      h("input", {
        type: "number",
        min: "0",
        max: "23",
        inputmode: "numeric",
        "aria-label": "Hours",
        value: String(Math.floor((targets.minDurationMinutes || 0) / 60)),
        onChange: (event) => patch({ minDurationMinutes: Number(event.target.value) * 60 + ((targets.minDurationMinutes || 0) % 60) }),
      }),
      h("input", {
        type: "number",
        min: "0",
        max: "59",
        inputmode: "numeric",
        "aria-label": "Minutes",
        value: String((targets.minDurationMinutes || 0) % 60),
        onChange: (event) => patch({ minDurationMinutes: Math.floor((targets.minDurationMinutes || 0) / 60) * 60 + Number(event.target.value) }),
      }),
    ]) : null,
    h("p", { class: "hint", text: "A win needs every target that is switched on. Past nights keep the targets they were recorded with." }),
  ]);
}

function toggleRow(label, on, toggle) {
  return h("div", { class: "switch-row" }, [
    h("span", { text: label }),
    h("button", { type: "button", class: `toggle${on ? " on" : ""}`, "aria-pressed": on ? "true" : "false", onClick: () => toggle(!on) }, [h("i")]),
  ]);
}

function renderSleepDay(ctx) {
  const open = ctx.route.date === "open";
  const record = open
    ? findOpenSleep(ctx.state.sleepRecords)
    : sleepSessionForDate(ctx.state.sleepRecords, ctx.route.date).record;
  if (!form || form.key !== ctx.route.date) {
    form = initialForm(ctx, record);
  }
  const evaluation = record?.wakeUtc ? evaluateSleep(record) : null;
  return h("div", {}, [
    topbar({
      title: open ? "Open night" : formatPrettyDate(ctx.route.date),
      onBack: () => ctx.go("/sleep"),
    }),
    record && !form.editing ? h("div", { class: "card" }, [
      h("div", { class: "time-pair" }, [
        h("div", {}, [h("p", { class: "hint", text: "Bed" }), h("p", { class: "big-time", text: wall(record.bedtimeUtc, record.bedtimeTz) })]),
        h("span", { class: "arrow", text: "→" }),
        h("div", {}, [h("p", { class: "hint", text: "Wake" }), h("p", { class: "big-time", text: record.wakeUtc ? wall(record.wakeUtc, record.wakeTz) : "—" })]),
      ]),
      h("p", { class: "hint", text: `${record.bedtimeOffset || ""} ${record.bedtimeTz || ""}`.trim() }),
      evaluation ? h("p", { class: "big-time", style: { marginTop: "10px" }, text: evaluation.durationLabel || "Incomplete" }) : h("p", { class: "hint", text: "Incomplete. No duration is invented." }),
      evaluation ? checks(evaluation) : null,
      record.note ? h("p", { class: "note-body", text: record.note }) : null,
      record.corrected ? h("p", { class: "hint", text: "Corrected" }) : null,
      h("div", { class: "correct-row" }, [
        h("button", { class: "btn ghost small", onClick: () => { form.editing = true; ctx.draw(); } }, "Correct"),
        h("button", {
          class: "btn danger small",
          onClick: () => ctx.confirm({
            title: "Delete this night?",
            text: "The sleep record is removed. A sleep goal will be scored again without it.",
            confirmLabel: "Delete night",
            danger: true,
            onConfirm: async () => {
              await ctx.actions.deleteSleep(record.id);
              ctx.closeModal();
              ctx.go("/sleep");
            },
          }),
        }, "Delete"),
      ]),
    ]) : sleepForm(ctx, record),
  ]);
}

function sleepForm(ctx, record) {
  return h("form", {
    class: "card",
    onSubmit: async (event) => {
      event.preventDefault();
      const result = await ctx.actions.saveSleepManual({
        id: record?.id,
        bedDate: form.bedDate,
        bedTime: form.bedTime,
        wakeDate: form.wakeDate,
        wakeTime: form.wakeTime,
        note: form.note,
        timeZone: form.timeZone,
      });
      if (!result.ok) {
        form.error = result.reason === "order"
          ? "Wake time needs to be after bedtime."
          : result.reason === "wake-date"
            ? "That wake-up date already has a night."
            : result.reason === "open"
              ? "Finish or delete the open bedtime first."
              : "Check the date and time.";
        ctx.draw();
        return;
      }
      showToast(record?.wakeUtc ? "Corrected" : "Saved");
      ctx.go(`/sleep/${result.record.wakeDate}`);
    },
  }, [
    h("p", { class: "hint", text: `Times are read in ${form.timeZone}.` }),
    form.error ? h("p", { class: "error", text: form.error }) : null,
    field("Bed date", h("input", { type: "date", required: true, value: form.bedDate, onInput: (event) => { form.bedDate = event.target.value; } })),
    field("Bed time", h("input", { type: "time", required: true, value: form.bedTime, onInput: (event) => { form.bedTime = event.target.value; } })),
    field("Wake date", h("input", { type: "date", required: true, value: form.wakeDate, onInput: (event) => { form.wakeDate = event.target.value; } })),
    field("Wake time", h("input", { type: "time", required: true, value: form.wakeTime, onInput: (event) => { form.wakeTime = event.target.value; } })),
    field("Note", h("textarea", { placeholder: "Optional", value: form.note, onInput: (event) => { form.note = event.target.value; } })),
    record?.targets ? h("p", { class: "hint", text: targetLine(record.targets) }) : null,
    h("button", { class: "btn primary block", type: "submit", style: { marginTop: "12px" } }, record ? "Save correction" : "Save night"),
  ]);
}

function initialForm(ctx, record) {
  const zone = record?.wakeTz || record?.bedtimeTz || ctx.zone;
  const bed = record?.bedtimeUtc ? localParts(new Date(record.bedtimeUtc), record.bedtimeTz || zone) : null;
  const wake = record?.wakeUtc ? localParts(new Date(record.wakeUtc), record.wakeTz || zone) : null;
  const wakeDate = ctx.route.date === "open" ? ctx.today : ctx.route.date;
  return {
    key: ctx.route.date,
    editing: !record || !record.wakeUtc,
    bedDate: bed?.isoDate || addDays(wakeDate, -1),
    bedTime: bed?.hhmm || "23:00",
    wakeDate: wake?.isoDate || wakeDate,
    wakeTime: wake?.hhmm || "07:00",
    note: record?.note || "",
    timeZone: zone,
    error: "",
  };
}

function wall(utc, timeZone) {
  if (!utc) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timeZone || "UTC",
  }).format(new Date(utc));
}

function targetLine(targets) {
  const parts = [];
  if (targets.latestBedtimeEnabled) parts.push(`bed by ${targets.latestBedtime}`);
  if (targets.latestWakeEnabled) parts.push(`wake by ${targets.latestWake}`);
  if (targets.minDurationEnabled) {
    const hours = Math.floor(targets.minDurationMinutes / 60);
    const minutes = targets.minDurationMinutes % 60;
    parts.push(`at least ${hours}h ${minutes}m`);
  }
  return parts.length ? `Targets stored with this night: ${parts.join(", ")}.` : "No extra targets were stored with this night.";
}

function monthOf(iso) {
  const [year, month] = iso.split("-").map(Number);
  return { year, month };
}

export { checks };
