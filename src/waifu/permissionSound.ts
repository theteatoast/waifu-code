import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveAudioFile(): string | null {
  const cwdPath = join(process.cwd(), "public", "faaah.mp3");
  if (existsSync(cwdPath)) return cwdPath;

  const here = dirname(fileURLToPath(import.meta.url));
  const repoPath = join(here, "..", "..", "public", "faaah.mp3");
  if (existsSync(repoPath)) return repoPath;

  return null;
}

function buildPlayerCommand(
  audioPath: string
): { cmd: string; args: string[] } | null {
  if (process.platform === "win32") {
    return {
      cmd: "powershell",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        [
          "$ErrorActionPreference = 'Stop';",
          "$path = '" + audioPath.replace(/'/g, "''") + "';",
          "$uri = New-Object System.Uri($path);",
          "Add-Type -AssemblyName presentationCore;",
          "$player = New-Object System.Windows.Media.MediaPlayer;",
          "$player.Open($uri);",
          "$player.Volume = 1.0;",
          "for ($i = 0; $i -lt 80 -and -not $player.NaturalDuration.HasTimeSpan; $i++) { Start-Sleep -Milliseconds 50 };",
          "$player.Play();",
          "$dur = if ($player.NaturalDuration.HasTimeSpan) { [int]$player.NaturalDuration.TimeSpan.TotalMilliseconds } else { 1200 };",
          "Start-Sleep -Milliseconds ([Math]::Max($dur, 800));",
          "$player.Stop();",
        ].join(" "),
      ],
    };
  }

  if (process.platform === "darwin") {
    return { cmd: "afplay", args: [audioPath] };
  }

  return {
    cmd: "sh",
    args: [
      "-lc",
      `if command -v paplay >/dev/null 2>&1; then paplay "${audioPath}"; elif command -v aplay >/dev/null 2>&1; then aplay "${audioPath}"; elif command -v ffplay >/dev/null 2>&1; then ffplay -nodisp -autoexit -loglevel quiet "${audioPath}"; else exit 127; fi`,
    ],
  };
}

export class PermissionSoundNotifier {
  private readonly intervalMs: number;
  private readonly audioPath: string | null;
  private timer: NodeJS.Timeout | null = null;
  private activePlayback: ChildProcess | null = null;
  private warnedUnavailable = false;

  constructor(intervalMs = 1200) {
    this.intervalMs = intervalMs;
    this.audioPath = resolveAudioFile();
  }

  start(): void {
    if (this.timer) return;
    this.playOnce();
    this.timer = setInterval(() => this.playOnce(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.activePlayback && !this.activePlayback.killed) {
      this.activePlayback.kill();
    }
    this.activePlayback = null;
  }

  dispose(): void {
    this.stop();
  }

  private playOnce(): void {
    if (!this.audioPath) {
      this.warnOnce("Permission sound disabled: public/faaah.mp3 not found.");
      return;
    }
    if (this.activePlayback && this.activePlayback.exitCode == null) return;

    const cmd = buildPlayerCommand(this.audioPath);
    if (!cmd) {
      this.warnOnce("Permission sound disabled: unsupported platform.");
      return;
    }

    const child = spawn(cmd.cmd, cmd.args, {
      stdio: "ignore",
      detached: false,
    });
    this.activePlayback = child;
    child.on("error", () => {
      this.warnOnce("Permission sound disabled: no compatible audio player found.");
    });
    child.on("exit", () => {
      if (this.activePlayback === child) {
        this.activePlayback = null;
      }
    });
  }

  private warnOnce(msg: string): void {
    if (this.warnedUnavailable) return;
    this.warnedUnavailable = true;
    process.stderr.write(`[waifu] ${msg}\n`);
  }
}
