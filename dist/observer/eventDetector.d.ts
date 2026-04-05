import { EventEmitter } from "node:events";
export type WaifuEvent = "thinking" | "permission" | "error" | "completion" | "idle";
/**
 * EventDetector now receives high-level events from the Proxy Server
 * instead of raw terminal bytes.
 */
export declare class EventDetector extends EventEmitter {
    private currentState;
    constructor();
    /** Called when the model starts sending reasoning (thinking) content */
    onThinking(): void;
    /** Called when the message stream is complete */
    setCompletion(): void;
    private updateState;
    reset(): void;
}
