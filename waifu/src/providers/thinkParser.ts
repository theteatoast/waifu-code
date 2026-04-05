/**
 * Streaming parser for <think>...</think> tags.
 *
 * Handles partial tags at chunk boundaries by buffering.
 * Port of Python ThinkTagParser from the proxy server.
 */

import { ContentChunk, ContentType } from "./types.js";

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";
const OPEN_TAG_LEN = 7;
const CLOSE_TAG_LEN = 8;

export class ThinkTagParser {
  private buffer = "";
  private inThinkTag = false;

  get inThinkMode(): boolean {
    return this.inThinkTag;
  }

  /**
   * Feed content and return parsed chunks.
   * Handles partial tags by buffering content near potential tag boundaries.
   */
  *feed(content: string): Generator<ContentChunk> {
    this.buffer += content;

    while (this.buffer.length > 0) {
      const prevLen = this.buffer.length;
      const chunk = this.inThinkTag
        ? this.parseInsideThink()
        : this.parseOutsideThink();

      if (chunk) {
        yield chunk;
      } else if (this.buffer.length === prevLen) {
        // No progress: waiting for more data
        break;
      }
    }
  }

  private parseOutsideThink(): ContentChunk | null {
    const thinkStart = this.buffer.indexOf(OPEN_TAG);
    const orphanClose = this.buffer.indexOf(CLOSE_TAG);

    // Handle orphan </think> — strip it
    if (orphanClose !== -1 && (thinkStart === -1 || orphanClose < thinkStart)) {
      const preOrphan = this.buffer.slice(0, orphanClose);
      this.buffer = this.buffer.slice(orphanClose + CLOSE_TAG_LEN);
      if (preOrphan) {
        return { type: ContentType.TEXT, content: preOrphan };
      }
      return null;
    }

    if (thinkStart === -1) {
      // No tag found — check for partial tag at end
      const lastBracket = this.buffer.lastIndexOf("<");
      if (lastBracket !== -1) {
        const potentialTag = this.buffer.slice(lastBracket);
        const tagLen = potentialTag.length;
        if (
          (tagLen < OPEN_TAG_LEN && OPEN_TAG.startsWith(potentialTag)) ||
          (tagLen < CLOSE_TAG_LEN && CLOSE_TAG.startsWith(potentialTag))
        ) {
          const emit = this.buffer.slice(0, lastBracket);
          this.buffer = this.buffer.slice(lastBracket);
          if (emit) {
            return { type: ContentType.TEXT, content: emit };
          }
          return null;
        }
      }

      const emit = this.buffer;
      this.buffer = "";
      if (emit) {
        return { type: ContentType.TEXT, content: emit };
      }
      return null;
    } else {
      // Found <think> tag
      const preThink = this.buffer.slice(0, thinkStart);
      this.buffer = this.buffer.slice(thinkStart + OPEN_TAG_LEN);
      this.inThinkTag = true;
      if (preThink) {
        return { type: ContentType.TEXT, content: preThink };
      }
      return null;
    }
  }

  private parseInsideThink(): ContentChunk | null {
    const thinkEnd = this.buffer.indexOf(CLOSE_TAG);

    if (thinkEnd === -1) {
      // No closing tag — check for partial at end
      const lastBracket = this.buffer.lastIndexOf("<");
      if (
        lastBracket !== -1 &&
        this.buffer.length - lastBracket < CLOSE_TAG_LEN
      ) {
        const potentialTag = this.buffer.slice(lastBracket);
        if (CLOSE_TAG.startsWith(potentialTag)) {
          const emit = this.buffer.slice(0, lastBracket);
          this.buffer = this.buffer.slice(lastBracket);
          if (emit) {
            return { type: ContentType.THINKING, content: emit };
          }
          return null;
        }
      }

      const emit = this.buffer;
      this.buffer = "";
      if (emit) {
        return { type: ContentType.THINKING, content: emit };
      }
      return null;
    } else {
      // Found </think> tag
      const thinkingContent = this.buffer.slice(0, thinkEnd);
      this.buffer = this.buffer.slice(thinkEnd + CLOSE_TAG_LEN);
      this.inThinkTag = false;
      if (thinkingContent) {
        return { type: ContentType.THINKING, content: thinkingContent };
      }
      return null;
    }
  }

  /** Flush any remaining buffered content. */
  flush(): ContentChunk | null {
    if (this.buffer) {
      const chunkType = this.inThinkTag ? ContentType.THINKING : ContentType.TEXT;
      const content = this.buffer;
      this.buffer = "";
      return { type: chunkType, content };
    }
    return null;
  }
}
