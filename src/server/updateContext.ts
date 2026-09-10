import { AsyncLocalStorage } from "node:async_hooks";

export const updateContext = new AsyncLocalStorage<{ receivedAt: Date; updateId: number }>();
export const updateReceivedAt = (): Date | undefined => updateContext.getStore()?.receivedAt;
