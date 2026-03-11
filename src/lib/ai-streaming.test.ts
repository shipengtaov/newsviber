import { afterEach, describe, expect, it, vi } from "vitest";

const { streamTextMock, getActiveAIProviderSettingsMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  getActiveAIProviderSettingsMock: vi.fn(() => ({
    providerId: "openai",
    provider: {
      id: "openai",
      name: "MockAI",
      url: "https://api.openai.com/v1",
      models: ["gpt-4o"],
      iconUrl: "",
    },
    config: {
      url: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4o",
    },
  })),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    streamText: streamTextMock,
  };
});

vi.mock("@/lib/ai-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai-config")>("@/lib/ai-config");

  return {
    ...actual,
    getActiveAIProviderSettings: getActiveAIProviderSettingsMock,
  };
});

import { streamConversation } from "@/lib/ai";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function textDelta(text: string) {
  return {
    type: "text-delta" as const,
    id: "text-1",
    text,
  };
}

afterEach(() => {
  streamTextMock.mockReset();
  getActiveAIProviderSettingsMock.mockClear();
});

describe("streamConversation", () => {
  it("streams text deltas before the full response completes", async () => {
    const continueStream = createDeferred<void>();
    const firstChunkDelivered = createDeferred<void>();

    streamTextMock.mockImplementation(() => ({
      fullStream: (async function* () {
        yield textDelta("Hello");
        firstChunkDelivered.resolve();
        await continueStream.promise;
        yield textDelta(" world");
      })(),
    }));

    const chunks: string[] = [];
    const completionPromise = streamConversation(
      [{ role: "user", content: "Say hello" }],
      (chunk) => {
        chunks.push(chunk);
      },
    );

    await firstChunkDelivered.promise;
    expect(chunks).toEqual(["Hello"]);

    continueStream.resolve();
    await expect(completionPromise).resolves.toBe("Hello world");
    expect(chunks).toEqual(["Hello", " world"]);
    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
      timeout: { chunkMs: 10_000 },
    }));
  });

  it("throws a clear error when streaming never starts", async () => {
    streamTextMock.mockImplementation(() => ({
      fullStream: (async function* () {
        yield {
          type: "abort" as const,
          reason: "No stream chunk arrived within 10 seconds.",
        };
      })(),
    }));

    await expect(
      streamConversation([{ role: "user", content: "Hello" }], vi.fn()),
    ).rejects.toThrow(
      "MockAI: Streaming chat requires real-time chunked output. No stream chunk arrived within 10 seconds. Please switch to a provider/model that supports streaming.",
    );
  });

  it("wraps mid-stream provider failures as streaming interruptions", async () => {
    streamTextMock.mockImplementation(() => ({
      fullStream: (async function* () {
        yield textDelta("Partial");
        yield {
          type: "error" as const,
          error: new Error("socket closed"),
        };
      })(),
    }));

    await expect(
      streamConversation([{ role: "user", content: "Hello" }], vi.fn()),
    ).rejects.toThrow("MockAI: Streaming response was interrupted. socket closed");
  });
});
