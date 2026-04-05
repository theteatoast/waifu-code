/**
 * StreamObserver listens to a child process's stdout and routes chunks
 * to terminal and our event detector / renderer for the waifu overlay.
 */
export function createStreamObserver(child, detector, renderer) {
    if (!child.stdout) {
        throw new Error("Child process has no stdout to observe.");
    }
    child.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        // 1. Immediately write to terminal (CRITICAL: DO NOT DELAY)
        process.stdout.write(chunk);
        // 2. Feed to detector for analysis
        detector.onChunk(text);
    });
    child.on("exit", () => {
        detector.setCompletion();
    });
    // Listen for detector events
    detector.on("event", (event) => {
        renderer.render(event);
    });
}
//# sourceMappingURL=streamObserver.js.map