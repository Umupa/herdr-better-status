# Better Status for Herdr

A quieter, more useful status bar for the [Herdr](https://herdr.dev) desktop app: CPU and memory, one line of your own (like the One Thing app on macOS), and the date and time with seconds. Herdr's own items (machine, branch, agents) stay on the left.

```
This computer  master  ● 13 agents        ⌘⇧P commands   CPU ▁▂▁▃▂ 27%   MEM ━━━─ 79%   ◎ Ship one thing today   📅 11-12 周四 20:56:15
```

- **Your one thing.** Click it and type; Enter or clicking away saves, Esc cancels. It's kept across restarts.
- **Colors.** While editing, pick one of 9 colors for your line. Click the date to pick one for the date and time. The default follows your theme.
- **CPU and memory.** A small history of CPU use and a memory meter, sampled every 2 seconds (macOS and Linux; hidden elsewhere).
- **Date and time.** `MM-DD 周X HH:MM:SS`.

## Install

Ask your agent inside Herdr: *"Add the mod at github.com/Umupa/herdr-better-status"*. Or by hand:

```sh
git clone https://github.com/Umupa/herdr-better-status.git
cp -R herdr-better-status/mods/better-status ~/.config/herdr-app/mods/
```

Then, in your layout (`~/.config/herdr-app/layouts/<name>.json`), point the status block at it:

```json
{ "id": "status", "type": "block", "size": { "px": 28 }, "content": { "mod": "better-status" } }
```

## What it touches

- **Programs it runs:** every 2 seconds, `sh -c` with `ps`, `sysctl` and `vm_stat` on macOS, or reads `/proc/stat` and `/proc/meminfo` on Linux. No network.
- **Storage:** your line and its colors in Herdr's shared storage (`better-status.*`).

## Uninstall

Point the status block back at `workspace-status`, then delete `mods/better-status/`.

## Credits

Adapted from herdr-app's status bar (Apache-2.0). Icons: [Lucide](https://lucide.dev) (ISC). See [NOTICE](NOTICE).
