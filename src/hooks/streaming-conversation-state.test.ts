import { describe, expect, it } from "vitest";
import type { Message } from "@/lib/ai";
import {
  appendStreamingConversationChunk,
  beginStreamingConversation,
  createStreamingConversationState,
  failStreamingConversation,
  finishStreamingConversation,
  restartStreamingConversation,
  resolveStreamingConversation,
} from "@/hooks/streaming-conversation-state";

function createUserMessage(content: string): Message {
  return {
    role: "user",
    content,
  };
}

describe("streaming conversation state", () => {
  it("transitions from idle to preparing to streaming to idle", () => {
    const initialState = createStreamingConversationState();
    expect(initialState.streamPhase).toBe("idle");
    expect(initialState.isStreaming).toBe(false);

    const preparingState = beginStreamingConversation(
      initialState.messages,
      createUserMessage("What changed today?"),
    );
    expect(preparingState.streamPhase).toBe("preparing");
    expect(preparingState.isStreaming).toBe(true);
    expect(preparingState.messages).toEqual([
      { role: "user", content: "What changed today?" },
      { role: "assistant", content: "" },
    ]);

    const streamingState = appendStreamingConversationChunk(preparingState, "Breaking news");
    expect(streamingState.streamPhase).toBe("streaming");
    expect(streamingState.isStreaming).toBe(true);
    expect(streamingState.messages[1]?.content).toBe("Breaking news");

    const completedState = finishStreamingConversation(streamingState);
    expect(completedState.streamPhase).toBe("idle");
    expect(completedState.isStreaming).toBe(false);
    expect(completedState.messages[1]?.content).toBe("Breaking news");
  });

  it("keeps appending assistant content as chunks arrive", () => {
    const preparingState = beginStreamingConversation(
      [],
      createUserMessage("Summarize this article"),
    );

    const nextState = appendStreamingConversationChunk(preparingState, "First");
    const finalState = appendStreamingConversationChunk(nextState, " second");

    expect(finalState.messages[1]?.content).toBe("First second");
  });

  it("preserves streamed text and appends the error message on failure", () => {
    const preparingState = beginStreamingConversation(
      [],
      createUserMessage("Walk me through it"),
    );
    const streamingState = appendStreamingConversationChunk(preparingState, "Partial answer");

    const failedState = failStreamingConversation(
      streamingState,
      "**Error:** MockAI: Streaming response was interrupted. socket closed",
    );

    expect(failedState.streamPhase).toBe("idle");
    expect(failedState.isStreaming).toBe(false);
    expect(failedState.messages[1]?.content).toBe(
      "Partial answer\n\n**Error:** MockAI: Streaming response was interrupted. socket closed",
    );
  });

  it("clears the in-flight assistant text when a streamed answer is restarted", () => {
    const preparingState = beginStreamingConversation(
      [],
      createUserMessage("What is OpenClaw?"),
    );
    const streamingState = appendStreamingConversationChunk(preparingState, "Half a sentence");

    const restartedState = restartStreamingConversation(streamingState);

    expect(restartedState.streamPhase).toBe("preparing");
    expect(restartedState.isStreaming).toBe(true);
    expect(restartedState.messages[1]?.content).toBe("");
  });

  it("replaces the streamed assistant draft with the resolved final answer", () => {
    const preparingState = beginStreamingConversation(
      [],
      createUserMessage("What is OpenClaw?"),
    );
    const streamingState = appendStreamingConversationChunk(preparingState, "Draft answer");

    const resolvedState = resolveStreamingConversation(streamingState, "Final answer");

    expect(resolvedState.streamPhase).toBe("idle");
    expect(resolvedState.isStreaming).toBe(false);
    expect(resolvedState.messages[1]?.content).toBe("Final answer");
  });
});
