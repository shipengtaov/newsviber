import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/ai";
import {
  appendStreamingConversationChunk,
  beginStreamingConversation,
  createStreamingConversationState,
  failStreamingConversation,
  finishStreamingConversation,
  type StreamPhase,
  type StreamingConversationState,
} from "@/hooks/streaming-conversation-state";

export type { StreamPhase } from "@/hooks/streaming-conversation-state";

type ConversationBuilder = (
  history: Message[],
  userMessage: Message,
) => Promise<Message[]> | Message[];

type SendConversationInput = {
  content: string;
  buildConversation: ConversationBuilder;
  onUserMessageCommitted?: (input: {
    history: Message[];
    userMessage: Message;
    pendingMessages: Message[];
  }) => Promise<void> | void;
  onAssistantComplete?: (input: {
    history: Message[];
    userMessage: Message;
    assistantMessage: Message;
  }) => Promise<void> | void;
  onAssistantError?: (input: {
    history: Message[];
    userMessage: Message;
    assistantMessage: Message;
    error: unknown;
  }) => Promise<void> | void;
};

export function useStreamingConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle");
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const isStreamingRef = useRef(false);
  const streamPhaseRef = useRef<StreamPhase>("idle");

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    streamPhaseRef.current = streamPhase;
  }, [streamPhase]);

  const applyState = useCallback((nextState: StreamingConversationState) => {
    messagesRef.current = nextState.messages;
    isStreamingRef.current = nextState.isStreaming;
    streamPhaseRef.current = nextState.streamPhase;
    setMessages(nextState.messages);
    setIsStreaming(nextState.isStreaming);
    setStreamPhase(nextState.streamPhase);
  }, []);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    applyState(finishStreamingConversation(createStreamingConversationState(messagesRef.current)));
  }, [applyState]);

  const replaceMessages = useCallback((nextMessages: Message[]) => {
    stop();
    applyState(createStreamingConversationState(nextMessages));
  }, [applyState, stop]);

  const clear = useCallback(() => {
    replaceMessages([]);
  }, [replaceMessages]);

  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error || "Unknown AI error.");
  }

  const send = useCallback(async ({
    content,
    buildConversation,
    onUserMessageCommitted,
    onAssistantComplete,
    onAssistantError,
  }: SendConversationInput) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isStreamingRef.current) {
      return;
    }

    const history = messagesRef.current;
    const userMessage: Message = {
      role: "user",
      content: trimmedContent,
    };
    const abortController = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = abortController;

    const pendingState = beginStreamingConversation(history, userMessage);
    const pendingMessages = pendingState.messages;
    applyState(pendingState);

    try {
      await onUserMessageCommitted?.({
        history,
        userMessage,
        pendingMessages,
      });

      if (abortController.signal.aborted) {
        return;
      }

      const conversation = await buildConversation(history, userMessage);
      if (abortController.signal.aborted) {
        return;
      }

      const { streamConversation } = await import("@/lib/ai");

      const fullText = await streamConversation(
        conversation,
        (chunk) => {
          applyState(
            appendStreamingConversationChunk(
              {
                messages: messagesRef.current,
                isStreaming: isStreamingRef.current,
                streamPhase: streamPhaseRef.current,
              },
              chunk,
            ),
          );
        },
        abortController.signal,
      );

      await onAssistantComplete?.({
        history,
        userMessage,
        assistantMessage: {
          role: "assistant",
          content: fullText,
        },
      });
    } catch (error) {
      if (!abortController.signal.aborted) {
        const errorMessage = `**Error:** ${getErrorMessage(error)}`;
        const failedState = failStreamingConversation(
          {
            messages: messagesRef.current,
            isStreaming: isStreamingRef.current,
            streamPhase: streamPhaseRef.current,
          },
          errorMessage,
        );
        applyState(failedState);
        const assistantMessage = failedState.messages[failedState.messages.length - 1];
        await onAssistantError?.({
          history,
          userMessage,
          assistantMessage: {
            role: "assistant",
            content: assistantMessage?.role === "assistant" ? assistantMessage.content : errorMessage,
          },
          error,
        });
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        applyState(
          finishStreamingConversation({
            messages: messagesRef.current,
            isStreaming: isStreamingRef.current,
            streamPhase: streamPhaseRef.current,
          }),
        );
      }
    }
  }, [applyState]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    messages,
    isStreaming,
    streamPhase,
    send,
    stop,
    clear,
    replaceMessages,
  };
}
