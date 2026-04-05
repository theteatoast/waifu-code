import { WaifuEvent } from "../observer/eventDetector.js";

/**
 * OverlayRenderer handles the visual reactions of the waifu.
 * In the revised proxy-based approach, it writes reactions that don't
 * interfere with the main TUI as much as possible.
 */
export class OverlayRenderer {
  private isEnabled: boolean = true;
  private lastReaction: string = "";
  private messages: string[] = [
    "are you doing okay today?",
    "hey if no one told you today im proud of you",
    "hey you are doing good be proud",
    "you're working so hard! I'm proud of you! (◕‿◕✿)",
    "You've got this! ᕦ(ò_ó)ᕤ",
    "Doing great today! (✿◠‿◠)",
    "Just a moment... you're doing amazing! (´｡• ᵕ •｡`) ♡"
  ];

  constructor(enabled: boolean = true) {
    this.isEnabled = enabled;
  }

  public render(event: WaifuEvent): void {
    if (!this.isEnabled) return;

    let reaction = "";
    switch (event) {
      case "thinking":
        const msg = this.messages[Math.floor(Math.random() * this.messages.length)];
        reaction = `\x1b[35m(✿◠‿◠) ${msg}\x1b[0m`;
        break;
      case "idle":
        return; // nothing to show
      default:
        return;
    }

    if (reaction && reaction !== this.lastReaction) {
      // For safer rendering alongside Claude's TUI, we write to stderr
      // with a clear line and return to start.
      // Most TUI's handle stdout but stderr is often free.
      process.stderr.write(`\n\x1b[2K\r${reaction}\n`);
      this.lastReaction = reaction;
    }
  }

  public clear(): void {
    if (this.lastReaction) {
      this.lastReaction = "";
    }
  }
}
