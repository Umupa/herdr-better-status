// better-status: Herdr's own status bar (herdr-app 0.1.15 defaults/mods/workspace-status)
// plus, on the right: CPU and memory, one line of your own, and the date and time.
// Changes are marked "better-status".

import { View, div, svg } from "gpui-kit";
import { h_flex, InputState, Input } from "gpui-base";
import { spaces, agents, theme, run, window, keys, shared, setShared, exec } from "herdr";

// better-status: everything is kept in shared storage, which Herdr keeps across restarts.
const KEY = "better-status.phrase";
const PHRASE_COLOR = "better-status.color";
const CLOCK_COLOR = "better-status.clockColor";
// null is the bar's own gray; the rest match better-icons.
const COLORS = [null, "#8b7cf6", "#5b8def", "#22b8cf", "#3fae6a", "#e3a73f", "#e3814f", "#e5604d", "#d9649a"];
const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const ICON = (name) => `mods/better-status/icons/${name}.svg`;
const SAMPLES = 14;

function clock(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${DAYS[d.getDay()]}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

// truncate() measures this text as zero wide in a row, so cut long phrases here.
function short(p, max = 60) {
  const chars = [...p];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : p;
}

// CPU and memory, as percentages. macOS: ps and vm_stat (memory used the way
// Activity Monitor counts it: app + wired + compressed). Linux: /proc.
const MAC = "ps -A -o %cpu= | awk '{s+=$1} END {print s}'; sysctl -n hw.ncpu hw.memsize; vm_stat";
const LINUX = "head -1 /proc/stat; cat /proc/meminfo";

function pageCount(text, name) {
  const m = text.match(new RegExp(`${name}:\\s+(\\d+)`));
  return m ? Number(m[1]) : 0;
}

async function sample(platform, last) {
  if (platform === "macos") {
    const r = await exec("sh", ["-c", MAC], { timeout: 5000 });
    const [cpu, ncpu, total] = r.stdout.split("\n").slice(0, 3).map(Number);
    const page = Number(r.stdout.match(/page size of (\d+)/)?.[1] ?? 4096);
    const used = pageCount(r.stdout, "Anonymous pages") - pageCount(r.stdout, "Pages purgeable")
      + pageCount(r.stdout, "Pages wired down") + pageCount(r.stdout, "Pages occupied by compressor");
    return { cpu: cpu / Math.max(1, ncpu), mem: (used * page / total) * 100 };
  }
  if (platform === "linux") {
    const r = await exec("sh", ["-c", LINUX], { timeout: 5000 });
    const ticks = r.stdout.split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
    const idle = ticks[3] + (ticks[4] ?? 0);
    const sum = ticks.reduce((a, b) => a + b, 0);
    const kb = (name) => Number(r.stdout.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1] ?? 0);
    const cpu = last ? 100 * (1 - (idle - last.idle) / Math.max(1, sum - last.sum)) : 0;
    return { cpu, mem: 100 * (1 - kb("MemAvailable") / Math.max(1, kb("MemTotal"))), idle, sum };
  }
  return null;
}

const clamp = (v) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

export default class BetterStatus extends View {
  init(_props, cx) {
    // better-status: redraw each second, for the clock.
    this.now = clock(new Date());
    cx.timer.every(1000, (cx) => {
      const now = clock(new Date());
      if (now.time !== this.now.time || now.date !== this.now.date) { this.now = now; cx.notify(); }
    });
    // better-status: CPU and memory every 2 seconds; hidden where we can't read them.
    this.cpu = [];
    this.mem = null;
    const platform = window()?.platform;
    let last = null;
    const tick = async (cx) => {
      try {
        const s = await sample(platform, last);
        if (!s) return false;
        last = s;
        this.cpu = [...this.cpu, clamp(s.cpu)].slice(-SAMPLES);
        this.mem = clamp(s.mem);
        cx.notify();
      } catch { /* try again next tick */ }
      return true;
    };
    cx.spawn(async (cx) => { while (await tick(cx)) await cx.sleep(2000); });
    this.editing = false;
    this.coloring = false;
    this.input = InputState.new({ placeholder: "Your one thing" });
    this.input.on("submit", (_e, cx) => this.save(cx));
    this.input.on("focus", () => { this.focused = true; });
    // Clicking a color dot blurs the input for a moment; save only if focus stays away.
    this.input.on("blur", (_e, cx) => {
      this.focused = false;
      cx.timer.after(200, (cx) => { if (this.editing && !this.focused) this.save(cx); });
    });
  }

  phrase() {
    const p = shared(KEY);
    return typeof p === "string" ? p : "";
  }

  colorOf(key) {
    const c = shared(key);
    return COLORS.includes(c) ? c : null;
  }

  edit(cx) {
    const p = this.phrase();
    this.input.set_value(p);
    this.input.set_selected_range({ start: 0, end: p.length });
    this.editing = true;
    this.coloring = false;
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

  // better-status: a row of color dots; the chosen one is ringed.
  dots(t, key, picked) {
    const now = this.colorOf(key);
    const dot = (c, i) => div().id(`${key}-${i}`).size(12).flex_none().rounded(6).cursor_pointer()
      .border_1().border_color(c === now ? t.foreground : "#00000000")
      .child(div().size_full().rounded(6).border_2().border_color(t.chrome).bg(c ?? t.muted))
      .on_mouse_down("left", (_e, cx) => { setShared(key, c); picked(); cx.stop_propagation(); cx.notify(); });
    return h_flex().gap(4).items_center().children(COLORS.map(dot));
  }

  // better-status: CPU as a tiny bar history, memory as a meter.
  meters(t) {
    if (!this.cpu.length) return null;
    const value = (v) => div().w(28).text_color(t.muted).child(`${Math.round(v)}%`);
    const bars = h_flex().h(10).gap(1).items_end().children(
      Array.from({ length: SAMPLES }, (_, i) => {
        const v = this.cpu[this.cpu.length - SAMPLES + i];
        return div().w(2).h(v == null ? 1 : Math.max(1, Math.round(v / 10))).rounded(1).bg(v == null ? t.border : t.dim);
      }));
    const meter = div().w(28).h(4).rounded(2).bg(t.border)
      .child(div().h_full().w(Math.round(28 * (this.mem ?? 0) / 100)).rounded(2).bg(t.muted));
    return h_flex().flex_none().gap(14).items_center()
      .child(h_flex().gap(6).items_center().child("CPU").child(bars).child(value(this.cpu[this.cpu.length - 1])))
      .child(h_flex().gap(6).items_center().child("MEM").child(meter).child(value(this.mem ?? 0)));
  }

  // better-status: the phrase, or a faint "One thing"; click to edit in place.
  phrasePart(t) {
    if (this.editing) {
      return h_flex().flex_none().gap(10).items_center()
        .child(h_flex().id("bs-edit").flex_none().w(300).h(20).px(7).items_center().rounded(5)
          .border_1().border_color(t.accent).bg(t.background).cursor_text()
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_key_down((e, cx) => { if (e.key === "escape") { this.cancel(cx); cx.stop_propagation(); } })
          .child(Input.new(this.input).w_full().text_size(11.8).text_color(t.foreground)))
        .child(this.dots(t, PHRASE_COLOR, () => { this.focused = true; this.input.focus(); }));
    }
    const p = this.phrase();
    const color = p ? (this.colorOf(PHRASE_COLOR) ?? t.muted) : t.dim;
    return h_flex().id("bs-phrase").flex_none().gap(6).items_center().cursor_pointer()
      .text_color(color).hover((s) => s.opacity(0.8))
      .on_click((_e, cx) => this.edit(cx))
      .child(svg(ICON("target")).size(13).text_color(color))
      .child(p ? short(p) : "One thing");
  }

  // better-status: click the date to choose its color.
  clockPart(t) {
    const color = this.colorOf(CLOCK_COLOR) ?? t.muted;
    return h_flex().flex_none().gap(10).items_center()
      .when(this.coloring, (el) => el.child(this.dots(t, CLOCK_COLOR, () => { this.coloring = false; })))
      .child(h_flex().id("bs-clock").gap(6).items_center().cursor_pointer().text_color(color)
        .hover((s) => s.opacity(0.8))
        .on_click((_e, cx) => { this.coloring = !this.coloring; cx.notify(); })
        .child(svg(ICON("calendar")).size(13).text_color(color))
        .child(this.now.date)
        // Keep wide digit pairs on one line without shifting the row each second.
        .child(div().w(64).flex_none().whitespace_nowrap().child(this.now.time)));
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const meters = this.meters(t);
    // better-status: Herdr's items on the left; yours on the right.
    return h_flex().size_full().px(14).gap(20).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.dim)
      .child(h_flex().gap(16).items_center().text_color(t.muted)
        .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
        .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
        .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
          .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`)))))
      .child(div().flex_1())
      .child(div().id("palette").flex_none().on_click(() => run("app.palette")).child(this.hint(t)))
      .when(Boolean(meters), (el) => el.child(meters))
      .child(this.phrasePart(t))
      .child(this.clockPart(t));
  }
}
