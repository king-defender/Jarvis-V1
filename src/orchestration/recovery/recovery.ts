export type ErrorClass =
  | 'TRANSIENT_NETWORK'
  | 'AUTHENTICATION'
  | 'DOWNSTREAM_OUTAGE'
  | 'LOGICAL_VIOLATION';

export interface CompensableTask<TPayload = unknown, TResult = unknown> {
  execute(payload: TPayload): Promise<TResult>;
  compensate(payload: TPayload): Promise<void>;
}

export function classifyError(error: unknown): ErrorClass {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
    return 'AUTHENTICATION';
  }
  if (message.includes('validation') || message.includes('schema') || message.includes('invalid')) {
    return 'LOGICAL_VIOLATION';
  }
  if (message.includes('timeout') || message.includes('llm') || message.includes('model')) {
    return 'DOWNSTREAM_OUTAGE';
  }
  if (message.includes('429') || message.includes('503') || message.includes('econn') || message.includes('network')) {
    return 'TRANSIENT_NETWORK';
  }
  return 'TRANSIENT_NETWORK';
}

export function shouldRetry(errorClass: ErrorClass): boolean {
  return errorClass === 'TRANSIENT_NETWORK' || errorClass === 'DOWNSTREAM_OUTAGE';
}

export function backoffDelayMs(attempt: number): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 200) - 100;
  return Math.max(0, base + jitter);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const errorClass = classifyError(error);
      if (!shouldRetry(errorClass) || attempt >= maxAttempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffDelayMs(attempt)));
      attempt += 1;
    }
  }
}

export class SagaCoordinator {
  async run<TPayload>(
    steps: CompensatableStep<TPayload>[],
    payload: TPayload,
  ): Promise<void> {
    const completed: CompensatableStep<TPayload>[] = [];
    try {
      for (const step of steps) {
        await step.execute(payload);
        completed.push(step);
      }
    } catch (error) {
      for (const step of completed.reverse()) {
        await step.compensate(payload);
      }
      throw error;
    }
  }
}

export type CompensatableStep<TPayload> = CompensableTask<TPayload>;

export const DLQ_NAME = 'command_os_dlq';
