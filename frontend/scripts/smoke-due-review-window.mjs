import { chromium } from 'playwright';

const FRONTEND_URL = process.env.SMOKE_FRONTEND_URL || 'http://localhost:4174';
const BACKEND_URL = process.env.SMOKE_BACKEND_URL || 'http://localhost:3000';
const USER_ID = process.env.SMOKE_USER_ID || 'local-ai-test-user';
const REVIEW_TIMEOUT_MS = Number(process.env.SMOKE_REVIEW_TIMEOUT_MS || 30000);
const END_REVIEW_LABEL = '\u7ed3\u675f\u590d\u4e60';
const SUBMIT_FOR_AUDIT_LABEL = '\u63d0\u4ea4\u5e76\u8fdb\u5165\u5ba1\u6838';

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

const fetchWordContext = async (wordId, listId) => {
  const response = await fetch(`${BACKEND_URL}/api/lists/word/${wordId}`, {
    headers: { 'user-id': USER_ID }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch word detail for ${wordId}: ${response.status} ${response.statusText}`);
  }

  const detail = await response.json();
  const context = detail.contexts.find((item) => item.listId === listId);
  ensure(Boolean(context), `Expected word ${wordId} to have context in list ${listId}`);
  return context;
};

const waitForWordReviewIncrement = async (wordId, listId, beforeReviewCount) => (
  waitFor(async () => {
    const context = await fetchWordContext(wordId, listId);
    return context.reviewCount > beforeReviewCount ? context : null;
  }, `word ${wordId} reviewCount increment`)
);

const resolveCorrectLabel = (exercise) => {
  if (!exercise.options || !exercise.optionLabels) {
    return exercise.correctAnswer;
  }

  const answerIndex = exercise.options.indexOf(exercise.correctAnswer);
  ensure(answerIndex >= 0, `Could not find correct answer "${exercise.correctAnswer}" in options`);
  return exercise.optionLabels[answerIndex];
};

const cleanMatchingText = (text) => (
  text
    .replace(/^[A-Za-z]\.\s*/, '')
    .replace(/^[0-9]+\.\s*/, '')
    .replace(/^\([A-Za-z]\)\s*/, '')
    .replace(/^\([0-9]+\)\s*/, '')
    .replace(/^[A-Za-z]\)\s*/, '')
    .replace(/^[0-9]+\)\s*/, '')
    .trim()
);

const answerExercise = async (page, exercise) => {
  switch (exercise.type) {
    case 'fill_blank':
      await page.locator('input').fill(exercise.correctAnswer);
      break;
    case 'multiple_choice':
    case 'sentence_completion':
    case 'true_false': {
      const correctLabel = resolveCorrectLabel(exercise);
      await page.locator(`input[type="radio"][value="${correctLabel}"]`).check({ force: true });
      break;
    }
    case 'matching': {
      ensure(Array.isArray(exercise.pairs) && exercise.pairs.length > 0, 'Matching exercise has no pairs');
      for (const pair of exercise.pairs) {
        const word = cleanMatchingText(pair.word);
        const definition = cleanMatchingText(pair.definition);
        await page.getByRole('button', { name: word, exact: true }).click();
        await page.getByRole('button', { name: definition, exact: true }).click();
      }
      break;
    }
    default:
      throw new Error(`Unsupported exercise type for smoke test: ${exercise.type}`);
  }
};

const clickTimelineQuestion = async (page, questionNumber) => {
  await page.locator('button').filter({ hasText: new RegExp(`^${questionNumber}$`) }).first().click();
};

const main = async () => {
  const snapshot = await fetchDueReviewSnapshot();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  const startPayloads = [];
  const morePayloads = [];
  const consoleErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (/\/api\/learn\/[^/]+\/start$/.test(url)) {
      startPayloads.push(await response.json());
    }
    if (/\/api\/learn\/[^/]+\/more$/.test(url)) {
      morePayloads.push(await response.json());
    }
  });

  try {
    await page.goto(`${FRONTEND_URL}/reviews`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    await page.getByTestId('due-review-start-link').click();
    await page.waitForLoadState('domcontentloaded');

    await waitFor(() => startPayloads.length === 1 ? startPayloads[0] : null, 'learn start payload');
    const [startPayload] = startPayloads;

    await waitFor(async () => {
      const bodyText = await page.locator('body').innerText();
      return bodyText.includes('共 10 题') ? bodyText : null;
    }, 'questions 1-10 visible');

    ensure(
      morePayloads.length === 1 && (morePayloads[0].exercises?.length || 0) > 0,
      `Expected exactly one auto-generated batch while question 1 is active, got ${morePayloads.length}`
    );

    await clickTimelineQuestion(page, 6);
    await waitFor(async () => {
      const bodyText = await page.locator('body').innerText();
      return bodyText.includes('共 15 题') ? bodyText : null;
    }, 'questions 1-15 visible after entering question 6');

    ensure(
      morePayloads.length === 2 && (morePayloads[1].exercises?.length || 0) > 0,
      `Expected exactly two auto-generated batches after entering question 6, got ${morePayloads.length}`
    );

    const targetExercise = startPayload.exercises.find((exercise) => (
      exercise.wordId &&
      startPayload.wordSources?.[exercise.wordId]?.sourceListId &&
      ['fill_blank', 'multiple_choice', 'sentence_completion', 'true_false', 'matching'].includes(exercise.type)
    ));
    ensure(Boolean(targetExercise), 'Could not find a settleable exercise in the first batch');

    const sourceListId = startPayload.wordSources[targetExercise.wordId].sourceListId;
    const beforeContext = await fetchWordContext(targetExercise.wordId, sourceListId);

    await clickTimelineQuestion(page, 1);
    await answerExercise(page, targetExercise);
    await page.getByRole('button', { name: SUBMIT_FOR_AUDIT_LABEL }).click();
    await page.getByRole('button', { name: END_REVIEW_LABEL }).click();

    await page.waitForURL(new RegExp(`/lists/${snapshot.id}$`), { timeout: REVIEW_TIMEOUT_MS });
    const settledContext = await waitForWordReviewIncrement(
      targetExercise.wordId,
      sourceListId,
      beforeContext.reviewCount
    );

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
    }

    console.log(JSON.stringify({
      status: 'ok',
      startExerciseCount: startPayload.exercises.length,
      autoGeneratedBatchCount: morePayloads.length,
      settledWordId: targetExercise.wordId,
      sourceListId,
      reviewCountBefore: beforeContext.reviewCount,
      reviewCountAfter: settledContext.reviewCount,
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
