import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/ai";

type ConversationBuilder = (
  history: Message[],
  userMessage: Message,
) => Promise<Message[]> | Message[];

type SendConversationInput = {
  content: string;
  buildConversation: ConversationBuilder;
};

function appendAssistantChunk(messages: Message[], chunk: string): Message[] {
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

export function useStreamingConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const isStreamingRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const replaceMessages = useCallback((nextMessages: Message[]) => {
    stop();
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }, [stop]);

  const clear = useCallback(() => {
    replaceMessages([]);
  }, [replaceMessages]);

  const replaceAssistantMessage = useCallback((content: string) => {
    setMessages((currentMessages) => {
      if (currentMessages.length === 0) {
        return currentMessages;
      }

      const nextMessages = [...currentMessages];
      const lastMessage = nextMessages[nextMessages.length - 1];

      if (lastMessage.role !== "assistant") {
        return currentMessages;
      }

      nextMessages[nextMessages.length - 1] = {
        ...lastMessage,
        content,
      };

      messagesRef.current = nextMessages;
      return nextMessages;
    });
  }, []);

  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error || "Unknown AI error.");
  }

  const send = useCallback(async ({ content, buildConversation }: SendConversationInput) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isStreamingRef.current) {
      return;
    }

    const history = messagesRef.current;
    const userMessage: Message = {
      role: "user",
      content: trimmedContent,
    };
    const assistantPlaceholder: Message = {
      role: "assistant",
      content: "",
    };

    const abortController = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = abortController;

    const pendingMessages = [...history, userMessage, assistantPlaceholder];
    messagesRef.current = pendingMessages;
    isStreamingRef.current = true;

    setMessages(pendingMessages);
    setIsStreaming(true);

    try {
      const conversation = await buildConversation(history, userMessage);
      if (abortController.signal.aborted) {
        return;
      }

      const { streamConversation } = await import("@/lib/ai");

      await streamConversation(
        conversation,
        (chunk) => {
          setMessages((currentMessages) => {
            const nextMessages = appendAssistantChunk(currentMessages, chunk);
            messagesRef.current = nextMessages;
            return nextMessages;
          });
        },
        abortController.signal,
      );
    } catch (error) {
      if (!abortController.signal.aborted) {
        replaceAssistantMessage(`**Error:** ${getErrorMessage(error)}`);
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }

      isStreamingRef.current = false;
      setIsStreaming(false);
    }
  }, [replaceAssistantMessage]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    messages,
    isStreaming,
    send,
    stop,
    clear,
    replaceMessages,
  };
}
