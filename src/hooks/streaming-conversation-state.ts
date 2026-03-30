import type { Message } from "@/lib/ai";

export type StreamPhase = "idle" | "preparing" | "streaming";

export type StreamingConversationState = {
  messages: Message[];
  isStreaming: boolean;
  streamPhase: StreamPhase;
};

export function createStreamingConversationState(
  messages: Message[] = [],
): StreamingConversationState {
  return {
    messages,
    isStreaming: false,
    streamPhase: "idle",
  };
}

export function beginStreamingConversation(
  messages: Message[],
  userMessage: Message,
): StreamingConversationState {
  return {
    messages: [...messages, userMessage, { role: "assistant", content: "" }],
    isStreaming: true,
    streamPhase: "preparing",
  };
}

export function appendAssistantChunk(
  messages: Message[],
  chunk: string,
): Message[] {
  if (messages.length === 0) {
    return messages;
  }

  const nextMessages = [...messages];
  const lastMessage = nextMessages[nextMessages.length - 1];

  if (lastMessage.role !== "assistant") {
    return messages;
  }

  nextMessages[nextMessages.length - 1] = {
    ...lastMessage,
    content: lastMessage.content + chunk,
  };

  return nextMessages;
}

export function appendAssistantError(
  messages: Message[],
  errorMessage: string,
): Message[] {
  if (messages.length === 0) {
    return messages;
  }

  const nextMessages = [...messages];
  const lastMessage = nextMessages[nextMessages.length - 1];

  if (lastMessage.role !== "assistant") {
    return messages;
  }

  const trimmedContent = lastMessage.content.trimEnd();
  const separator = trimmedContent.length > 0 ? "\n\n" : "";

  nextMessages[nextMessages.length - 1] = {
    ...lastMessage,
    content: `${trimmedContent}${separator}${errorMessage}`,
  };

  return nextMessages;
}

export function appendStreamingConversationChunk(
  state: StreamingConversationState,
  chunk: string,
): StreamingConversationState {
  return {
    messages: appendAssistantChunk(state.messages, chunk),
    isStreaming: true,
    streamPhase: "streaming",
  };
}

export function replaceStreamingConversationText(
  state: StreamingConversationState,
  content: string,
): StreamingConversationState {
  return {
    messages: replaceAssistantMessage(state.messages, content),
    isStreaming: true,
    streamPhase: "streaming",
  };
}

export function restartStreamingConversation(
  state: StreamingConversationState,
): StreamingConversationState {
  if (state.messages.length === 0) {
    return {
      ...state,
      isStreaming: true,
      streamPhase: "preparing",
    };
  }

  const nextMessages = [...state.messages];
  const lastMessage = nextMessages[nextMessages.length - 1];

  if (lastMessage.role !== "assistant") {
    return {
      ...state,
      isStreaming: true,
      streamPhase: "preparing",
    };
  }

  nextMessages[nextMessages.length - 1] = {
    ...lastMessage,
    content: "",
  };

  return {
    messages: nextMessages,
    isStreaming: true,
    streamPhase: "preparing",
  };
}

function replaceAssistantMessage(
  messages: Message[],
  content: string,
): Message[] {
  if (messages.length === 0) {
    return messages;
  }

  const nextMessages = [...messages];
  const lastMessage = nextMessages[nextMessages.length - 1];

  if (lastMessage.role !== "assistant") {
    return messages;
  }

  nextMessages[nextMessages.length - 1] = {
    ...lastMessage,
    content,
  };

  return nextMessages;
}

export function failStreamingConversation(
  state: StreamingConversationState,
  errorMessage: string,
): StreamingConversationState {
  return {
    messages: appendAssistantError(state.messages, errorMessage),
    isStreaming: false,
    streamPhase: "idle",
  };
}

export function finishStreamingConversation(
  state: StreamingConversationState,
): StreamingConversationState {
  return {
    ...state,
    isStreaming: false,
    streamPhase: "idle",
  };
}

export function resolveStreamingConversation(
  state: StreamingConversationState,
  assistantContent: string,
): StreamingConversationState {
  return {
    messages: replaceAssistantMessage(state.messages, assistantContent),
    isStreaming: false,
    streamPhase: "idle",
  };
}
