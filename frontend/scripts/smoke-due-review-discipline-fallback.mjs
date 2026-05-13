import { chromium } from 'playwright';

const FRONTEND_URL = process.env.SMOKE_FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.SMOKE_BACKEND_URL || 'http://localhost:3000';
const USER_ID = process.env.SMOKE_USER_ID || 'local-ai-test-user';
const REVIEW_TIMEOUT_MS = Number(process.env.SMOKE_REVIEW_TIMEOUT_MS || 20000);
const MEANING_TO_WORD_LABEL = '\u7ed9\u4e49\u7b54\u8bcd';
const WARNING_TITLE = '\u7eaa\u5f8b\u72b6\u6001\u6682\u65f6\u4e0d\u53ef\u7528';
const WARNING_BODY = '\u4eca\u5929\u7684\u7eaa\u5f8b\u989d\u5ea6\u6682\u65f6\u52a0\u8f7d\u5931\u8d25\uff0c\u4e0d\u5f71\u54cd\u4f60\u7ee7\u7eed\u5904\u7406\u5f85\u590d\u4e60\u3002';
const LEARNING_LABEL_ZH = '\u5b66\u4e60\u4e2d\uff1a';

const ensure = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const fetchDueReviewSnapshot = async () => {
  const response = await fetch(`${BACKEND_URL}/api/lists/due-review`, {
    headers: {
      'user-id': USER_ID
    }
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

const main = async () => {
  const snapshot = await fetchDueReviewSnapshot();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  const pageErrors = [];
  const startPayloads = [];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  page.on('response', async (response) => {
    if (/\/api\/learn\/[^/]+\/start$/.test(response.url())) {
      startPayloads.push(await response.json());
    }
  });

  await page.route(`${BACKEND_URL}/api/lists/discipline-status`, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'forced discipline status failure' })
    });
  });

  try {
    await page.goto(`${FRONTEND_URL}/reviews`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    await page.getByTestId('due-review-page').waitFor({ state: 'visible', timeout: 15000 });

    const bodyText = await waitForBodyText(page, REVIEW_TIMEOUT_MS, (currentBodyText) => (
      currentBodyText.includes(String(snapshot.dueCount)) &&
      currentBodyText.includes(String(snapshot.sourceListCount)) &&
      currentBodyText.includes(MEANING_TO_WORD_LABEL)
    ), 'due-review fallback page');

    ensure(
      bodyText.includes(WARNING_TITLE),
      `Expected fallback page to show warning title "${WARNING_TITLE}"`
    );
    ensure(
      bodyText.includes(WARNING_BODY),
      `Expected fallback page to show warning body "${WARNING_BODY}"`
    );

    await page.getByTestId('due-review-start-meaning-to-word-link').click();
    await page.waitForLoadState('domcontentloaded');

    const payload = await waitForStartPayload(startPayloads, 1, REVIEW_TIMEOUT_MS, 'meaning_to_word learn start payload');
    ensure(
      payload?.reviewMode === 'meaning_to_word',
      `Expected reviewMode "meaning_to_word", got "${payload?.reviewMode ?? 'undefined'}"`
    );

    const learningBodyText = await waitForBodyText(page, REVIEW_TIMEOUT_MS, (currentBodyText) => (
      currentBodyText.includes(LEARNING_LABEL_ZH) &&
      currentBodyText.includes(MEANING_TO_WORD_LABEL) &&
      currentBodyText.includes(snapshot.name)
    ), 'meaning_to_word learning screen');

    ensure(
      learningBodyText.includes(snapshot.name),
      `Learning screen does not show list name "${snapshot.name}"`
    );

    if (pageErrors.length > 0) {
      throw new Error(`Page errors detected:\n${pageErrors.join('\n')}`);
    }

    console.log(JSON.stringify({
      status: 'ok',
      snapshot: {
        id: snapshot.id,
        dueCount: snapshot.dueCount,
        sourceListCount: snapshot.sourceListCount
      },
      warning: WARNING_TITLE,
      reviewMode: payload.reviewMode,
      exerciseCount: payload.exercises.length,
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
