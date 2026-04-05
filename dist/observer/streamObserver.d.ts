import { ChildProcess } from "node:child_process";
import { EventDetector } from "./eventDetector.js";
import { OverlayRenderer } from "../waifu/overlayRenderer.js";
/**
 * StreamObserver listens to a child process's stdout and routes chunks
 * to terminal and our event detector / renderer for the waifu overlay.
 */
export declare function createStreamObserver(child: ChildProcess, detector: EventDetector, renderer: OverlayRenderer): void;
