import { WaifuEvent } from "../observer/eventDetector.js";
/**
 * OverlayRenderer handles the visual reactions of the waifu.
 * In the revised proxy-based approach, it writes reactions that don't
 * interfere with the main TUI as much as possible.
 */
export declare class OverlayRenderer {
    private isEnabled;
    private lastReaction;
    private messages;
    constructor(enabled?: boolean);
    render(event: WaifuEvent): void;
    clear(): void;
}
