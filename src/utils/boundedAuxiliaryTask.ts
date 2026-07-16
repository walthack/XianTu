export type BoundedTaskResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'timed_out' }
  | { status: 'failed'; error: unknown };

/**
 * 给非关键辅助任务设置主流程等待上限。
 *
 * 调用方必须把隔离副本传给 work，并且只在 status=completed 时合并结果。
 * Promise 超时后可能仍会在后台结束；隔离副本保证晚到结果不能污染已提交的主状态。
 */
export async function runBoundedAuxiliaryTask<T>(
  work: () => Promise<T>,
  timeoutMs: number,
): Promise<BoundedTaskResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<BoundedTaskResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'timed_out' }), Math.max(0, timeoutMs));
  });

  const settled: Promise<BoundedTaskResult<T>> = (async () => {
    try {
      return { status: 'completed', value: await work() };
    } catch (error) {
      return { status: 'failed', error };
    }
  })();

  try {
    return await Promise.race([settled, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
