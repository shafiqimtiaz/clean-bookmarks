// Generic batching + bounded-concurrency pool (locked: pool of 3).

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

// Run `worker` over `items` with at most `concurrency` in flight. Calls
// `onResult` as each completes (for live progress + partial-safe accumulation).
export async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onResult?: (result: R, index: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++;
      const r = await worker(items[i]!, i);
      results[i] = r;
      onResult?.(r, i);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  );
  return results;
}
