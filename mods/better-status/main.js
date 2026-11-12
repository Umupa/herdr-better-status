// better-status: Herdr's own status bar (herdr-app 0.1.15 defaults/mods/workspace-status)
// plus one line of your own in the middle and the weekday and time on the right.
// Changes are marked "better-status".

import { View, div, svg } from "gpui-kit";
import { h_flex, InputState, Input } from "gpui-base";
import { spaces, agents, theme, run, window, keys, shared, setShared } from "herdr";

// better-status: the phrase lives in shared storage, which Herdr keeps across restarts.
const KEY = "better-status.phrase";
const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function clock(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${DAYS[d.getDay()]}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// truncate() measures this text as zero wide in a row, so cut long phrases here.
function short(p, max = 60) {
  const chars = [...p];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : p;
}

export default class BetterStatus extends View {
  init(_props, cx) {
    // better-status: redraw only when the minute changes.
    this.now = clock(new Date());
    cx.timer.every(1000, (cx) => {
      const now = clock(new Date());
      if (now.time !== this.now.time || now.date !== this.now.date) { this.now = now; cx.notify(); }
    });
    this.editing = false;
    this.input = InputState.new({ placeholder: "Your one thing" });
    this.input.on("submit", (_e, cx) => this.save(cx));
    this.input.on("blur", (_e, cx) => { if (this.editing) this.save(cx); });
  }

  phrase() {
    const p = shared(KEY);
    return typeof p === "string" ? p : "";
  }

  edit(cx) {
    const p = this.phrase();
    this.input.set_value(p);
    this.input.set_selected_range({ start: 0, end: p.length });
    this.editing = true;
    this.input.focus();
    cx.notify();
  }

  save(cx) {
    this.editing = false;
    const p = this.input.value().trim();
    if (p !== this.phrase()) setShared(KEY, p);
    cx.notify();
  }

  cancel(cx) {
    this.editing = false;
    cx.notify();
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  // better-status: the phrase, or a faint "+ One thing"; click to edit in place.
  phrasePart(t) {
    if (this.editing) {
      return h_flex().id("bs-edit").flex_none().w(320).h(20).px(7).items_center().rounded(5)
        .border_1().border_color(t.accent).bg(t.background).cursor_text()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_key_down((e, cx) => { if (e.key === "escape") { this.cancel(cx); cx.stop_propagation(); } })
        .child(Input.new(this.input).w_full().text_size(11.8).text_color(t.foreground));
    }
    const p = this.phrase();
    return div().id("bs-phrase").flex_none().cursor_pointer()
      .text_color(p ? t.foreground : t.dim).when(Boolean(p), (el) => el.font_medium())
      .hover((s) => s.text_color(p ? t.foreground : t.muted))
      .on_click((_e, cx) => this.edit(cx))
      .child(p ? short(p) : "+ One thing");
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    // better-status: Herdr's items on the left; yours on the right, phrase then time.
    const bar = () => div().w(1).h(12).flex_none().bg(t.border);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").flex_none().text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)))
      .child(bar())
      .child(this.phrasePart(t))
      .child(bar())
      .child(h_flex().flex_none().gap(8).items_center()
        .child(div().text_color(t.foreground).font_medium().child(this.now.date))
        .child(div().text_color(t.foreground).font_medium().child(this.now.time)));
  }
}
