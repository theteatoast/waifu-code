import { EventEmitter } from "node:events";
/**
 * EventDetector now receives high-level events from the Proxy Server
 * instead of raw terminal bytes.
 */
export class EventDetector extends EventEmitter {
    currentState = "idle";
    constructor() {
        super();
    }
    /** Called when the model starts sending reasoning (thinking) content */
    onThinking() {
        this.updateState("thinking");
    }
    /** Called when the message stream is complete */
    setCompletion() {
        // Reset to idle after a short delay
        setTimeout(() => this.updateState("idle"), 1000);
    }
    updateState(newState) {
        if (this.currentState === newState)
            return;
        this.currentState = newState;
        this.emit("event", newState);
    }
    reset() {
        this.updateState("idle");
    }
}
//# sourceMappingURL=eventDetector.js.map