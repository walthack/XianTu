export interface LatestWriteQueue<T> {
  enqueue(value: T): void;
  flush(): Promise<void>;
}

/**
 * 串行执行写入，但排队期间只保留最新值。适合配置自动同步：不会并发乱序覆盖，
 * 高频 UI 修改也不会把每个中间态都上传。
 */
export function createLatestWriteQueue<T>(write: (value: T) => Promise<void>): LatestWriteQueue<T> {
  let pending: T | undefined;
  let running: Promise<void> | null = null;

  const start = () => {
    if (running || pending === undefined) return;
    running = (async () => {
      while (pending !== undefined) {
        const value = pending;
        pending = undefined;
        await write(value);
      }
    })().finally(() => {
      running = null;
      // enqueue 可能恰好发生在循环退出与 finally 之间，必须重新起泵。
      if (pending !== undefined) start();
    });
  };

  return {
    enqueue(value: T) {
      pending = value;
      start();
    },
    async flush() {
      do {
        if (!running && pending !== undefined) start();
        if (running) await running;
      } while (running || pending !== undefined);
    },
  };
}
