import { formatPrettyDate } from "../dates.js";
import { t } from "../i18n.js";
import { armCheck } from "../motion.js";
import {
  checklistLabel,
  countdownFor,
  countdownPhrase,
  groupNotes,
  notePreview,
} from "../notes.js";
import { uid } from "../store.js";
import { checkHost, field, h, icon, topbar } from "../ui.js";

export function renderNotes(ctx) {
  if (ctx.route.name === "notes") return renderList(ctx);
  if (ctx.route.name === "note-edit") return renderEditor(ctx);
  return renderDetail(ctx);
}

function renderList(ctx) {
  const grouped = groupNotes(ctx.state.notes || [], ctx.today);
  const hasNotes = (ctx.state.notes || []).length > 0;
  return h("div", { class: "note-screen" }, [
    topbar({
      title: t("notes.title"),
      onBack: () => ctx.go("/home"),
      trailing: h("button", {
        class: "icon-btn",
        "aria-label": t("notes.newNote"),
        "data-action": "new-note",
        onClick: () => ctx.go("/notes/new"),
      }, [icon("plus")]),
    }),
    hasNotes ? renderGroups(ctx, grouped) : h("section", { class: "note-empty" }, [
      h("p", { class: "muted", text: t("notes.emptyBody") }),
      h("button", {
        class: "btn primary block",
        "data-action": "new-note",
        onClick: () => ctx.go("/notes/new"),
      }, t("notes.newNote")),
    ]),
  ]);
}

function renderGroups(ctx, grouped) {
  const blocks = [];
  if (grouped.upcoming.length) {
    blocks.push(h("p", { class: "eyebrow", text: t("notes.comingUp") }));
    blocks.push(h("div", { class: "note-stack" }, grouped.upcoming.map((item) => noteCard(ctx, item.note, item.count))));
  }
  if (grouped.past.length) {
    blocks.push(h("p", { class: "eyebrow", text: t("notes.passed") }));
    blocks.push(h("div", { class: "note-stack" }, grouped.past.map((item) => noteCard(ctx, item.note, item.count))));
  }
  for (const group of grouped.days) {
    const label = safePretty(group.date);
    if (label) blocks.push(h("p", { class: "note-day", text: label }));
    blocks.push(h("div", { class: "note-stack" }, group.notes.map((note) => noteCard(ctx, note, null))));
  }
  return h("div", {}, blocks);
}

function noteCard(ctx, note, count) {
  const preview = notePreview(note);
  const items = checklistLabel(note.items);
  return h("button", {
    class: "card note-card",
    onClick: () => ctx.go(`/notes/${encodeURIComponent(note.id)}`),
  }, [
    h("div", { class: "note-card-top" }, [
      h("div", { class: "grow" }, [
        h("h2", { class: "goal-name", text: note.title.trim() || t("notes.untitled") }),
        preview ? h("p", { class: "note-preview", text: preview }) : null,
        items ? h("p", { class: "hint", text: items }) : null,
      ]),
      count ? h("div", { class: "count-side" }, [
        h("p", {
          class: "count-num",
          "data-metric-key": `countdown:${note.id}`,
          text: String(count.days),
        }),
        h("p", { class: "count-unit", text: countdownPhrase(count) }),
      ]) : null,
    ]),
  ]);
}

function renderDetail(ctx) {
  const note = (ctx.state.notes || []).find((item) => item.id === ctx.route.id);
  if (!note) {
    return h("div", {}, [
      topbar({ title: t("notes.title"), onBack: () => ctx.go("/notes") }),
      h("section", { class: "note-empty" }, [
        h("p", { class: "muted", text: t("notes.missing") }),
      ]),
    ]);
  }
  const count = countdownFor(note.countdownDate, ctx.today);
  const items = note.items || [];
  return h("div", { class: "note-screen" }, [
    topbar({
      onBack: () => ctx.go("/notes"),
      trailing: h("button", {
        class: "btn ghost small",
        "data-action": "edit-note",
        onClick: () => ctx.go(`/notes/${encodeURIComponent(note.id)}/edit`),
      }, t("goal.edit")),
    }),
    count ? h("section", { class: "countdown-hero" }, [
      h("p", {
        class: "count-num",
        "data-metric-key": `countdown:${note.id}`,
        text: String(count.days),
      }),
      h("p", { class: "count-phrase", text: countdownPhrase(count) }),
      h("p", { class: "hint", text: safePretty(note.countdownDate) }),
    ]) : null,
    h("h1", { class: "note-title", text: note.title.trim() || t("notes.untitled") }),
    note.body ? h("p", { class: "note-read", text: note.body }) : null,
    items.length ? h("div", { class: "todo-block" }, [
      h("p", { class: "eyebrow", text: t("notes.checklist") }),
      h("div", { class: "todo-list" }, items.map((item) => readItem(ctx, note, item))),
    ]) : null,
    h("p", { class: "hint note-meta", text: metaLine(note) }),
    h("div", { class: "correct-row" }, [
      h("button", {
        class: "btn danger small",
        "data-action": "delete-note",
        onClick: () => confirmDelete(ctx, note),
      }, t("notes.delete")),
    ]),
  ]);
}

function readItem(ctx, note, item) {
  const key = `note:${note.id}:${item.id}`;
  return h("button", {
    class: `todo${item.checked ? " on" : ""}`,
    "aria-pressed": item.checked ? "true" : "false",
    "aria-label": t("notes.toggleItem", { text: item.text }),
    onClick: () => {
      if (!item.checked) armCheck(key);
      ctx.actions.toggleNoteItem(note.id, item.id);
    },
  }, [
    h("span", { class: "todo-box" }, [checkHost(key, item.checked)]),
    h("span", { class: `todo-text${item.checked ? " done" : ""}`, text: item.text }),
  ]);
}

function renderEditor(ctx) {
  const draft = ensureDraft(ctx);
  if (ctx.route.id && !draft.id) {
    return h("div", {}, [
      topbar({ title: t("notes.title"), onBack: () => ctx.go("/notes") }),
      h("section", { class: "note-empty" }, [
        h("p", { class: "muted", text: t("notes.missing") }),
      ]),
    ]);
  }
  return h("div", { class: "note-screen" }, [
    topbar({
      onBack: () => leaveEditor(ctx, draft),
      trailing: h("button", {
        class: "btn primary small",
        "data-action": "save-note",
        onClick: () => commit(ctx, draft),
      }, t("notes.save")),
    }),
    h("input", {
      class: "compose-title",
      name: "note-title",
      "data-live": "text",
      "aria-label": t("notes.titlePlaceholder"),
      placeholder: t("notes.titlePlaceholder"),
      autocomplete: "off",
      value: draft.title,
      onInput: (event) => {
        draft.title = event.target.value;
      },
    }),
    h("textarea", {
      class: "compose-body",
      name: "note-body",
      "data-live": "text",
      "aria-label": t("notes.bodyPlaceholder"),
      placeholder: t("notes.bodyPlaceholder"),
      value: draft.body,
      onInput: (event) => {
        draft.body = event.target.value;
      },
    }),
    editorItems(ctx, draft),
    h("div", { class: "card compose-count" }, [
      h("div", { class: "switch-row" }, [
        h("span", { text: t("notes.countdown") }),
        h("button", {
          type: "button",
          class: `toggle${draft.countdownOn ? " on" : ""}`,
          "data-switch-key": "note-countdown",
          "aria-pressed": draft.countdownOn ? "true" : "false",
          "aria-label": t("notes.countdown"),
          onClick: () => {
            draft.countdownOn = !draft.countdownOn;
            ctx.draw();
          },
        }, [h("i")]),
      ]),
      h("p", { class: "hint", text: t("notes.countdownHint") }),
      draft.countdownOn ? field(t("notes.date"), h("input", {
        type: "date",
        name: "note-date",
        "aria-label": t("notes.date"),
        value: draft.countdownDate,
        onInput: (event) => {
          draft.countdownDate = event.target.value;
        },
        onChange: (event) => {
          draft.countdownDate = event.target.value;
        },
      })) : null,
    ]),
    h("div", { class: "stack compose-actions" }, [
      h("button", {
        class: "btn primary block",
        "data-action": "save-note",
        onClick: () => commit(ctx, draft),
      }, t("notes.save")),
    ]),
  ]);
}

function editorItems(ctx, draft) {
  return h("div", { class: "todo-block" }, [
    h("p", { class: "eyebrow", text: t("notes.checklist") }),
    draft.items.length ? h("div", { class: "todo-list" }, draft.items.map((item) => editItem(ctx, draft, item))) : null,
    h("button", {
      class: "btn ghost small",
      "data-action": "add-item",
      onClick: () => {
        const item = { id: uid(), text: "", checked: false };
        draft.items.push(item);
        ctx.draw();
        document.querySelector(`[data-item-id="${item.id}"]`)?.focus();
      },
    }, t("notes.addItem")),
  ]);
}

function editItem(ctx, draft, item) {
  const key = `note-edit:${draft.key}:${item.id}`;
  return h("div", { class: `todo${item.checked ? " on" : ""}` }, [
    h("button", {
      class: "todo-box",
      "aria-pressed": item.checked ? "true" : "false",
      "aria-label": t("notes.toggleItem", { text: item.text || t("notes.itemPlaceholder") }),
      onClick: () => {
        if (!item.checked) armCheck(key);
        item.checked = !item.checked;
        ctx.draw();
      },
    }, [checkHost(key, item.checked)]),
    h("input", {
      class: "todo-input",
      name: `note-item-${item.id}`,
      "data-live": "text",
      "data-item-id": item.id,
      "aria-label": t("notes.itemPlaceholder"),
      placeholder: t("notes.itemPlaceholder"),
      autocomplete: "off",
      value: item.text,
      onInput: (event) => {
        item.text = event.target.value;
      },
      onKeydown: (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const next = { id: uid(), text: "", checked: false };
        const index = draft.items.findIndex((entry) => entry.id === item.id);
        draft.items.splice(index + 1, 0, next);
        ctx.draw();
        document.querySelector(`[data-item-id="${next.id}"]`)?.focus();
      },
    }),
    h("button", {
      class: "icon-btn",
      "aria-label": t("notes.removeItem"),
      onClick: () => {
        draft.items = draft.items.filter((entry) => entry.id !== item.id);
        ctx.draw();
      },
    }, [icon("close")]),
  ]);
}

function ensureDraft(ctx) {
  const id = ctx.route.id;
  const key = id || "new";
  const current = ctx.memory.noteDraft;
  if (current?.key === key) return current;
  const note = id ? (ctx.state.notes || []).find((item) => item.id === id) : null;
  if (id && !note) {
    const missing = { key, id: null, title: "", body: "", countdownOn: false, countdownDate: "", items: [] };
    ctx.memory.noteDraft = missing;
    return missing;
  }
  const draft = {
    key,
    id: note?.id || null,
    title: note?.title || "",
    body: note?.body || "",
    countdownOn: Boolean(note?.countdownDate),
    countdownDate: note?.countdownDate || "",
    items: (note?.items || []).map((item) => ({ id: item.id, text: item.text, checked: Boolean(item.checked) })),
  };
  ctx.memory.noteDraft = draft;
  return draft;
}

function leaveEditor(ctx, draft) {
  ctx.memory.noteDraft = null;
  ctx.go(draft.id ? `/notes/${encodeURIComponent(draft.id)}` : "/notes");
}

async function commit(ctx, draft) {
  const result = await ctx.actions.saveNote({
    id: draft.id,
    title: draft.title,
    body: draft.body,
    countdownOn: draft.countdownOn,
    countdownDate: draft.countdownDate,
    items: draft.items,
  });
  if (!result?.ok) {
    ctx.toast(result?.reason === "date" ? t("notes.errorDate") : t("notes.errorEmpty"));
    return;
  }
  ctx.memory.noteDraft = null;
  ctx.go(`/notes/${encodeURIComponent(result.id)}`);
}

function confirmDelete(ctx, note) {
  ctx.confirm({
    title: t("notes.deleteTitle"),
    text: t("notes.deleteText"),
    confirmLabel: t("notes.delete"),
    danger: true,
    onConfirm: async () => {
      await ctx.actions.deleteNote(note.id);
      ctx.memory.noteDraft = null;
      ctx.closeModal();
      ctx.go("/notes");
    },
  });
}

function metaLine(note) {
  const created = note.createdOn || String(note.createdAt || "").slice(0, 10);
  const updated = String(note.updatedAt || "").slice(0, 10);
  if (updated && created && updated !== created) return t("notes.updated", { date: safePretty(updated) });
  if (created) return t("notes.created", { date: safePretty(created) });
  return "";
}

function safePretty(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  try {
    return formatPrettyDate(iso);
  } catch {
    return "";
  }
}
