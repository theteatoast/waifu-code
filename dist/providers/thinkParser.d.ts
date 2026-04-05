/**
 * Streaming parser for <think>...</think> tags.
 *
 * Handles partial tags at chunk boundaries by buffering.
 * Port of Python ThinkTagParser from the proxy server.
 */
import { ContentChunk } from "./types.js";
export declare class ThinkTagParser {
    private buffer;
    private inThinkTag;
    get inThinkMode(): boolean;
    /**
     * Feed content and return parsed chunks.
     * Handles partial tags by buffering content near potential tag boundaries.
     */
    feed(content: string): Generator<ContentChunk>;
    private parseOutsideThink;
    private parseInsideThink;
    /** Flush any remaining buffered content. */
    flush(): ContentChunk | null;
}
