import { chromium } from 'playwright';

const FRONTEND_URL = process.env.SMOKE_FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.SMOKE_BACKEND_URL || 'http://localhost:3000';
const USER_ID = process.env.SMOKE_USER_ID || 'local-ai-test-user';
const REVIEW_TIMEOUT_MS = Number(process.env.SMOKE_REVIEW_TIMEOUT_MS || 20000);
const LEARNING_LABEL_ZH = '\u5b66\u4e60\u4e2d\uff1a';
const SUBMIT_FOR_AUDIT_LABEL = '\u63d0\u4ea4\u5e76\u8fdb\u5165\u5ba1\u6838';
const SUBMITTED_LABEL = '\u5df2\u63d0\u4ea4';
const RESOLVED_LABEL = '\u5df2\u5b8c\u6210\u5ba1\u6838';
const PENDING_LABEL = '\u5ba1\u6838\u4e2d';
const INCORRECT_LABEL = '\u9519\u9898';
const TOTAL_QUESTIONS_LABEL = '\u5171';
const EXIT_REVIEW_LABEL = '\u9000\u51fa\u590d\u4e60';

const ensure = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const looksLikeSpanishQuestion = (value) => /^(Escribe|Qué|Que|Relaciona|Completa|Verdadero|Falso)/i.test(value.trim());

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

const assertNoOverlapBetweenPayloads = (leftPayload, rightPayload, leftLabel, rightLabel) => {
  const leftSignatures = new Set((leftPayload?.exercises ?? []).map(exerciseSignature));
  const duplicatedExercises = (rightPayload?.exercises ?? []).filter((exercise) => (
    leftSignatures.has(exerciseSignature(exercise))
  ));

  ensure(
    duplicatedExercises.length === 0,
    `Expected ${leftLabel} and ${rightLabel} to contain different exercises, but found duplicates: ${duplicatedExercises.map((exercise) => exercise.word || exercise.correctAnswer).join(', ')}`
  );
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
  return waitForBodyText(page, timeoutMs, (bodyText) => (
    bodyText.includes(LEARNING_LABEL_ZH) || bodyText.includes('Learning:')
  ), 'learning screen');
};

const waitForDueReviewSummary = async (page, snapshot, timeoutMs) => {
  return waitForBodyText(page, timeoutMs, (bodyText) => (
    bodyText.includes(String(snapshot.dueCount)) && bodyText.includes(String(snapshot.sourceListCount))
  ), 'due-review summary');
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

const resolveCorrectLabel = (exercise) => {
  if (!exercise.options || !exercise.optionLabels) {
    return exercise.correctAnswer;
  }

  const answerIndex = exercise.options.indexOf(exercise.correctAnswer);
  ensure(answerIndex >= 0, `Could not find correct answer "${exercise.correctAnswer}" in options`);
  return exercise.optionLabels[answerIndex];
};

const answerExercise = async (page, exercise, { answerCorrectly }) => {
  switch (exercise.type) {
    case 'fill_blank':
      await page.locator('input').fill(answerCorrectly ? exercise.correctAnswer : 'definitely_wrong_answer_12345');
      break;
    case 'multiple_choice':
    case 'sentence_completion':
    case 'true_false': {
      const correctLabel = resolveCorrectLabel(exercise);
      const candidateLabels = exercise.optionLabels && exercise.optionLabels.length > 0
        ? exercise.optionLabels
        : ['A', 'B'];
      const selectedLabel = answerCorrectly
        ? correctLabel
        : candidateLabels.find((label) => label !== correctLabel);

      ensure(Boolean(selectedLabel), `Could not determine an answer label for ${exercise.type}`);
      await page.locator(`input[type="radio"][value="${selectedLabel}"]`).check({ force: true });
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
      throw new Error(`Unsupported exercise type: ${exercise.type}`);
  }
};

const waitForAuditCounts = async (page, {
  submitted,
  resolved,
  pending,
  incorrect
}, timeoutMs) => (
  waitForBodyText(page, timeoutMs, (bodyText) => (
    bodyText.includes(`${SUBMITTED_LABEL} ${submitted}`) &&
    bodyText.includes(`${RESOLVED_LABEL} ${resolved}`) &&
    bodyText.includes(`${PENDING_LABEL} ${pending}`) &&
    bodyText.includes(`${INCORRECT_LABEL} ${incorrect}`)
  ), `audit counts submitted=${submitted} resolved=${resolved} pending=${pending} incorrect=${incorrect}`)
);

const waitForTotalQuestionCount = async (page, total, timeoutMs) => (
  waitForBodyText(page, timeoutMs, (bodyText) => (
    bodyText.includes(`${TOTAL_QUESTIONS_LABEL} ${total} \u9898`)
  ), `total question count ${total}`)
);

const main = async () => {
  const snapshot = await fetchDueReviewSnapshot();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  const consoleErrors = [];
  const validationResponses = [];
  const startPayloads = [];
  const distinctMorePayloads = [];
  const seenMorePayloads = new Set();

  collectConsoleErrors(page, consoleErrors);
  page.on('response', async (response) => {
    const url = response.url();

    if (/\/api\/learn\/[^/]+\/start$/.test(url)) {
      startPayloads.push(await response.json());
    }

    if (/\/api\/learn\/[^/]+\/more$/.test(url)) {
      const payload = await response.json();
      const signature = payloadSignature(payload);
      if (!seenMorePayloads.has(signature)) {
        seenMorePayloads.add(signature);
        distinctMorePayloads.push(payload);
      }
    }

    if (url.endsWith('/api/lists/validate-answer')) {
      validationResponses.push({
        status: response.status(),
        body: await response.json()
      });
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

    await waitForBodyText(page, REVIEW_TIMEOUT_MS, () => startPayloads.length > 0, 'learn start payload');

    ensure(
      startPayloads.length === 1,
      `Expected due-review learn start to be requested once, got ${startPayloads.length}`
    );

    const [startPayload] = startPayloads;

    const fillBlankIndex = startPayload.exercises.findIndex((exercise) => exercise.type === 'fill_blank');
    ensure(fillBlankIndex >= 0, 'Due-review session did not contain any fill_blank exercise for AI validation');

    const targetExercise = startPayload.exercises[fillBlankIndex];
    ensure(
      looksLikeSpanishQuestion(targetExercise.question),
      `Expected due-review question text to start with Spanish instructional copy, got: ${targetExercise.question}`
    );

    await waitForTotalQuestionCount(page, 10, REVIEW_TIMEOUT_MS);
    ensure(
      distinctMorePayloads.length >= 1 && (distinctMorePayloads[0].exercises?.length || 0) > 0,
      'Expected the due-review page to auto-load questions 6-10 while question 1 is active'
    );
    assertNoOverlapBetweenPayloads(startPayload, distinctMorePayloads[0], 'questions 1-5', 'questions 6-10');

    const submitButton = page.getByRole('button', { name: SUBMIT_FOR_AUDIT_LABEL });

    for (let exerciseIndex = 0; exerciseIndex < fillBlankIndex; exerciseIndex += 1) {
      const exercise = startPayload.exercises[exerciseIndex];
      await answerExercise(page, exercise, { answerCorrectly: true });
      await submitButton.click();
      await waitForAuditCounts(page, {
        submitted: `${exerciseIndex + 1}/10`,
        resolved: `${exerciseIndex + 1}`,
        pending: '0',
        incorrect: '0'
      }, REVIEW_TIMEOUT_MS);
    }

    await answerExercise(page, targetExercise, { answerCorrectly: false });
    await submitButton.click();

    await waitForAuditCounts(page, {
      submitted: `${fillBlankIndex + 1}/10`,
      resolved: `${fillBlankIndex}`,
      pending: '1',
      incorrect: '0'
    }, REVIEW_TIMEOUT_MS);

    await waitForBodyText(page, REVIEW_TIMEOUT_MS, () => validationResponses.length > 0, 'AI validation response');
    const validationResponse = validationResponses.at(-1);

    ensure(
      validationResponse?.status === 200,
      `Expected validate-answer to return 200, got ${validationResponse?.status ?? 'unknown'}`
    );
    ensure(
      validationResponse?.body?.isValid === false,
      `Expected wrong fill_blank answer to be rejected, got ${JSON.stringify(validationResponse?.body)}`
    );

    await waitForAuditCounts(page, {
      submitted: `${fillBlankIndex + 1}/10`,
      resolved: `${fillBlankIndex + 1}`,
      pending: '0',
      incorrect: '1'
    }, REVIEW_TIMEOUT_MS);

    await page.getByRole('button', { name: '6', exact: true }).click();
    await waitForTotalQuestionCount(page, 15, REVIEW_TIMEOUT_MS);
    ensure(
      distinctMorePayloads.length >= 2 && (distinctMorePayloads[1].exercises?.length || 0) > 0,
      'Expected the due-review page to auto-load questions 11-15 when question 6 becomes active'
    );
    assertNoOverlapBetweenPayloads(startPayload, distinctMorePayloads[1], 'questions 1-5', 'questions 11-15');
    assertNoOverlapBetweenPayloads(distinctMorePayloads[0], distinctMorePayloads[1], 'questions 6-10', 'questions 11-15');

    await page.getByRole('button', { name: EXIT_REVIEW_LABEL }).click();
    await page.waitForURL(new RegExp(`/lists/${snapshot.id}$`), { timeout: REVIEW_TIMEOUT_MS });

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
      targetExercise: {
        index: fillBlankIndex,
        type: targetExercise.type,
        word: targetExercise.word,
        correctAnswer: targetExercise.correctAnswer,
        question: targetExercise.question
      },
      autoLoadedBatches: distinctMorePayloads.map((payload, index) => ({
        batch: index + 1,
        exerciseCount: payload.exercises?.length || 0
      })),
      validationResponse,
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
