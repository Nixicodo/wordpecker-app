import { chromium } from 'playwright';

const FRONTEND_URL = process.env.SMOKE_FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.SMOKE_BACKEND_URL || 'http://localhost:3000';
const USER_ID = process.env.SMOKE_USER_ID || 'local-ai-test-user';
const REVIEW_TIMEOUT_MS = Number(process.env.SMOKE_REVIEW_TIMEOUT_MS || 20000);
const LEARNING_LABEL_ZH = '\u5b66\u4e60\u4e2d\uff1a';

const ensure = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

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

const collectConsoleErrors = (page, sink) => {
  page.on('pageerror', (error) => {
    sink.push(`pageerror: ${String(error)}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      sink.push(`console: ${message.text()}`);
    }
  });
};

const waitForLearningScreen = async (page, timeoutMs) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes(LEARNING_LABEL_ZH) || bodyText.includes('Learning:')) {
      return bodyText;
    }
    await page.waitForTimeout(500);
  }

  const finalBodyText = await page.locator('body').innerText();
  throw new Error(
    `Learning screen did not finish loading within ${timeoutMs}ms. Current text sample:\n${finalBodyText.slice(0, 800)}`
  );
};

const waitForDueReviewSummary = async (page, snapshot, timeoutMs) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const bodyText = await page.locator('body').innerText();
    const hasDueCount = bodyText.includes(String(snapshot.dueCount));
    const hasSourceListCount = bodyText.includes(String(snapshot.sourceListCount));

    if (hasDueCount && hasSourceListCount) {
      return bodyText;
    }

    await page.waitForTimeout(300);
  }

  const finalBodyText = await page.locator('body').innerText();
  throw new Error(
    `Due-review summary did not finish loading within ${timeoutMs}ms. Current text sample:\n${finalBodyText.slice(0, 800)}`
  );
};

const main = async () => {
  const snapshot = await fetchDueReviewSnapshot();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  const consoleErrors = [];

  collectConsoleErrors(page, consoleErrors);

  try {
    await page.goto(`${FRONTEND_URL}/lists`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    await page.locator('a[href="/reviews"]').click();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('due-review-page').waitFor({ state: 'visible', timeout: 15000 });

    await waitForDueReviewSummary(page, snapshot, 15000);

    await page.getByTestId('due-review-list-link').click();
    await page.waitForLoadState('networkidle');
    ensure(
      page.url().endsWith(`/lists/${snapshot.id}`),
      `Expected list detail route /lists/${snapshot.id}, got ${page.url()}`
    );

    const listDetailBody = await page.locator('body').innerText();
    ensure(
      listDetailBody.includes(String(snapshot.dueCount)),
      'Due-review list detail page does not show the aggregated due count'
    );

    await page.goto(`${FRONTEND_URL}/reviews`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await page.getByTestId('due-review-start-link').click();
    await page.waitForLoadState('domcontentloaded');
    ensure(
      page.url().endsWith(`/learn/${snapshot.id}`),
      `Expected learn route /learn/${snapshot.id}, got ${page.url()}`
    );

    const learningBody = await waitForLearningScreen(page, REVIEW_TIMEOUT_MS);
    ensure(
      learningBody.includes(snapshot.name),
      `Learning screen does not show list name "${snapshot.name}"`
    );

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
      finalUrl: page.url()
    }, null, 2));
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
