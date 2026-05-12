import { chromium } from 'playwright';

const FRONTEND_URL = process.env.SMOKE_FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.SMOKE_BACKEND_URL || 'http://localhost:3000';
const USER_ID = process.env.SMOKE_USER_ID || 'local-ai-test-user';
const REVIEW_TIMEOUT_MS = Number(process.env.SMOKE_REVIEW_TIMEOUT_MS || 20000);
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

const looksLikeSupportedQuestion = (value) => typeof value === 'string' && value.trim().length > 0;

const exerciseSignature = (exercise) => JSON.stringify({
  type: exercise.type,
  wordId: exercise.wordId ?? null,
  wordIds: exercise.wordIds ?? [],
  word: exercise.word ?? null,
  correctAnswer: exercise.correctAnswer ?? null,
  question: exercise.question ?? null
});

const payloadSignature = (payload) => JSON.stringify(
  (payload?.exercises ?? []).map(exerciseSignature)
);

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

const waitForLearningScreen = async (page, timeoutMs, modeLabel) => {
  return waitForBodyText(page, timeoutMs, (bodyText) => (
    bodyText.includes(LEARNING_LABEL_ZH) && bodyText.includes(modeLabel)
  ), `learning screen for ${modeLabel}`);
};

const waitForDueReviewSummary = async (page, snapshot, timeoutMs) => {
  return waitForBodyText(page, timeoutMs, (bodyText) => (
    bodyText.includes(String(snapshot.dueCount)) && bodyText.includes(String(snapshot.sourceListCount))
  ), 'due-review summary');
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

const assertHubEntries = async (page) => {
  await page.getByTestId('due-review-start-meaning-to-word-link').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('due-review-start-word-to-meaning-link').waitFor({ state: 'visible', timeout: 15000 });

  ensure(
    await page.getByText(MEANING_TO_WORD_LABEL, { exact: true }).count() >= 1,
    'Expected due-review hub to show the 给义答词 entry'
  );
  ensure(
    await page.getByText(WORD_TO_MEANING_LABEL, { exact: true }).count() >= 1,
    'Expected due-review hub to show the 给词答义 entry'
  );
  ensure(
    await page.getByText(LEGACY_START_LABEL, { exact: true }).count() === 0,
    'Due-review hub should no longer show the legacy 开始复习 label'
  );
};

const assertListDetailEntries = async (page, snapshot) => {
  await page.getByTestId('due-review-list-start-meaning-to-word-button').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('due-review-list-start-word-to-meaning-button').waitFor({ state: 'visible', timeout: 15000 });

  const bodyText = await page.locator('body').innerText();
  ensure(
    bodyText.includes(String(snapshot.dueCount)),
    'Due-review list detail page does not show the aggregated due count'
  );
  ensure(
    bodyText.includes(MEANING_TO_WORD_LABEL),
    'Due-review list detail page should show the 给义答词 entry'
  );
  ensure(
    bodyText.includes(WORD_TO_MEANING_LABEL),
    'Due-review list detail page should show the 给词答义 entry'
  );
  ensure(
    !bodyText.includes(LEGACY_START_LABEL),
    'Due-review list detail page should no longer show the legacy 开始复习 label'
  );
};

const assertLearnEntry = async (page, snapshot, payload, expectedMode, expectedLabel) => {
  ensure(
    page.url().endsWith(`/learn/${snapshot.id}`),
    `Expected learn route /learn/${snapshot.id}, got ${page.url()}`
  );

  const learningBody = await waitForLearningScreen(page, REVIEW_TIMEOUT_MS, expectedLabel);
  ensure(
    learningBody.includes(snapshot.name),
    `Learning screen does not show list name "${snapshot.name}"`
  );

  ensure(
    payload?.reviewMode === expectedMode,
    `Expected learn start payload reviewMode to be "${expectedMode}", got "${payload?.reviewMode ?? 'undefined'}"`
  );
  ensure(
    Array.isArray(payload?.exercises) && payload.exercises.length > 0,
    `Expected ${expectedMode} entry to return at least one exercise`
  );
  ensure(
    payload.exercises.every((exercise) => looksLikeSupportedQuestion(exercise.question)),
    `Expected ${expectedMode} entry to return non-empty question text for every exercise`
  );
};

const main = async () => {
  const snapshot = await fetchDueReviewSnapshot();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  const consoleErrors = [];
  const startPayloads = [];

  collectConsoleErrors(page, consoleErrors);
  page.on('response', async (response) => {
    const url = response.url();

    if (/\/api\/learn\/[^/]+\/start$/.test(url)) {
      startPayloads.push(await response.json());
    }
  });

  try {
    await page.goto(`${FRONTEND_URL}/lists`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    await page.locator('a[href="/reviews"]').click();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('due-review-page').waitFor({ state: 'visible', timeout: 15000 });

    await waitForDueReviewSummary(page, snapshot, 15000);
    await assertHubEntries(page);

    await page.getByTestId('due-review-list-link').click();
    await page.waitForLoadState('networkidle');
    ensure(
      page.url().endsWith(`/lists/${snapshot.id}`),
      `Expected list detail route /lists/${snapshot.id}, got ${page.url()}`
    );
    await assertListDetailEntries(page, snapshot);

    await page.goto(`${FRONTEND_URL}/reviews`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await assertHubEntries(page);

    await page.getByTestId('due-review-start-meaning-to-word-link').click();
    await page.waitForLoadState('domcontentloaded');
    const meaningToWordPayload = await waitForStartPayload(startPayloads, 1, REVIEW_TIMEOUT_MS, 'meaning_to_word learn start payload');
    await assertLearnEntry(page, snapshot, meaningToWordPayload, 'meaning_to_word', MEANING_TO_WORD_LABEL);

    await page.goto(`${FRONTEND_URL}/reviews`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await assertHubEntries(page);

    await page.getByTestId('due-review-start-word-to-meaning-link').click();
    await page.waitForLoadState('domcontentloaded');
    const wordToMeaningPayload = await waitForStartPayload(startPayloads, 2, REVIEW_TIMEOUT_MS, 'word_to_meaning learn start payload');
    await assertLearnEntry(page, snapshot, wordToMeaningPayload, 'word_to_meaning', WORD_TO_MEANING_LABEL);

    ensure(
      payloadSignature(meaningToWordPayload) !== payloadSignature(wordToMeaningPayload),
      'Expected the two due-review entries to generate independent exercise payloads'
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
      entries: [
        {
          reviewMode: meaningToWordPayload.reviewMode,
          exerciseCount: meaningToWordPayload.exercises.length
        },
        {
          reviewMode: wordToMeaningPayload.reviewMode,
          exerciseCount: wordToMeaningPayload.exercises.length
        }
      ],
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
