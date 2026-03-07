import { Logger } from '@nestjs/common';

export async function safeAllSettled<T>(
  promises: (Promise<T> | PromiseLike<T>)[],
  logger: Logger,
  actionName: string = 'Queue of Promises',
): Promise<PromiseSettledResult<T>[]> {
  const results = await Promise.allSettled(promises);

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error(
        `[${actionName}] Error in Promise #${index}: ${result.reason}`,
      );
    }
  });

  return results;
}
