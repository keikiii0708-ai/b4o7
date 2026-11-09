import { addDays, formatMonthYear, formatPrettyDate, localParts, monthGrid, shiftMonth, weekDayLetters } from "../dates.js";
import { displayDuration, intlLocale, t } from "../i18n.js";
import { sleepCalendarMark, sleepSessionForDate, evaluateSleep, findOpenSleep } from "../sleep.js";
import { armCheck } from "../motion.js";
import { calendar, checkMark, field, h, monthSwitcher, sheetFrame, showToast, topbar } from "../ui.js";

let form = null;

export function renderSleep(ctx) {
  if (ctx.route.name !== "sleep-day") form = null;
  const home = renderSleepHome(ctx);
  if (ctx.route.name !== "sleep-day") return home;
  return h("div", {}, [home, renderSleepDay(ctx)]);
}

function renderSleepHome(ctx) {
  const open = findOpenSleep(ctx.state.sleepRecords);
  const month = ctx.memory.sleepMonth || monthOf(ctx.today);
  ctx.memory.sleepMonth = month;
  const cells = monthGrid(month.year, month.month, ctx.state.settings.weekStartsOn);
  return h("div", {}, [
    topbar({ title: t("title.sleep"), onSettings: () => ctx.go("/settings") }),
    h("div", { class: "sleep-hero" }, [
      h("p", { class: "eyebrow", text: t("sleep.now") }),
      h("p", { class: "clock-xl", dataset: { clock: "1" }, text: localParts(new Date(), ctx.zone).hhmm }),
      h("p", { class: "hint", text: open ? t("sleep.nightOpen") : ctx.zone }),
    ]),
    open ? awakePanel(ctx, open) : h("button", {
      class: "sleep-cta",
      onClick: async () => {
        const result = await ctx.actions.sleepBed();
        if (!result.ok) {
          showToast(t("toast.bedtimeOpen"));
          ctx.go("/sleep/open");
        }
      },
    }, t("sleep.goToSleep")),
    latestCard(ctx),
    h("p", { class: "eyebrow", text: t("sleep.targets") }),
    targetsForm(ctx),
    h("p", { class: "eyebrow", text: t("sleep.month") }),
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
    h("p", { class: "hint", text: t("sleep.legend") }),
    h("button", { class: "btn ghost block", style: { marginTop: "12px" }, onClick: () => ctx.go(`/sleep/${ctx.today}`) }, t("sleep.addNight")),
  ]);
}

function awakePanel(ctx, open) {
  const label = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: open.bedtimeTz || ctx.zone,
  }).format(new Date(open.bedtimeUtc));
  return h("div", { class: "sleep-awake" }, [
    h("p", { class: "hint", text: `${t("home.inBed", { time: label })} · ${open.bedtimeOffset || ""} ${open.bedtimeTz || ""}`.replace(/\s+/g, " ").trim() }),
    h("button", {
      class: "sleep-cta",
      onClick: async () => {
        const result = await ctx.actions.sleepWake();
        if (!result.ok) {
          showToast(result.reason === "wake-date" ? t("sleep.wakeHasNight") : t("toast.wakeNotSaved"));
          if (result.existing?.wakeDate) ctx.go(`/sleep/${result.existing.wakeDate}`);
        }
      },
    }, t("home.awake")),
    h("button", { class: "btn ghost block", onClick: () => ctx.go("/sleep/open") }, t("sleep.correctBedtime")),
  ]);
}

function latestCard(ctx) {
  const latest = [...ctx.state.sleepRecords].filter((record) => record.wakeDate).sort((a, b) => (a.wakeDate < b.wakeDate ? 1 : -1))[0];
  if (!latest) return h("p", { class: "hint", style: { marginTop: "14px" }, text: t("sleep.attributedHint") });
  const evaluation = evaluateSleep(latest);
  return h("button", { class: "card", style: { width: "100%", textAlign: "left", marginTop: "14px" }, onClick: () => ctx.go(`/sleep/${latest.wakeDate}`) }, [
    h("p", { class: "hint", text: t("sleep.lastInterval") }),
    h("p", { class: "big-time", text: displayDuration(evaluation.durationLabel) || t("home.incomplete") }),
    h("p", { class: "hint", text: t("sleep.notMedical") }),
    checks(evaluation, latest.id),
  ]);
}

function checks(evaluation, recordId) {
  if (!evaluation.checks?.length) return h("p", { class: "hint", text: evaluation.win ? t("sleep.noExtra") : "" });
  return h("div", { class: "checks" }, evaluation.checks.map((check) => h("div", {
    class: "check",
    "data-check-key": `sleep:${recordId || "night"}:${check.id}`,
    "data-checked": check.passed ? "1" : "0",
  }, [
    h("span", { class: "check-copy" }, [
      check.passed ? checkMark() : null,
      h("span", { text: `${checkLabel(check)} · ${checkDetail(check)}` }),
    ]),
    h("span", { class: check.passed ? "passed" : "unmet", text: check.passed ? t("sleep.passed") : t("sleep.notMet") }),
  ])));
}

function checkLabel(check) {
  if (check.id === "bedtime") return t("sleep.checkBedtime");
  if (check.id === "wake") return t("sleep.checkWake");
  if (check.id === "duration") return t("sleep.checkDuration");
  return check.label;
}

function checkDetail(check) {
  if (check.id !== "duration") return check.detail;
  return durationPhrase(check.detail);
}

function durationPhrase(detail) {
  const match = /^(\d+)h(?: (\d+)m)?$/.exec(detail || "");
  if (!match) return detail;
  if (match[2] == null) return t("duration.h", { hours: Number(match[1]) });
  return t("duration.hm", { hours: Number(match[1]), minutes: Number(match[2]) });
}

function targetsForm(ctx) {
  const targets = ctx.state.settings.sleepTargets;
  const patch = async (partial) => {
    await ctx.actions.updateSettings({ sleepTargets: { ...targets, ...partial } });
  };
  return h("div", { class: "card" }, [
    toggleRow(t("sleep.latestBedtime"), targets.latestBedtimeEnabled, (enabled) => patch({ latestBedtimeEnabled: enabled }), "sleep-bed"),
    targets.latestBedtimeEnabled ? h("input", {
      type: "time",
      lang: intlLocale(),
      value: targets.latestBedtime,
      "aria-label": t("sleep.latestBedtime"),
      onChange: (event) => patch({ latestBedtime: event.target.value }),
    }) : null,
    toggleRow(t("sleep.latestWake"), targets.latestWakeEnabled, (enabled) => patch({ latestWakeEnabled: enabled }), "sleep-wake"),
    targets.latestWakeEnabled ? h("input", {
      type: "time",
      lang: intlLocale(),
      value: targets.latestWake,
      "aria-label": t("sleep.latestWake"),
      onChange: (event) => patch({ latestWake: event.target.value }),
    }) : null,
    toggleRow(t("sleep.minMandatory"), targets.minDurationEnabled, (enabled) => patch({ minDurationEnabled: enabled }), "sleep-duration"),
    targets.minDurationEnabled ? h("div", { class: "two" }, [
      h("input", {
        type: "number",
        min: "0",
        max: "23",
        inputmode: "numeric",
        "aria-label": t("sleep.hours"),
        value: String(Math.floor((targets.minDurationMinutes || 0) / 60)),
        onChange: (event) => patch({ minDurationMinutes: Number(event.target.value) * 60 + ((targets.minDurationMinutes || 0) % 60) }),
      }),
      h("input", {
        type: "number",
        min: "0",
        max: "59",
        inputmode: "numeric",
        "aria-label": t("sleep.minutes"),
        value: String((targets.minDurationMinutes || 0) % 60),
        onChange: (event) => patch({ minDurationMinutes: Math.floor((targets.minDurationMinutes || 0) / 60) * 60 + Number(event.target.value) }),
      }),
    ]) : null,
    h("p", { class: "hint", text: t("sleep.targetsHint") }),
  ]);
}

function toggleRow(label, on, toggle, key) {
  return h("div", { class: "switch-row" }, [
    h("span", { text: label }),
    h("button", {
      type: "button",
      class: `toggle${on ? " on" : ""}`,
      "data-switch-key": key,
      "aria-pressed": on ? "true" : "false",
      onClick: () => toggle(!on),
    }, [h("i")]),
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
  const title = open ? t("sleep.openNight") : formatPrettyDate(ctx.route.date);
  return sheetFrame({
    title,
    onClose: () => ctx.go("/sleep"),
    children: record && !form.editing ? h("div", { class: "sheet-form" }, [
      h("div", { class: "time-pair" }, [
        h("div", {}, [h("p", { class: "hint", text: t("sleep.bed") }), h("p", { class: "big-time", text: wall(record.bedtimeUtc, record.bedtimeTz) })]),
        h("span", { class: "arrow", text: "→" }),
        h("div", {}, [h("p", { class: "hint", text: t("sleep.wake") }), h("p", { class: "big-time", text: record.wakeUtc ? wall(record.wakeUtc, record.wakeTz) : "—" })]),
      ]),
      h("p", { class: "hint", text: `${record.bedtimeOffset || ""} ${record.bedtimeTz || ""}`.trim() }),
      evaluation ? h("p", { class: "big-time", style: { marginTop: "10px" }, text: displayDuration(evaluation.durationLabel) || t("home.incomplete") }) : h("p", { class: "hint", text: t("sleep.incompleteNoInvent") }),
      evaluation ? checks(evaluation, record.id) : null,
      record.note ? h("p", { class: "note-body", text: record.note }) : null,
      record.corrected ? h("p", { class: "hint", text: t("sleep.corrected") }) : null,
      h("div", { class: "correct-row" }, [
        h("button", { class: "btn ghost small", onClick: () => { form.editing = true; ctx.draw(); } }, t("sleep.correct")),
        h("button", {
          class: "btn danger small",
          onClick: () => ctx.confirm({
            title: t("sleep.deleteTitle"),
            text: t("sleep.deleteText"),
            confirmLabel: t("sleep.deleteNight"),
            danger: true,
            onConfirm: async () => {
              await ctx.actions.deleteSleep(record.id);
              ctx.closeModal();
              ctx.go("/sleep");
            },
          }),
        }, t("sleep.delete")),
      ]),
    ]) : sleepForm(ctx, record),
  });
}

function sleepForm(ctx, record) {
  return h("form", {
    class: "sheet-form",
    onSubmit: async (event) => {
      event.preventDefault();
      if (record?.id && record.wakeUtc) {
        const before = evaluateSleep(record);
        for (const item of before.checks || []) {
          if (!item.passed) armCheck(`sleep:${record.id}:${item.id}`);
        }
      }
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
        form.error = result.reason;
        ctx.draw();
        return;
      }
      showToast(record?.wakeUtc ? t("toast.corrected") : t("toast.saved"));
      ctx.go(`/sleep/${result.record.wakeDate}`);
    },
  }, [
    h("p", { class: "hint", text: t("sleep.timesIn", { zone: form.timeZone }) }),
    form.error ? h("p", { class: "error", text: sleepFormError(form.error) }) : null,
    field(t("sleep.bedDate"), h("input", { type: "date", lang: intlLocale(), required: true, value: form.bedDate, onInput: (event) => { form.bedDate = event.target.value; } })),
    field(t("sleep.bedTime"), h("input", { type: "time", lang: intlLocale(), required: true, value: form.bedTime, onInput: (event) => { form.bedTime = event.target.value; } })),
    field(t("sleep.wakeDate"), h("input", { type: "date", lang: intlLocale(), required: true, value: form.wakeDate, onInput: (event) => { form.wakeDate = event.target.value; } })),
    field(t("sleep.wakeTime"), h("input", { type: "time", lang: intlLocale(), required: true, value: form.wakeTime, onInput: (event) => { form.wakeTime = event.target.value; } })),
    field(t("sleep.note"), h("textarea", { placeholder: t("sleep.optional"), value: form.note, onInput: (event) => { form.note = event.target.value; } })),
    record?.targets ? h("p", { class: "hint", text: targetLine(record.targets) }) : null,
    h("button", { class: "btn primary block", type: "submit", style: { marginTop: "12px" } }, record ? t("sleep.saveCorrection") : t("sleep.saveNight")),
  ]);
}

function sleepFormError(reason) {
  if (reason === "order") return t("sleep.errorOrder");
  if (reason === "wake-date") return t("sleep.errorWakeDate");
  if (reason === "open") return t("sleep.errorOpen");
  if (reason === "invalid") return t("sleep.errorInvalid");
  return reason ? t("sleep.errorInvalid") : "";
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
  if (targets.latestBedtimeEnabled) parts.push(t("sleep.bedBy", { time: targets.latestBedtime }));
  if (targets.latestWakeEnabled) parts.push(t("sleep.wakeBy", { time: targets.latestWake }));
  if (targets.minDurationEnabled) {
    const hours = Math.floor(targets.minDurationMinutes / 60);
    const minutes = targets.minDurationMinutes % 60;
    const length = minutes ? t("duration.hm", { hours, minutes }) : t("duration.h", { hours });
    parts.push(t("sleep.atLeast", { length }));
  }
  return parts.length ? t("sleep.targetsStored", { parts: parts.join(", ") }) : t("sleep.noTargetsStored");
}

function monthOf(iso) {
  const [year, month] = iso.split("-").map(Number);
  return { year, month };
}

export { checks };
