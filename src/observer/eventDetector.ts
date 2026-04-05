import { EventEmitter } from "node:events";

export type WaifuEvent = "thinking" | "permission" | "error" | "completion" | "idle";

/**
 * EventDetector now receives high-level events from the Proxy Server
 * instead of raw terminal bytes.
 */
export class EventDetector extends EventEmitter {
  private currentState: WaifuEvent = "idle";

  constructor() {
    super();
  }

  /** Called when the model starts sending reasoning (thinking) content */
  public onThinking() {
    this.updateState("thinking");
  }

  /** Called when the message stream is complete */
  public setCompletion() {
    // Reset to idle after a short delay
    setTimeout(() => this.updateState("idle"), 1000);
  }


  private updateState(newState: WaifuEvent) {
    if (this.currentState === newState) return;
    this.currentState = newState;
    this.emit("event", newState);
  }

  public reset() {
    this.updateState("idle");
  }
}
