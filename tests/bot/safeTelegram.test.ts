import { safeSendMessage } from "../../src/bot/safeTelegram";
import * as eventLog from "../../src/server/logging/eventLog";

describe("safeTelegram", () => {
  const flushRetryTimers = async () => {
    await Promise.resolve();
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("retries on 429 with retry_after", async () => {
    jest.useFakeTimers();
    const error429 = Object.assign(new Error("Too Many Requests"), {
      response: {
        error_code: 429,
        description: "Too Many Requests",
        parameters: { retry_after: 1 }
      }
    });

    const callApi = jest.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce({ message_id: 1 });

    jest.spyOn(eventLog, "logEvent").mockResolvedValue();

    const telegram = { callApi } as any;

    const promise = safeSendMessage(telegram, 1, "test");
    await flushRetryTimers();
    const result = await promise;

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it("does not retry on chat not found", async () => {
    const error400 = Object.assign(new Error("Bad Request"), {
      response: {
        error_code: 400,
        description: "Bad Request: chat not found"
      }
    });

    const callApi = jest.fn().mockRejectedValueOnce(error400);
    const logSpy = jest.spyOn(eventLog, "logEvent").mockResolvedValue();
    const telegram = { callApi } as any;

    const result = await safeSendMessage(telegram, 2, "hello");

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(logSpy).toHaveBeenCalled();
  });

  it("retries on transient network error", async () => {
    jest.useFakeTimers();
    const networkError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });

    const callApi = jest.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ message_id: 2 });

    jest.spyOn(eventLog, "logEvent").mockResolvedValue();
    const telegram = { callApi } as any;

    const promise = safeSendMessage(telegram, 3, "ping");
    await flushRetryTimers();
    const result = await promise;

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });
});
