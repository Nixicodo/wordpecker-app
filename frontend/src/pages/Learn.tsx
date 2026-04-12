import {
  Box,
  Button,
  Text,
  Flex,
  Progress,
  Badge,
  IconButton,
  useToast,
  Spinner,
  Center,
  VStack,
  HStack,
  Divider,
  Card,
  CardHeader,
  CardBody,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  Icon,
  useColorModeValue
} from '@chakra-ui/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Exercise, ReviewSubmission, WordList } from '../types';
import { ArrowBackIcon, CloseIcon, CheckCircleIcon, InfoIcon, StarIcon } from '@chakra-ui/icons';
import { apiService } from '../services/api';
import { QuestionAnsweredSupplement, QuestionRenderer } from '../components/QuestionRenderer';
import { QuestionConfidencePanel } from '../components/QuestionConfidencePanel';
import { ReviewRatingPanel } from '../components/ReviewRatingPanel';
import { SessionService } from '../services/sessionService';
import { validateAnswer } from '../utils/answerValidation';
import { usePrefetchedBatch } from '../hooks/usePrefetchedBatch';
import { recommendReviewRating } from '../utils/reviewRating';

const UI = {
  startErrorTitle: '\u542f\u52a8\u5b66\u4e60\u5931\u8d25',
  startErrorDescription: '\u65e0\u6cd5\u5f00\u59cb\u5b66\u4e60\u6d41\u7a0b',
  progressSaved: '\u7ecf\u9a8c\u5df2\u7ed3\u7b97',
  progressSavedDescription: '\u5df2\u66f4\u65b0',
  wordUnit: '\u4e2a\u5355\u8bcd\u7684\u5b66\u4e60\u8fdb\u5ea6',
  progressSaveFailed: '\u7ed3\u7b97\u5931\u8d25',
  progressSaveFailedDescription: '\u5b66\u4e60\u7ed3\u679c\u5df2\u8bb0\u5f55\uff0c\u4f46\u7ecf\u9a8c\u66f4\u65b0\u5931\u8d25',
  loadMoreErrorTitle: '\u52a0\u8f7d\u66f4\u591a\u7ec3\u4e60\u5931\u8d25',
  loadMoreErrorDescription: '\u65e0\u6cd5\u52a0\u8f7d\u66f4\u591a\u7ec3\u4e60',
  noExercises: '\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u7ec3\u4e60',
  backToLists: '\u8fd4\u56de\u8bcd\u8868\u5217\u8868',
  back: '\u8fd4\u56de',
  exit: '\u9000\u51fa',
  learningPrefix: '\u5b66\u4e60\u4e2d\uff1a',
  streakPrefix: '\u8fde\u5bf9\uff1a',
  progressPrefix: '\u8fdb\u5ea6\uff1a',
  scorePrefix: '\u5f97\u5206\uff1a',
  correct: '\u56de\u7b54\u6b63\u786e',
  incorrect: '\u7ee7\u7eed\u52a0\u6cb9',
  streakMessage: '\u4f60\u5df2\u7ecf\u8fde\u7eed\u7b54\u5bf9',
  streakSuffix: '\u9898\u4e86\u3002',
  goodJob: '\u7b54\u5f97\u4e0d\u9519\u3002',
  checkAbove: '\u8bf7\u67e5\u770b\u4e0a\u65b9\u7ed9\u51fa\u7684\u6b63\u786e\u7b54\u6848\u3002',
  correctAnswerPrefix: '\u6b63\u786e\u7b54\u6848\uff1a',
  sessionComplete: '\u672c\u8f6e\u5b66\u4e60\u5b8c\u6210',
  statCorrect: '\u7b54\u5bf9',
  statIncorrect: '\u7b54\u9519',
  statBestStreak: '\u6700\u4f73\u8fde\u5bf9',
  wellDone: '\u8868\u73b0\u4e0d\u9519',
  keepPracticing: '\u7ee7\u7eed\u5de9\u56fa',
  feelingGood: '\u72b6\u6001\u5f88\u597d',
  summary: '\u5b66\u4e60\u603b\u7ed3',
  finalScore: '\u6700\u7ec8\u5f97\u5206\uff1a',
  points: '\u5206',
  validating: '\u6b63\u5728\u6821\u9a8c\u2026\u2026',
  saving: '\u6b63\u5728\u7ed3\u7b97\u2026\u2026',
  submitAnswer: '\u63d0\u4ea4\u7b54\u6848',
  saveAndComplete: '\u7ed3\u7b97\u5e76\u5b8c\u6210',
  continueLearning: '\u7ee7\u7eed\u5b66\u4e60',
  finishSession: '\u5b8c\u6210\u672c\u8f6e\u5b66\u4e60',
  nextExercise: '\u4e0b\u4e00\u9898',
};

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const MotionBox = motion(Box);

const collectSeenWordIds = (items: Exercise[]) => Array.from(new Set(
  items.flatMap((item) => [
    item.wordId || null,
    ...(item.wordIds || []),
    ...(item.exposedWordIds || [])
  ].filter((wordId): wordId is string => Boolean(wordId)))
));

const getConfidencePanelWords = (exercise: Exercise) => {
  if (exercise.exposedWords && exercise.exposedWords.length > 0) {
    return exercise.exposedWords;
  }

  if (!exercise.wordId) {
    return [];
  }

  return [{
    id: exercise.wordId,
    value: exercise.word,
    meaning: ''
  }];
};

type SessionProgressState = ReturnType<SessionService['getCurrentProgress']>;

const getErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object' &&
    (error as { response?: { data?: unknown } }).response?.data &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message === 'string'
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallbackMessage;
  }

  return fallbackMessage;
};

export const Learn = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation();
  const toast = useToast();
  const hasInitializedRef = useRef(false);

  const [list, setList] = useState<WordList | null>(state?.list || null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentExercise, setCurrentExercise] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [sessionService, setSessionService] = useState<SessionService | null>(null);
  const [sessionProgress, setSessionProgress] = useState<SessionProgressState | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [actualCorrectness, setActualCorrectness] = useState<boolean | null>(null);
  const [learningResults, setLearningResults] = useState<ReviewSubmission[]>([]);
  const [isUpdatingPoints, setIsUpdatingPoints] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [selectedRating, setSelectedRating] = useState<'again' | 'hard' | 'good' | 'easy'>('good');
  const [recommendedRating, setRecommendedRating] = useState<'again' | 'hard' | 'good' | 'easy'>('good');
  const [recommendationReason, setRecommendationReason] = useState('');
  const [currentReview, setCurrentReview] = useState<ReviewSubmission | null>(null);
  const [responseTimeMs, setResponseTimeMs] = useState(0);
  const [selfAssessedWordIds, setSelfAssessedWordIds] = useState<string[]>([]);
  const questionStartedAtRef = useRef(Date.now());
  const summaryCardBg = useColorModeValue('white', 'gray.800');
  const summaryCardBorder = useColorModeValue('green.200', 'green.600');
  const summaryTitleColor = useColorModeValue('gray.800', 'white');
  const summaryLabelColor = useColorModeValue('gray.600', 'gray.400');
  const summaryHelpColor = useColorModeValue('gray.500', 'gray.400');
  const summaryBodyColor = useColorModeValue('gray.700', 'gray.200');

  const fetchMoreExercises = useCallback(async (): Promise<Exercise[] | null> => {
    if (!id) return null;

    const response = await apiService.getExercises(id, {
      excludeWordIds: collectSeenWordIds(exercises)
    });
    return response?.exercises ?? null;
  }, [exercises, id]);

  const { prefetchNext, consumePrefetched } = usePrefetchedBatch(fetchMoreExercises);

  const resetQuestionState = useCallback(() => {
    setSelectedAnswer('');
    setIsAnswered(false);
    setActualCorrectness(null);
    setUsedHint(false);
    setCurrentReview(null);
    setSelectedRating('good');
    setRecommendedRating('good');
    setRecommendationReason('');
    setResponseTimeMs(0);
    setSelfAssessedWordIds([]);
    questionStartedAtRef.current = Date.now();
  }, []);

  const commitCurrentReview = useCallback(() => {
    if (!currentReview) {
      return;
    }

    setLearningResults((prev) => [
      ...prev,
      {
        ...currentReview,
        rating: selectedRating,
        selfAssessedWordIds
      }
    ]);
    setCurrentReview(null);
  }, [currentReview, selectedRating, selfAssessedWordIds]);

  const toggleSelfAssessedWord = useCallback((wordId: string) => {
    setSelfAssessedWordIds((previousWordIds) => (
      previousWordIds.includes(wordId)
        ? previousWordIds.filter((currentWordId) => currentWordId !== wordId)
        : [...previousWordIds, wordId]
    ));
  }, []);

  useEffect(() => {
    const initLearn = async () => {
      if (!id || hasInitializedRef.current) return;

      try {
        setIsLoading(true);
        const resolvedList = list ?? await apiService.getList(id);
        setList(resolvedList);

        const response = await apiService.startLearning(id);
        if (response && response.exercises) {
          setExercises(response.exercises);
          const service = new SessionService(response.exercises);
          setSessionService(service);
          setSessionProgress(service.getCurrentProgress());
          questionStartedAtRef.current = Date.now();
          hasInitializedRef.current = true;
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (error: unknown) {
        console.error('Error initializing learning session:', error);
        toast({
          title: UI.startErrorTitle,
          description: getErrorMessage(error, UI.startErrorDescription),
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        navigate(id ? `/lists/${id}` : '/lists');
      } finally {
        setIsLoading(false);
      }
    };

    initLearn();
  }, [id, list, navigate, toast]);

  useEffect(() => {
    if (!id || !exercises.length || isCompleted) return;

    void prefetchNext();
  }, [id, exercises.length, isCompleted, prefetchNext]);

  const loadMoreExercises = async () => {
    if (!id || !exercises.length) return false;

    try {
      setIsLoading(true);
      const prefetchedExercises = await consumePrefetched();
      const nextExercises = prefetchedExercises ?? await fetchMoreExercises();

      if (nextExercises && nextExercises.length > 0) {
        const newExercises = [...exercises, ...nextExercises];
        setExercises(newExercises);
        const service = new SessionService(newExercises);
        setSessionService(service);
        setCurrentExercise(exercises.length);
        setIsCompleted(false);
        resetQuestionState();
        void prefetchNext();
        return true;
      }
      return false;
    } catch (error: unknown) {
      console.error('Error loading more exercises:', error);
      toast({
        title: UI.loadMoreErrorTitle,
        description: getErrorMessage(error, UI.loadMoreErrorDescription),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = async () => {
    if (isValidating) return;

    setIsValidating(true);
    const exercise = exercises[currentExercise];
    const elapsedMs = Math.max(0, Date.now() - questionStartedAtRef.current);

    try {
      const isValid = await validateAnswer(selectedAnswer, exercise, list?.context);
      const recommendation = recommendReviewRating({
        isCorrect: isValid,
        responseTimeMs: elapsedMs,
        usedHint,
        difficulty: exercise.difficulty,
        questionType: exercise.type
      });

      setActualCorrectness(isValid);
      setIsAnswered(true);
      setResponseTimeMs(elapsedMs);
      setRecommendedRating(recommendation.rating);
      setSelectedRating(recommendation.rating);
      setRecommendationReason(recommendation.reason);

      if (sessionService) {
        sessionService.answerQuestion(selectedAnswer, exercise, isValid);
        setSessionProgress(sessionService.getCurrentProgress());
      }
      if (exercise.wordId) {
        setCurrentReview({
          wordId: exercise.wordId as string,
          wordIds: exercise.wordIds,
          correct: isValid,
          rating: recommendation.rating,
          questionType: exercise.type,
          responseTimeMs: elapsedMs,
          usedHint
        });
      }
    } catch (error) {
      console.error('Error validating answer:', error);
      const fallbackCorrect = selectedAnswer === exercise.correctAnswer;
      const recommendation = recommendReviewRating({
        isCorrect: fallbackCorrect,
        responseTimeMs: elapsedMs,
        usedHint,
        difficulty: exercise.difficulty,
        questionType: exercise.type
      });
      setActualCorrectness(fallbackCorrect);
      setIsAnswered(true);
      setResponseTimeMs(elapsedMs);
      setRecommendedRating(recommendation.rating);
      setSelectedRating(recommendation.rating);
      setRecommendationReason(recommendation.reason);

      if (sessionService) {
        sessionService.answerQuestion(selectedAnswer, exercise, fallbackCorrect);
        setSessionProgress(sessionService.getCurrentProgress());
      }
      if (exercise.wordId) {
        setCurrentReview({
          wordId: exercise.wordId as string,
          wordIds: exercise.wordIds,
          correct: fallbackCorrect,
          rating: recommendation.rating,
          questionType: exercise.type,
          responseTimeMs: elapsedMs,
          usedHint
        });
      }
    } finally {
      setIsValidating(false);
    }
  };

  const updateLearnedPoints = async () => {
    if (!id || learningResults.length === 0) {
      navigate(`/lists/${id}`);
      return;
    }

    setIsUpdatingPoints(true);
    try {
      await apiService.updateLearningLearnedPoints(id, learningResults);
      toast({
        title: UI.progressSaved,
        description: `${UI.progressSavedDescription} ${learningResults.length} ${UI.wordUnit}`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error: unknown) {
      console.error('Error updating learned points after learning session:', error);
      toast({
        title: UI.progressSaveFailed,
        description: UI.progressSaveFailedDescription,
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsUpdatingPoints(false);
      navigate(`/lists/${id}`);
    }
  };

  const handleNext = async () => {
    commitCurrentReview();
    const isLastExercise = currentExercise === exercises.length - 1;

    if (isLastExercise) {
      setIsCompleted(true);
      if (sessionService) {
        sessionService.completeSession();
      }
      return;
    }

    if (sessionService) {
      sessionService.nextQuestion();
      setSessionProgress(sessionService.getCurrentProgress());
    }

    setCurrentExercise(prev => prev + 1);
    resetQuestionState();
  };

  if (isLoading) {
    return (
      <Center h="calc(100vh - 64px)">
        <Spinner size="xl" color="green.500" thickness="4px" />
      </Center>
    );
  }

  if (!list || !exercises.length) {
    return (
      <Box textAlign="center" py={10}>
        <Text mb={4}>{UI.noExercises}</Text>
        <Link to="/lists">
          <Button variant="solid">{UI.backToLists}</Button>
        </Link>
      </Box>
    );
  }

  const exercise = exercises[currentExercise];
  const progress = ((currentExercise + 1) / exercises.length) * 100;
  const streak = sessionProgress?.stats.streak || 0;
  const score = sessionProgress?.stats.score || 0;

  return (
    <MotionBox
      initial="hidden"
      animate="visible"
      variants={fadeIn}
      transition={{ duration: 0.5 }}
      p={4}
    >
      <Flex mb={4}>
        <IconButton
          aria-label={UI.back}
          icon={<ArrowBackIcon />}
          variant="ghost"
          onClick={() => navigate(-1)}
          size="lg"
        />
      </Flex>

      <Flex
        justify="space-between"
        align="center"
        mb={6}
        direction={{ base: 'column', md: 'row' }}
        gap={4}
      >
        <Box>
          <Text
            textStyle="h1"
            color="white"
            fontSize={{ base: '3xl', md: '4xl' }}
          >
            {`${UI.learningPrefix}${list.name}`}
          </Text>
          <Flex
            gap={4}
            mt={2}
            flexWrap="wrap"
            justify={{ base: 'center', md: 'flex-start' }}
          >
            <Badge
              colorScheme="green"
              p={2}
              borderRadius="full"
              style={streak > 0 ? { animation: 'pulse 1s ease infinite' } : undefined}
            >
              {`${UI.streakPrefix}${streak}`}
            </Badge>
            <Badge colorScheme="blue" p={2} borderRadius="full">
              {`${UI.progressPrefix}${Math.round(progress)}%`}
            </Badge>
            <Badge colorScheme="purple" p={2} borderRadius="full">
              {`${UI.scorePrefix}${score}`}
            </Badge>
          </Flex>
        </Box>
        <Link to={`/lists/${id}`}>
          <IconButton
            aria-label={UI.exit}
            icon={<CloseIcon />}
            variant="ghost"
            size="lg"
          />
        </Link>
      </Flex>

      <Progress
        value={progress}
        mb={8}
        rounded="full"
        size="sm"
        colorScheme="green"
        hasStripe
        isAnimated
      />

      <MotionBox
        layerStyle="card"
        maxW="800px"
        mx="auto"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        boxShadow="2xl"
        borderWidth="1px"
        borderColor="green.500"
        px={{ base: 4, md: 8 }}
        py={6}
      >
        <QuestionRenderer
          question={exercise}
          selectedAnswer={selectedAnswer}
          onAnswerChange={setSelectedAnswer}
          isAnswered={isAnswered}
          isCorrect={actualCorrectness}
          onHintShown={() => setUsedHint(true)}
        />

        <Flex justify="center" mt={8} gap={4}>
          {!isAnswered ? (
            <Button
              variant="solid"
              colorScheme="blue"
              size="lg"
              onClick={handleAnswer}
              isDisabled={!selectedAnswer || isValidating}
              isLoading={isValidating}
              loadingText={UI.validating}
              _hover={{
                transform: 'translateY(-2px)',
                shadow: 'lg'
              }}
              transition="all 0.2s"
            >
              {UI.submitAnswer}
            </Button>
          ) : isCompleted ? (
            <>
              <Button
                variant="outline"
                colorScheme="green"
                size="lg"
                onClick={updateLearnedPoints}
                isLoading={isUpdatingPoints}
                loadingText={UI.saving}
                _hover={{
                  transform: 'translateY(-2px)',
                  shadow: 'lg'
                }}
                transition="all 0.2s"
              >
                {UI.saveAndComplete}
              </Button>
              <Button
                variant="solid"
                colorScheme="blue"
                size="lg"
                onClick={loadMoreExercises}
                isLoading={isLoading}
                _hover={{
                  transform: 'translateY(-2px)',
                  shadow: 'lg'
                }}
                transition="all 0.2s"
              >
                {UI.continueLearning}
              </Button>
            </>
          ) : (
            <Button
              variant="solid"
              colorScheme="green"
              size="lg"
              onClick={handleNext}
              _hover={{
                transform: 'translateY(-2px)',
                shadow: 'lg'
              }}
              transition="all 0.2s"
            >
              {currentExercise === exercises.length - 1 ? UI.finishSession : UI.nextExercise}
            </Button>
          )}
        </Flex>

        {isAnswered && (
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            mt={6}
            p={4}
            bg={actualCorrectness ? 'green.500' : '#FF4D4F'}
            borderRadius="lg"
            textAlign="center"
          >
            <Text color="white" fontSize={{ base: 'lg', md: 'xl' }} fontWeight="bold">
              {actualCorrectness ? UI.correct : UI.incorrect}
            </Text>
            <Text color="white" mt={2} fontSize={{ base: 'sm', md: 'md' }}>
              {actualCorrectness
                ? streak > 1
                  ? `${UI.streakMessage} ${streak} ${UI.streakSuffix}`
                  : UI.goodJob
                : exercise.type === 'fill_blank' || exercise.type === 'matching'
                  ? UI.checkAbove
                  : `${UI.correctAnswerPrefix}${exercise.correctAnswer}`}
            </Text>
          </MotionBox>
        )}

        <QuestionAnsweredSupplement
          question={exercise}
          isAnswered={isAnswered}
          isCorrect={actualCorrectness}
        />

        {isAnswered && currentReview && (
          <ReviewRatingPanel
            isCorrect={currentReview.correct}
            selectedRating={selectedRating}
            recommendedRating={recommendedRating}
            recommendationReason={recommendationReason}
            responseTimeMs={responseTimeMs}
            questionType={exercise.type}
            usedHint={usedHint}
            onRatingChange={setSelectedRating}
          />
        )}

        {isAnswered && (
          <QuestionConfidencePanel
            words={getConfidencePanelWords(exercise)}
            selectedWordIds={selfAssessedWordIds}
            onToggleWord={toggleSelfAssessedWord}
          />
        )}

        {isCompleted && sessionService && (
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            mt={6}
          >
            <Card
              bg={summaryCardBg}
              borderColor={summaryCardBorder}
              borderWidth="2px"
              shadow="xl"
            >
              <CardHeader pb={2}>
                <HStack spacing={3} justify="center">
                  <Icon as={CheckCircleIcon} color="green.500" boxSize={8} />
                  <Text fontSize="2xl" fontWeight="bold" color={summaryTitleColor}>
                    {UI.sessionComplete}
                  </Text>
                </HStack>
              </CardHeader>
              <CardBody pt={2}>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mb={4}>
                  <Stat textAlign="center">
                    <StatLabel color={summaryLabelColor}>
                      <HStack justify="center" spacing={1}>
                        <CheckCircleIcon color="green.500" />
                        <Text>{UI.statCorrect}</Text>
                      </HStack>
                    </StatLabel>
                    <StatNumber color="green.500" fontSize="3xl">
                      {sessionProgress?.stats.correct}
                    </StatNumber>
                    <StatHelpText color={summaryHelpColor}>
                      {UI.wellDone}
                    </StatHelpText>
                  </Stat>

                  <Stat textAlign="center">
                    <StatLabel color={summaryLabelColor}>
                      <HStack justify="center" spacing={1}>
                        <InfoIcon color="orange.500" />
                        <Text>{UI.statIncorrect}</Text>
                      </HStack>
                    </StatLabel>
                    <StatNumber color="orange.500" fontSize="3xl">
                      {sessionProgress?.stats.incorrect}
                    </StatNumber>
                    <StatHelpText color={summaryHelpColor}>
                      {UI.keepPracticing}
                    </StatHelpText>
                  </Stat>

                  <Stat textAlign="center">
                    <StatLabel color={summaryLabelColor}>
                      <HStack justify="center" spacing={1}>
                        <StarIcon color="purple.500" />
                        <Text>{UI.statBestStreak}</Text>
                      </HStack>
                    </StatLabel>
                    <StatNumber color="purple.500" fontSize="3xl">
                      {sessionProgress?.stats.maxStreak}
                    </StatNumber>
                    <StatHelpText color={summaryHelpColor}>
                      {UI.feelingGood}
                    </StatHelpText>
                  </Stat>
                </SimpleGrid>

                <Divider mb={4} />

                <VStack spacing={2}>
                  <Text fontSize="lg" fontWeight="semibold" color={summaryBodyColor}>
                    {UI.summary}
                  </Text>
                  <HStack spacing={2} wrap="wrap" justify="center">
                    {sessionService.getInsights().map((insight, index) => (
                      <Badge key={index} colorScheme="blue" fontSize="sm" p={2} borderRadius="full">
                        {insight}
                      </Badge>
                    ))}
                  </HStack>

                  <Text fontSize="sm" color={summaryHelpColor} textAlign="center" mt={2}>
                    {UI.finalScore}
                    <Text as="span" fontWeight="bold" color="blue.500">
                      {`${sessionProgress?.stats.score} ${UI.points}`}
                    </Text>
                  </Text>
                  {learningResults.length > 0 && (
                    <HStack spacing={2} wrap="wrap" justify="center" pt={2}>
                      <Badge colorScheme="red" variant="subtle">
                        Again {learningResults.filter((result) => result.rating === 'again').length}
                      </Badge>
                      <Badge colorScheme="orange" variant="subtle">
                        Hard {learningResults.filter((result) => result.rating === 'hard').length}
                      </Badge>
                      <Badge colorScheme="blue" variant="subtle">
                        Good {learningResults.filter((result) => result.rating === 'good').length}
                      </Badge>
                      <Badge colorScheme="green" variant="subtle">
                        Easy {learningResults.filter((result) => result.rating === 'easy').length}
                      </Badge>
                    </HStack>
                  )}
                </VStack>
              </CardBody>
            </Card>
          </MotionBox>
        )}

      </MotionBox>
    </MotionBox>
  );
};
