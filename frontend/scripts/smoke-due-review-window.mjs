import { chromium } from 'playwright';

const FRONTEND_URL = process.env.SMOKE_FRONTEND_URL || 'http://localhost:4174';
const BACKEND_URL = process.env.SMOKE_BACKEND_URL || 'http://localhost:3000';
const USER_ID = process.env.SMOKE_USER_ID || 'local-ai-test-user';
const REVIEW_TIMEOUT_MS = Number(process.env.SMOKE_REVIEW_TIMEOUT_MS || 30000);
const LEARNING_LABEL_ZH = '\u5b66\u4e60\u4e2d\uff1a';
const MEANING_TO_WORD_LABEL = '\u7ed9\u4e49\u7b54\u8bcd';
const WORD_TO_MEANING_LABEL = '\u7ed9\u8bcd\u7b54\u4e49';
const LEGACY_START_LABEL = '\u5f00\u59cb\u590d\u4e60';

const ensure = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const waitFor = async (predicate, description, timeoutMs = REVIEW_TIMEOUT_MS) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await predicate();
    if (result) {
      return result;
    }

    await sleep(250);
  }

  throw new Error(`${description} did not finish within ${timeoutMs}ms`);
};

const fetchDueReviewSnapshot = async () => {
  const response = await fetch(`${BACKEND_URL}/api/lists/due-review`, {
    headers: { 'user-id': USER_ID }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch due-review snapshot: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

const waitForBodyText = async (page, timeoutMs, predicate, description) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const bodyText = await page.locator('body').innerText();
    if (predicate(bodyText)) {
      return bodyText;
    }

    await sleep(250);
  }

  const finalBodyText = await page.locator('body').innerText();
  throw new Error(
    `${description} did not finish loading within ${timeoutMs}ms. Current text sample:\n${finalBodyText.slice(0, 1200)}`
  );
};

const waitForStartPayload = async (startPayloads, expectedCount, timeoutMs, label) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (startPayloads.length >= expectedCount) {
      return startPayloads[expectedCount - 1];
    }

    await sleep(250);
  }

  throw new Error(`${label} did not finish within ${timeoutMs}ms`);
};

const assertHubEntries = async (page, snapshot) => {
  await page.getByTestId('due-review-page').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('due-review-start-meaning-to-word-link').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('due-review-start-word-to-meaning-link').waitFor({ state: 'visible', timeout: 15000 });

  const bodyText = await page.locator('body').innerText();
  ensure(bodyText.includes(String(snapshot.dueCount)), 'Due-review hub does not show dueCount');
  ensure(bodyText.includes(String(snapshot.sourceListCount)), 'Due-review hub does not show sourceListCount');
  ensure(bodyText.includes(MEANING_TO_WORD_LABEL), 'Due-review hub should show 给义答词');
  ensure(bodyText.includes(WORD_TO_MEANING_LABEL), 'Due-review hub should show 给词答义');
  ensure(!bodyText.includes(LEGACY_START_LABEL), 'Due-review hub should no longer show 开始复习');
};

const assertListDetailEntries = async (page, snapshot) => {
  ensure(
    page.url().endsWith(`/lists/${snapshot.id}`),
    `Expected list detail route /lists/${snapshot.id}, got ${page.url()}`
  );
  await page.getByTestId('due-review-list-start-meaning-to-word-button').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('due-review-list-start-word-to-meaning-button').waitFor({ state: 'visible', timeout: 15000 });

  const bodyText = await page.locator('body').innerText();
  ensure(bodyText.includes(MEANING_TO_WORD_LABEL), 'Due-review list detail should show 给义答词');
  ensure(bodyText.includes(WORD_TO_MEANING_LABEL), 'Due-review list detail should show 给词答义');
  ensure(!bodyText.includes(LEGACY_START_LABEL), 'Due-review list detail should no longer show 开始复习');
};

const main = async () => {
  const snapshot = await fetchDueReviewSnapshot();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  const consoleErrors = [];
  const startPayloads = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    consoleErrors.push(String(error));
  });

  page.on('response', async (response) => {
    if (/\/api\/learn\/[^/]+\/start$/.test(response.url())) {
      startPayloads.push(await response.json());
    }
  });

  try {
    await page.goto(`${FRONTEND_URL}/reviews`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    await assertHubEntries(page, snapshot);

    await page.getByTestId('due-review-list-link').click();
    await page.waitForLoadState('networkidle');
    await assertListDetailEntries(page, snapshot);

    await page.goto(`${FRONTEND_URL}/reviews`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await assertHubEntries(page, snapshot);

    await page.getByTestId('due-review-start-meaning-to-word-link').click();
    await page.waitForLoadState('domcontentloaded');

    const startPayload = await waitForStartPayload(startPayloads, 1, REVIEW_TIMEOUT_MS, 'meaning_to_word learn start payload');
    ensure(
      startPayload?.reviewMode === 'meaning_to_word',
      `Expected reviewMode "meaning_to_word", got "${startPayload?.reviewMode ?? 'undefined'}"`
    );
    await waitForBodyText(page, REVIEW_TIMEOUT_MS, (bodyText) => (
      bodyText.includes(LEARNING_LABEL_ZH) &&
      bodyText.includes(MEANING_TO_WORD_LABEL) &&
      bodyText.includes(snapshot.name)
    ), 'meaning_to_word learning screen');

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
    }

    console.log(JSON.stringify({
      status: 'ok',
      snapshot: {
        id: snapshot.id,
        dueCount: snapshot.dueCount,
        sourceListCount: snapshot.sourceListCount
      },
      startReviewMode: startPayload.reviewMode,
      exerciseCount: startPayload.exercises?.length || 0,
      finalUrl: page.url()
    }, null, 2));
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
