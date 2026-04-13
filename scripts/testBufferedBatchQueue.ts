import assert from 'node:assert/strict';
import { BufferedBatchQueue } from '../frontend/src/utils/bufferedBatchQueue';

type BatchItem = {
  id: string;
};

const makeBatch = (start: number, end: number): BatchItem[] => Array.from(
  { length: end - start + 1 },
  (_, index) => ({ id: String(start + index) })
);

const collectIds = (items: BatchItem[]) => items.map((item) => item.id);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const waitForCondition = async (predicate: () => boolean, timeoutMs = 200) => {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await tick();
  }
};

async function testBuffersThirdBatchAhead() {
  const calls: string[][] = [];
  const queuedResponses: Array<BatchItem[] | null> = [
    makeBatch(6, 10),
    makeBatch(11, 15),
    null
  ];

  const queue = new BufferedBatchQueue<BatchItem>({
    fetchBatch: async (excludeIds) => {
      calls.push(excludeIds);
      return queuedResponses.shift() ?? null;
    },
    collectIds,
    bufferSize: 2
  });

  queue.ensureBuffered(makeBatch(1, 5));
  await queue.waitForIdle();

  assert.equal(queue.getBufferedCount(), 2, 'should buffer the second and third batches');
  assert.deepEqual(
    calls,
    [
      ['1', '2', '3', '4', '5'],
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
    ],
    'prefetch should exclude the first batch first, then exclude the first two batches'
  );
}

async function testConsumeReturnsWhenNextBatchIsReady() {
  const calls: string[][] = [];
  let resolveFirstFetch!: (value: BatchItem[] | null) => void;
  let resolveSecondFetch!: (value: BatchItem[] | null) => void;
  let fetchCount = 0;

  const queue = new BufferedBatchQueue<BatchItem>({
    fetchBatch: async (excludeIds) => {
      calls.push(excludeIds);
      fetchCount += 1;

      return new Promise<BatchItem[] | null>((resolve) => {
        if (fetchCount === 1) {
          resolveFirstFetch = resolve;
          return;
        }

        resolveSecondFetch = resolve;
      });
    },
    collectIds,
    bufferSize: 2
  });

  queue.ensureBuffered(makeBatch(1, 5));
  const consumePromise = queue.consumeNext();

  await tick();
  resolveFirstFetch(makeBatch(6, 10));

  const consumedBatch = await consumePromise;
  assert.deepEqual(
    consumedBatch?.map((item) => item.id),
    ['6', '7', '8', '9', '10'],
    'consume should return the next batch as soon as it is ready'
  );

  queue.ensureBuffered([...makeBatch(1, 5), ...(consumedBatch ?? [])]);
  await waitForCondition(() => calls.length === 2);
  assert.deepEqual(
    calls,
    [
      ['1', '2', '3', '4', '5'],
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
    ],
    'after the second batch is consumed, the third batch should already be fetching in the background'
  );

  resolveSecondFetch(makeBatch(11, 15));
  await queue.waitForIdle();

  assert.equal(queue.getBufferedCount(), 1, 'third batch should remain buffered after the second batch is consumed');
}

async function main() {
  await testBuffersThirdBatchAhead();
  await testConsumeReturnsWhenNextBatchIsReady();
  console.log('buffered batch queue tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
