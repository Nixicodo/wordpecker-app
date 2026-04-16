import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Center,
  Flex,
  HStack,
  IconButton,
  Progress,
  Spinner,
  Text,
  VStack,
  useToast
} from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowBackIcon, CloseIcon, WarningIcon } from '@chakra-ui/icons';
import { Exercise, ReviewSubmission, ReviewRating, Word, WordList, WordSourceInfo } from '../types';
import { QuestionAnsweredSupplement, QuestionRenderer } from './QuestionRenderer';
import { QuestionConfidencePanel } from './QuestionConfidencePanel';
import { ReviewRatingPanel } from './ReviewRatingPanel';
import { ReviewTimeline, ReviewTimelineStatus } from './ReviewTimeline';
import { apiService } from '../services/api';
import { validateAnswer } from '../utils/answerValidation';
import { recommendReviewRating } from '../utils/reviewRating';
import { resolveQuestionExposureWords } from '../utils/questionExposure';
import { BufferedBatchQueue } from '../utils/bufferedBatchQueue';

type AuditState = {
  answer: string;
  submitted: boolean;
  status: ReviewTimelineStatus;
  correctness: boolean | null;
  usedHint: boolean;
  responseTimeMs: number;
  review?: ReviewSubmission;
  recommendedRating: ReviewRating;
  selectedRating: ReviewRating;
  recommendationReason: string;
  selfAssessedWordIds: string[];
  settlementKey: string;
  answeredAt: string;
  errorViewed: boolean;
  validationError: string;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'failed';
  syncError: string;
  syncedSignature: string;
};

const createAuditState = (): AuditState => ({
  answer: '',
  submitted: false,
  status: 'idle',
  correctness: null,
  usedHint: false,
  responseTimeMs: 0,
  review: undefined,
  recommendedRating: 'good',
  selectedRating: 'good',
  recommendationReason: '',
  selfAssessedWordIds: [],
  settlementKey: '',
  answeredAt: '',
  errorViewed: false,
  validationError: '',
  syncStatus: 'idle',
  syncError: '',
  syncedSignature: ''
});

const createSettlementKey = () => (
  globalThis.crypto?.randomUUID?.() || `settlement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const buildSettlementPayload = (state: AuditState): ReviewSubmission | null => (
  state.review
    ? {
        ...state.review,
        rating: state.selectedRating,
        selfAssessedWordIds: [...state.selfAssessedWordIds].sort()
      }
    : null
);

const buildSettlementSignature = (state: AuditState) => {
  const payload = buildSettlementPayload(state);
  return payload ? JSON.stringify(payload) : '';
};

const isNoMoreBatchError = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object'
  ) {
    const response = (error as { response?: { status?: unknown; data?: { message?: unknown } } }).response;
    return response?.status === 400 && response.data?.message === 'List has no words';
  }

  return false;
};

const getErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object' &&
    (error as { response?: { data?: { message?: unknown } } }).response?.data &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message === 'string'
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallbackMessage;
  }

  return fallbackMessage;
};

const collectSeenWordIds = (items: Exercise[]) => Array.from(new Set(
  items.flatMap((item) => [
    item.wordId || null,
    ...(item.wordIds || []),
    ...(item.exposedWordIds || [])
  ].filter((wordId): wordId is string => Boolean(wordId)))
));

const buildSourceListIdByWordId = (
  exercise: Exercise,
  wordSources: Record<string, WordSourceInfo>
) => {
  const entries = Array.from(new Set([
    exercise.wordId || null,
    ...(exercise.wordIds || []),
    ...(exercise.exposedWordIds || [])
  ].filter((wordId): wordId is string => Boolean(wordId)))).flatMap((wordId) => {
    const sourceListId = wordSources[wordId]?.sourceListId;
    return sourceListId ? [[wordId, sourceListId] as const] : [];
  });

  return entries.length ? Object.fromEntries(entries) : undefined;
};

export const DisciplinedLearnSession = ({
  list,
  listWords,
  initialExercises,
  initialWordSources
}: {
  list: WordList;
  listWords: Word[];
  initialExercises: Exercise[];
  initialWordSources: Record<string, WordSourceInfo>;
}) => {
  const navigate = useNavigate();
  const toast = useToast();
  const isMountedRef = useRef(true);
  const questionStartedAtRef = useRef(Date.now());
  const auditStatesRef = useRef<AuditState[]>(initialExercises.map(() => createAuditState()));
  const validationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const settlementQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedSettlementIndexesRef = useRef(new Set<number>());
  const syncingSettlementIndexesRef = useRef(new Set<number>());
  const bufferedExercisesRef = useRef<BufferedBatchQueue<Exercise> | null>(null);
  const isAppendingExercisesRef = useRef(false);
  const nextAutoAppendIndexRef = useRef(0);
  const inFlightAutoAppendIndexRef = useRef<number | null>(null);

  const [exercises, setExercises] = useState(initialExercises);
  const [wordSources, setWordSources] = useState(initialWordSources);
  const [auditStates, setAuditStates] = useState<AuditState[]>(() => initialExercises.map(() => createAuditState()));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreExercises, setHasMoreExercises] = useState(true);
  const [autoLoadError, setAutoLoadError] = useState('');

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setAuditStates((previous) => {
      if (previous.length >= exercises.length) {
        return previous;
      }

      return [
        ...previous,
        ...Array.from({ length: exercises.length - previous.length }, () => createAuditState())
      ];
    });
  }, [exercises.length]);

  useEffect(() => {
    auditStatesRef.current = auditStates;
  }, [auditStates]);

  useEffect(() => {
    const currentState = auditStates[currentIndex];
    if (!currentState?.submitted) {
      questionStartedAtRef.current = Date.now();
    }
  }, [auditStates, currentIndex]);

  const syncHasMoreExercises = useCallback(() => {
    const queue = bufferedExercisesRef.current;
    setHasMoreExercises(queue ? queue.hasBufferedBatches() || !queue.isExhausted() : false);
  }, []);

  const fetchMoreExercises = useCallback(async (excludeWordIds: string[]): Promise<Exercise[] | null> => {
    try {
      const response = await apiService.getExercises(list.id, {
        excludeWordIds
      });

      if (response?.wordSources) {
        setWordSources((previous) => ({ ...previous, ...response.wordSources }));
      }

      return response?.exercises ?? null;
    } catch (error) {
      if (isNoMoreBatchError(error)) {
        return null;
      }

      throw error;
    }
  }, [list.id]);

  useEffect(() => {
    const queue = new BufferedBatchQueue<Exercise>({
      fetchBatch: fetchMoreExercises,
      collectIds: collectSeenWordIds,
      bufferSize: 1,
      onStateChange: syncHasMoreExercises
    });

    bufferedExercisesRef.current = queue;
    nextAutoAppendIndexRef.current = 0;
    inFlightAutoAppendIndexRef.current = null;
    isAppendingExercisesRef.current = false;
    queue.ensureBuffered(initialExercises);
    syncHasMoreExercises();

    return () => {
      queue.dispose();
      bufferedExercisesRef.current = null;
    };
  }, [fetchMoreExercises, initialExercises, syncHasMoreExercises]);

  const updateAuditState = useCallback((index: number, updater: (previous: AuditState) => AuditState) => {
    setAuditStates((previous) => previous.map((state, stateIndex) => (
      stateIndex === index ? updater(state) : state
    )));
  }, []);

  const shouldSyncAuditState = useCallback((state: AuditState) => {
    if (!(state.status === 'correct' || state.status === 'incorrect')) {
      return false;
    }

    const signature = buildSettlementSignature(state);
    return Boolean(signature) && signature !== state.syncedSignature;
  }, []);

  const performSettlementSync = useCallback(async (index: number) => {
    const state = auditStatesRef.current[index];
    if (!state || !shouldSyncAuditState(state)) {
      return;
    }

    const payload = buildSettlementPayload(state);
    const signature = buildSettlementSignature(state);
    if (!payload || !signature) {
      return;
    }

    updateAuditState(index, (previous) => ({
      ...previous,
      syncStatus: 'syncing',
      syncError: ''
    }));

    try {
      await apiService.updateLearningLearnedPoints(list.id, [payload]);
      if (!isMountedRef.current) {
        return;
      }

      updateAuditState(index, (previous) => ({
        ...previous,
        syncStatus: buildSettlementSignature(previous) === signature ? 'synced' : 'idle',
        syncError: '',
        syncedSignature: signature
      }));
    } catch (error) {
      console.error('Failed to sync disciplined review settlement:', error);
      if (!isMountedRef.current) {
        return;
      }

      const message = getErrorMessage(error, '后台结算失败，请稍后重试。');
      updateAuditState(index, (previous) => ({
        ...previous,
        syncStatus: buildSettlementSignature(previous) === signature ? 'failed' : 'idle',
        syncError: buildSettlementSignature(previous) === signature ? message : previous.syncError
      }));
    }
  }, [list.id, shouldSyncAuditState, updateAuditState]);

  const requestSettlementSync = useCallback((index: number) => {
    if (queuedSettlementIndexesRef.current.has(index) || syncingSettlementIndexesRef.current.has(index)) {
      return;
    }

    queuedSettlementIndexesRef.current.add(index);
    settlementQueueRef.current = settlementQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        queuedSettlementIndexesRef.current.delete(index);
        syncingSettlementIndexesRef.current.add(index);

        try {
          await performSettlementSync(index);
        } finally {
          syncingSettlementIndexesRef.current.delete(index);
        }
      });
  }, [performSettlementSync]);

  const flushSettlementSyncs = useCallback(async () => {
    auditStatesRef.current.forEach((state, index) => {
      if (shouldSyncAuditState(state)) {
        requestSettlementSync(index);
      }
    });

    await settlementQueueRef.current.catch(() => undefined);

    return auditStatesRef.current.every((state) => !shouldSyncAuditState(state) && state.syncStatus !== 'failed');
  }, [requestSettlementSync, shouldSyncAuditState]);

  const appendBufferedExercises = useCallback(async (
    options?: { focusFirstNewQuestion?: boolean; clearAutoLoadError?: boolean }
  ): Promise<boolean> => {
    const queue = bufferedExercisesRef.current;
    if (!queue || isAppendingExercisesRef.current) {
      return false;
    }

    const focusFirstNewQuestion = options?.focusFirstNewQuestion ?? false;
    const clearAutoLoadError = options?.clearAutoLoadError ?? false;

    if (clearAutoLoadError) {
      setAutoLoadError('');
    }

    try {
      isAppendingExercisesRef.current = true;
      setIsLoadingMore(true);
      const nextExercises = await queue.consumeNext();

      if (!nextExercises?.length) {
        syncHasMoreExercises();
        return false;
      }

      let nextQuestionIndex = -1;
      let updatedExercises: Exercise[] = [];

      setExercises((previous) => {
        nextQuestionIndex = previous.length;
        updatedExercises = [...previous, ...nextExercises];
        return updatedExercises;
      });

      if (nextQuestionIndex >= 0) {
        nextAutoAppendIndexRef.current = nextQuestionIndex;
      }

      queue.ensureBuffered(updatedExercises);
      setAutoLoadError('');

      if (focusFirstNewQuestion && nextQuestionIndex >= 0) {
        setCurrentIndex(nextQuestionIndex);
      }

      return true;
    } catch (error) {
      console.error('Failed to load more disciplined exercises:', error);
      const message = getErrorMessage(error, '后续复习题加载失败，请稍后重试。');
      setAutoLoadError(message);
      toast({
        title: '加载更多复习题失败',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true
      });
      return false;
    } finally {
      isAppendingExercisesRef.current = false;
      setIsLoadingMore(false);
      syncHasMoreExercises();
    }
  }, [syncHasMoreExercises, toast]);

  const markIncorrectQuestionViewed = useCallback((index: number) => {
    updateAuditState(index, (previous) => (
      previous.status === 'incorrect'
        ? { ...previous, errorViewed: true }
        : previous
    ));
  }, [updateAuditState]);

  const goToQuestion = useCallback((index: number) => {
    markIncorrectQuestionViewed(index);
    setCurrentIndex(index);
  }, [markIncorrectQuestionViewed]);

  const findFirstIndex = useCallback((predicate: (state: AuditState) => boolean, startIndex = 0) => {
    for (let index = startIndex; index < auditStates.length; index += 1) {
      if (predicate(auditStates[index])) {
        return index;
      }
    }

    for (let index = 0; index < startIndex; index += 1) {
      if (predicate(auditStates[index])) {
        return index;
      }
    }

    return -1;
  }, [auditStates]);

  const currentState = auditStates[currentIndex] || createAuditState();
  const currentExercise = exercises[currentIndex];

  const timelineItems = useMemo(() => auditStates.map((state) => ({
    status: state.status,
    viewed: state.errorViewed
  })), [auditStates]);

  const submittedCount = auditStates.filter((state) => state.submitted).length;
  const pendingCount = auditStates.filter((state) => state.status === 'pending').length;
  const failedCount = auditStates.filter((state) => state.status === 'failed').length;
  const incorrectCount = auditStates.filter((state) => state.status === 'incorrect').length;
  const resolvedCount = auditStates.filter((state) => state.status === 'correct' || state.status === 'incorrect').length;
  const syncedCount = auditStates.filter((state) => (
    (state.status === 'correct' || state.status === 'incorrect') &&
    !shouldSyncAuditState(state) &&
    state.syncStatus === 'synced'
  )).length;
  const settlementSyncingCount = auditStates.filter((state) => state.syncStatus === 'syncing').length;
  const settlementFailedCount = auditStates.filter((state) => state.syncStatus === 'failed').length;
  const allSubmitted = auditStates.length > 0 && auditStates.every((state) => state.submitted);
  const progress = exercises.length ? (submittedCount / exercises.length) * 100 : 0;

  const resolvedExercise = currentExercise ? {
    ...currentExercise,
    exposedWords: resolveQuestionExposureWords(currentExercise, listWords)
  } : null;

  const runValidation = useCallback(async (
    exerciseIndex: number,
    answer: string,
    usedHint: boolean,
    responseTimeMs: number
  ) => {
    const exercise = exercises[exerciseIndex];
    const submittedState = auditStatesRef.current[exerciseIndex];
    if (!exercise) {
      return;
    }

    try {
      const isValid = await validateAnswer(answer, exercise, list.context, { allowFallback: false });
      const recommendation = recommendReviewRating({
        isCorrect: isValid,
        responseTimeMs,
        usedHint,
        difficulty: exercise.difficulty,
        questionType: exercise.type
      });
      const sourceListIdByWordId = buildSourceListIdByWordId(exercise, wordSources);
      const review = exercise.wordId
        ? {
            wordId: exercise.wordId,
            wordIds: exercise.wordIds,
            sourceListId: wordSources[exercise.wordId]?.sourceListId,
            sourceListIdByWordId,
            correct: isValid,
            rating: recommendation.rating,
            questionType: exercise.type,
            responseTimeMs,
            usedHint,
            settlementKey: submittedState?.settlementKey,
            answeredAt: submittedState?.answeredAt
          } satisfies ReviewSubmission
        : undefined;

      if (!isMountedRef.current) {
        return;
      }

      updateAuditState(exerciseIndex, (previous) => ({
        ...previous,
        status: isValid ? 'correct' : 'incorrect',
        correctness: isValid,
        review,
        recommendedRating: recommendation.rating,
        selectedRating: recommendation.rating,
        recommendationReason: recommendation.reason,
        validationError: '',
        errorViewed: previous.errorViewed,
        syncStatus: 'idle',
        syncError: '',
        syncedSignature: ''
      }));
    } catch (error) {
      console.error('Async validation failed:', error);
      if (!isMountedRef.current) {
        return;
      }

      updateAuditState(exerciseIndex, (previous) => ({
        ...previous,
        status: 'failed',
        correctness: null,
        review: undefined,
        validationError: getErrorMessage(error, 'AI 判题失败，请重试当前题目。'),
        syncStatus: 'idle',
        syncError: '',
        syncedSignature: ''
      }));
    }
  }, [exercises, list.context, updateAuditState, wordSources]);

  const enqueueValidation = useCallback((
    exerciseIndex: number,
    answer: string,
    usedHint: boolean,
    responseTimeMs: number
  ) => {
    validationQueueRef.current = validationQueueRef.current
      .catch(() => undefined)
      .then(() => runValidation(exerciseIndex, answer, usedHint, responseTimeMs));
  }, [runValidation]);

  const handleSubmit = async () => {
    if (!currentExercise || currentState.submitted || !currentState.answer.trim()) {
      return;
    }

    const responseTimeMs = Math.max(0, Date.now() - questionStartedAtRef.current);
    const answer = currentState.answer.trim();
    const usedHint = currentState.usedHint;
    const answeredAt = new Date().toISOString();
    const settlementKey = createSettlementKey();

    updateAuditState(currentIndex, (previous) => ({
      ...previous,
      answer,
      submitted: true,
      status: 'pending',
      responseTimeMs,
      validationError: '',
      settlementKey,
      answeredAt,
      syncStatus: 'idle',
      syncError: '',
      syncedSignature: ''
    }));

    enqueueValidation(currentIndex, answer, usedHint, responseTimeMs);

    const nextUnsubmittedIndex = findFirstIndex((state) => !state.submitted, currentIndex + 1);
    if (nextUnsubmittedIndex >= 0) {
      setCurrentIndex(nextUnsubmittedIndex);
    }
  };

  const retryCurrentQuestion = async () => {
    if (!currentExercise || currentState.status !== 'failed' || !currentState.answer.trim()) {
      return;
    }

    updateAuditState(currentIndex, (previous) => ({
      ...previous,
      status: 'pending',
      validationError: ''
    }));

    enqueueValidation(
      currentIndex,
      currentState.answer.trim(),
      currentState.usedHint,
      currentState.responseTimeMs
    );
  };

  const loadMoreExercises = async () => {
    await appendBufferedExercises({
      focusFirstNewQuestion: true,
      clearAutoLoadError: true
    });
  };

  useEffect(() => {
    if (isLoadingMore || !hasMoreExercises || autoLoadError) {
      return;
    }

    const targetIndex = nextAutoAppendIndexRef.current;
    if (currentIndex !== targetIndex || inFlightAutoAppendIndexRef.current === targetIndex) {
      return;
    }

    inFlightAutoAppendIndexRef.current = targetIndex;
    void appendBufferedExercises()
      .finally(() => {
        if (inFlightAutoAppendIndexRef.current === targetIndex) {
          inFlightAutoAppendIndexRef.current = null;
        }
      });
  }, [appendBufferedExercises, autoLoadError, currentIndex, exercises.length, hasMoreExercises, isLoadingMore]);

  useEffect(() => {
    auditStates.forEach((state, index) => {
      if (state.syncStatus === 'idle' && shouldSyncAuditState(state)) {
        requestSettlementSync(index);
      }
    });
  }, [auditStates, requestSettlementSync, shouldSyncAuditState]);

  const finalizeSession = async () => {
    if (pendingCount > 0 || failedCount > 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const allSettled = await flushSettlementSyncs();
      if (!allSettled) {
        toast({
          title: '后台结算仍有失败项',
          description: '请稍后重试，或先修改对应题目的评级后再触发重结算。',
          status: 'error',
          duration: 4000,
          isClosable: true
        });
        return;
      }

      toast({
        title: '纪律化复习已结算',
        description: `已将 ${resolvedCount} 道题的复习结果持续写回原始词树。`,
        status: 'success',
        duration: 3000,
        isClosable: true
      });
      navigate(`/lists/${list.id}`);
    } catch (error) {
      console.error('Failed to finalize disciplined review:', error);
      toast({
        title: '结算失败',
        description: getErrorMessage(error, '请稍后重试。'),
        status: 'error',
        duration: 4000,
        isClosable: true
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentExercise || !resolvedExercise) {
    return (
      <Center h="calc(100vh - 64px)">
        <Spinner size="xl" color="orange.400" thickness="4px" />
      </Center>
    );
  }

  const gotoNextRelevantQuestion = () => {
    const nextUnsubmittedIndex = findFirstIndex((state) => !state.submitted, currentIndex + 1);
    if (nextUnsubmittedIndex >= 0) {
      setCurrentIndex(nextUnsubmittedIndex);
      return;
    }

    const nextFailedIndex = findFirstIndex((state) => state.status === 'failed', currentIndex + 1);
    if (nextFailedIndex >= 0) {
      setCurrentIndex(nextFailedIndex);
    }
  };

  return (
    <Box p={4}>
      <Flex mb={4} justify="space-between">
        <IconButton
          aria-label="返回上一页"
          icon={<ArrowBackIcon />}
          variant="ghost"
          onClick={() => navigate(-1)}
          size="lg"
        />
        <IconButton
          aria-label="退出复习"
          icon={<CloseIcon />}
          variant="ghost"
          onClick={() => navigate(`/lists/${list.id}`)}
          size="lg"
        />
      </Flex>

      <VStack spacing={5} align="stretch" maxW="980px" mx="auto">
        <Box>
          <Text color="orange.200" fontSize="sm" fontWeight="bold" textTransform="uppercase" letterSpacing="0.14em">
            Disciplined Review
          </Text>
          <Text color="white" fontSize={{ base: '3xl', md: '4xl' }} fontWeight="bold" mt={2}>
            学习中：{list.name}
          </Text>
          <Text mt={2} color="gray.300" lineHeight="1.8">
            这里只保留强证据题型。每次提交后先进入 AI 审核，审核完成后会自动在后台结算复习数据。
          </Text>
          <HStack spacing={3} mt={3} flexWrap="wrap">
            <Badge colorScheme="orange" px={3} py={1} borderRadius="full">
              已提交 {submittedCount}/{exercises.length}
            </Badge>
            <Badge colorScheme="green" px={3} py={1} borderRadius="full">
              已完成审核 {resolvedCount}
            </Badge>
            <Badge colorScheme="blue" px={3} py={1} borderRadius="full">
              审核中 {pendingCount}
            </Badge>
            <Badge colorScheme="teal" px={3} py={1} borderRadius="full">
              已后台结算 {syncedCount}
            </Badge>
            {settlementSyncingCount > 0 && (
              <Badge colorScheme="cyan" px={3} py={1} borderRadius="full">
                后台结算中 {settlementSyncingCount}
              </Badge>
            )}
            {settlementFailedCount > 0 && (
              <Badge colorScheme="red" variant="subtle" px={3} py={1} borderRadius="full">
                后台结算失败 {settlementFailedCount}
              </Badge>
            )}
            <Badge colorScheme={incorrectCount > 0 ? 'red' : 'gray'} px={3} py={1} borderRadius="full">
              错题 {incorrectCount}
            </Badge>
            {isLoadingMore && (
              <Badge colorScheme="purple" px={3} py={1} borderRadius="full">
                正在预加载后续题目
              </Badge>
            )}
            {autoLoadError && (
              <Badge colorScheme="red" variant="subtle" px={3} py={1} borderRadius="full">
                后续题加载失败
              </Badge>
            )}
          </HStack>
        </Box>

        <Progress value={progress} rounded="full" size="sm" colorScheme="orange" />

        <ReviewTimeline items={timelineItems} currentIndex={currentIndex} onSelect={goToQuestion} />

        <Box
          borderRadius="2xl"
          borderWidth="1px"
          borderColor="orange.200"
          bg="rgba(15, 23, 42, 0.92)"
          px={{ base: 4, md: 7 }}
          py={6}
          boxShadow="2xl"
        >
          <Text color="gray.400" fontSize="sm" mb={3}>
            第 {currentIndex + 1} 题 / 共 {exercises.length} 题
          </Text>

          <QuestionRenderer
            question={resolvedExercise}
            selectedAnswer={currentState.answer}
            onAnswerChange={(answer) => updateAuditState(currentIndex, (previous) => ({ ...previous, answer }))}
            isAnswered={currentState.submitted}
            isCorrect={currentState.correctness}
            onHintShown={() => updateAuditState(currentIndex, (previous) => ({ ...previous, usedHint: true }))}
          />

          <HStack spacing={3} mt={8} justify="center" flexWrap="wrap">
            {!currentState.submitted ? (
              <Button
                colorScheme="orange"
                size="lg"
                onClick={handleSubmit}
                isDisabled={!currentState.answer.trim()}
              >
                提交并进入审核
              </Button>
            ) : (
              <>
                {!allSubmitted && (
                  <Button colorScheme="blue" variant="outline" size="lg" onClick={gotoNextRelevantQuestion}>
                    继续下一题
                  </Button>
                )}
                {currentState.status === 'failed' && (
                  <Button colorScheme="orange" size="lg" onClick={retryCurrentQuestion}>
                    重试当前判题
                  </Button>
                )}
                {allSubmitted && pendingCount > 0 && (
                  <Button colorScheme="blue" size="lg" isDisabled leftIcon={<Spinner size="sm" />}>
                    等待剩余审核完成
                  </Button>
                )}
                {allSubmitted && pendingCount === 0 && failedCount === 0 && (
                  <>
                    <Button
                      colorScheme="green"
                      size="lg"
                      onClick={finalizeSession}
                      isLoading={isSaving}
                      loadingText="正在检查后台结算"
                    >
                      完成并返回词树
                    </Button>
                    {hasMoreExercises && (
                      <Button
                        variant="outline"
                        colorScheme={autoLoadError ? 'red' : 'orange'}
                        size="lg"
                        onClick={loadMoreExercises}
                        isLoading={isLoadingMore}
                        loadingText="正在加载"
                      >
                        {autoLoadError ? '重试加载后续复习' : '继续加载下一组复习'}
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </HStack>

          {currentState.status === 'pending' && (
            <Alert status="info" borderRadius="lg" mt={6}>
              <AlertIcon />
              <Text>这题已经提交，AI 正在做语义审核。你可以先切到别的题继续复习。</Text>
            </Alert>
          )}

          {currentState.status === 'failed' && (
            <Alert status="warning" borderRadius="lg" mt={6}>
              <AlertIcon />
              <Text>{currentState.validationError || 'AI 判题失败，请重试。'}</Text>
            </Alert>
          )}

          {(currentState.status === 'correct' || currentState.status === 'incorrect') && (
            <Alert status={currentState.status === 'correct' ? 'success' : 'error'} borderRadius="lg" mt={6}>
              <AlertIcon />
              <Text>
                {currentState.status === 'correct'
                  ? 'AI 判定为正确，系统会自动在后台结算这道题。'
                  : 'AI 判定为错误。你可以先看解析，再决定继续下一题。'}
              </Text>
            </Alert>
          )}

          {(currentState.status === 'correct' || currentState.status === 'incorrect') && currentState.syncStatus === 'syncing' && (
            <Alert status="info" borderRadius="lg" mt={4}>
              <AlertIcon />
              <Text>这道题的复习数据正在后台结算中，你可以继续做别的题。</Text>
            </Alert>
          )}

          {(currentState.status === 'correct' || currentState.status === 'incorrect') && currentState.syncStatus === 'synced' && (
            <Alert status="success" borderRadius="lg" mt={4}>
              <AlertIcon />
              <Text>这道题的复习数据已经后台结算完成。修改评级后会自动重新结算。</Text>
            </Alert>
          )}

          {(currentState.status === 'correct' || currentState.status === 'incorrect') && currentState.syncStatus === 'failed' && (
            <Alert status="warning" borderRadius="lg" mt={4}>
              <AlertIcon />
              <Text>{currentState.syncError || '这道题的后台结算失败了。修改评级后会再次触发重结算。'}</Text>
            </Alert>
          )}

          <QuestionAnsweredSupplement
            question={resolvedExercise}
            isAnswered={currentState.status === 'correct' || currentState.status === 'incorrect'}
            isCorrect={currentState.correctness}
          />

          {currentState.review && (currentState.status === 'correct' || currentState.status === 'incorrect') && (
            <ReviewRatingPanel
              isCorrect={currentState.review.correct}
              selectedRating={currentState.selectedRating}
              recommendedRating={currentState.recommendedRating}
              recommendationReason={currentState.recommendationReason}
              responseTimeMs={currentState.responseTimeMs}
              questionType={currentExercise.type}
              usedHint={currentState.usedHint}
              onRatingChange={(rating) => updateAuditState(currentIndex, (previous) => ({
                ...previous,
                selectedRating: rating,
                syncStatus: 'idle',
                syncError: ''
              }))}
            />
          )}

          {(currentState.status === 'correct' || currentState.status === 'incorrect') && (
            <QuestionConfidencePanel
              words={resolvedExercise.exposedWords || []}
              selectedWordIds={currentState.selfAssessedWordIds}
              onToggleWord={(wordId) => updateAuditState(currentIndex, (previous) => ({
                ...previous,
                selfAssessedWordIds: previous.selfAssessedWordIds.includes(wordId)
                  ? previous.selfAssessedWordIds.filter((currentWordId) => currentWordId !== wordId)
                  : [...previous.selfAssessedWordIds, wordId],
                syncStatus: 'idle',
                syncError: ''
              }))}
            />
          )}
        </Box>

        {autoLoadError && (
          <Alert status="warning" borderRadius="xl">
            <AlertIcon />
            <Text>{autoLoadError}</Text>
          </Alert>
        )}

        {failedCount > 0 && allSubmitted && (
          <Alert status="warning" borderRadius="xl">
            <AlertIcon />
            <Text>
              还有 {failedCount} 题处于“判题失败”状态，必须重试完成后才能结算本轮 due review。
            </Text>
          </Alert>
        )}

        {!hasMoreExercises && allSubmitted && pendingCount === 0 && failedCount === 0 && (
          <HStack color="gray.400" spacing={2} justify="center">
            <WarningIcon />
            <Text>当前待复习队列已经拉取完毕，没有更多题目可继续加载。</Text>
          </HStack>
        )}
      </VStack>
    </Box>
  );
};
