import {
  Box,
  Button,
  Text,
  Flex,
  Progress,
  HStack,
  Badge,
  IconButton,
  useToast,
  Spinner,
  Center,
  VStack,
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
import { Question, ReviewSubmission, WordList } from '../types';
import { ArrowBackIcon, CloseIcon, CheckCircleIcon, InfoIcon, StarIcon } from '@chakra-ui/icons';
import { apiService } from '../services/api';
import { QuestionRenderer } from '../components/QuestionRenderer';
import { ReviewRatingPanel } from '../components/ReviewRatingPanel';
import { SessionService } from '../services/sessionService';
import { validateAnswer } from '../utils/answerValidation';
import { usePrefetchedBatch } from '../hooks/usePrefetchedBatch';
import { recommendReviewRating } from '../utils/reviewRating';

const UI = {
  startErrorTitle: '\u542f\u52a8\u6d4b\u9a8c\u5931\u8d25',
  startErrorDescription: '\u65e0\u6cd5\u5f00\u59cb\u6d4b\u9a8c',
  progressSaved: '\u8fdb\u5ea6\u5df2\u4fdd\u5b58',
  progressSavedDescription: '\u5df2\u66f4\u65b0',
  wordUnit: '\u4e2a\u5355\u8bcd\u7684\u5b66\u4e60\u8fdb\u5ea6',
  progressSaveFailed: '\u4fdd\u5b58\u8fdb\u5ea6\u5931\u8d25',
  progressSaveFailedDescription: '\u6d4b\u9a8c\u7ed3\u679c\u5df2\u8bb0\u5f55\uff0c\u4f46\u5b66\u4e60\u8fdb\u5ea6\u66f4\u65b0\u5931\u8d25',
  loadMoreErrorTitle: '\u52a0\u8f7d\u66f4\u591a\u9898\u76ee\u5931\u8d25',
  loadMoreErrorDescription: '\u65e0\u6cd5\u52a0\u8f7d\u66f4\u591a\u9898\u76ee',
  noQuestions: '\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u9898\u76ee',
  backToLists: '\u8fd4\u56de\u8bcd\u8868\u5217\u8868',
  back: '\u8fd4\u56de',
  exit: '\u9000\u51fa',
  quizPrefix: '\u6d4b\u9a8c\uff1a',
  comboPrefix: '\u8fde\u51fb x',
  scorePrefix: '\u5f97\u5206\uff1a',
  correctMessage: '\u56de\u7b54\u6b63\u786e',
  comboExcellent: '\uff0c\u8fde\u51fb\u8868\u73b0\u5f88\u68d2',
  comboNice: '\uff0c\u7ee7\u7eed\u4fdd\u6301\u8fde\u51fb',
  wrongMessage: '\u56de\u7b54\u9519\u8bef\uff0c\u7ee7\u7eed\u5c1d\u8bd5',
  gameOver: '\u672c\u8f6e\u6d4b\u9a8c\u7ed3\u675f',
  quizComplete: '\u6d4b\u9a8c\u5b8c\u6210',
  statCorrect: '\u7b54\u5bf9',
  statIncorrect: '\u7b54\u9519',
  statBestStreak: '\u6700\u4f73\u8fde\u51fb',
  wellDone: '\u8868\u73b0\u4e0d\u9519',
  keepPracticing: '\u7ee7\u7eed\u5de9\u56fa',
  feelingGood: '\u72b6\u6001\u5f88\u597d',
  summary: '\u6d4b\u9a8c\u603b\u7ed3',
  finalScore: '\u6700\u7ec8\u5f97\u5206\uff1a',
  points: '\u5206',
  validating: '\u6b63\u5728\u6821\u9a8c\u2026\u2026',
  submitAnswer: '\u63d0\u4ea4\u7b54\u6848',
  saving: '\u6b63\u5728\u4fdd\u5b58\u2026\u2026',
  saveAndFinish: '\u4fdd\u5b58\u5e76\u5b8c\u6210',
  loading: '\u6b63\u5728\u52a0\u8f7d\u2026\u2026',
  continueQuiz: '\u7ee7\u7eed\u6d4b\u9a8c',
  finishQuiz: '\u5b8c\u6210\u6d4b\u9a8c',
  nextQuestion: '\u4e0b\u4e00\u9898',
};

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const MotionBox = motion(Box);

export const Quiz = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation();
  const toast = useToast();
  const hasInitializedRef = useRef(false);

  const [list, setList] = useState<WordList | null>(state?.list || null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [lives, setLives] = useState(3);
  const [isLoading, setIsLoading] = useState(true);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [sessionService, setSessionService] = useState<SessionService | null>(null);
  const [sessionProgress, setSessionProgress] = useState<any>(null);
  const [gameOver, setGameOver] = useState(false);
  const [quizResults, setQuizResults] = useState<ReviewSubmission[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [actualCorrectness, setActualCorrectness] = useState<boolean | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isUpdatingPoints, setIsUpdatingPoints] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [selectedRating, setSelectedRating] = useState<'again' | 'hard' | 'good' | 'easy'>('good');
  const [recommendedRating, setRecommendedRating] = useState<'again' | 'hard' | 'good' | 'easy'>('good');
  const [recommendationReason, setRecommendationReason] = useState('');
  const [currentReview, setCurrentReview] = useState<ReviewSubmission | null>(null);
  const [responseTimeMs, setResponseTimeMs] = useState(0);
  const questionStartedAtRef = useRef(Date.now());

  const fetchMoreQuestions = useCallback(async (): Promise<Question[] | null> => {
    if (!id) return null;

    const response = await apiService.getQuestions(id);
    return response?.questions ?? null;
  }, [id]);

  const { prefetchNext, consumePrefetched } = usePrefetchedBatch(fetchMoreQuestions);

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
    questionStartedAtRef.current = Date.now();
  }, []);

  const commitCurrentReview = useCallback(() => {
    if (!currentReview) {
      return;
    }

    setQuizResults((prev) => [
      ...prev,
      {
        ...currentReview,
        rating: selectedRating
      }
    ]);
    setCurrentReview(null);
  }, [currentReview, selectedRating]);

  useEffect(() => {
    const initQuiz = async () => {
      if (!id || hasInitializedRef.current) return;

      try {
        setIsLoading(true);
        const resolvedList = list ?? await apiService.getList(id);
        setList(resolvedList);

        const response = await apiService.startQuiz(id);
        if (response && response.questions && response.total_questions) {
          setQuestions(response.questions);
          setTotalQuestions(response.total_questions);
          const service = new SessionService(response.questions);
          setSessionService(service);
          setSessionProgress(service.getCurrentProgress());
          questionStartedAtRef.current = Date.now();
          hasInitializedRef.current = true;
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (error: any) {
        console.error('Error initializing quiz:', error);
        toast({
          title: UI.startErrorTitle,
          description: error.response?.data?.message || UI.startErrorDescription,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        navigate(id ? `/lists/${id}` : '/lists');
      } finally {
        setIsLoading(false);
      }
    };

    initQuiz();
  }, [id, list, navigate, toast]);

  useEffect(() => {
    if (!id || !questions.length || isCompleted || gameOver || currentQuestion + 1 >= totalQuestions) return;

    void prefetchNext();
  }, [id, questions.length, currentQuestion, totalQuestions, isCompleted, gameOver, prefetchNext]);

  const updateLearnedPoints = async () => {
    if (!id || quizResults.length === 0) {
      navigate(`/lists/${id}`);
      return;
    }

    setIsUpdatingPoints(true);
    try {
      await apiService.updateLearnedPoints(id, quizResults);
      toast({
        title: UI.progressSaved,
        description: `${UI.progressSavedDescription} ${quizResults.length} ${UI.wordUnit}`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error: any) {
      console.error('Error updating learned points:', error);
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

  const loadMoreQuestions = async (startFromNewBatch = false) => {
    if (!id || !questions.length) return false;

    setIsLoading(true);
    try {
      const prefetchedQuestions = await consumePrefetched();
      const nextQuestions = prefetchedQuestions ?? await fetchMoreQuestions();

      if (nextQuestions && nextQuestions.length > 0) {
        const firstNewQuestionIndex = questions.length;
        setQuestions(prev => [...prev, ...nextQuestions]);
        setIsCompleted(false);
        if (startFromNewBatch) {
          setCurrentQuestion(firstNewQuestionIndex);
        }
        resetQuestionState();
        void prefetchNext();
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Error loading more questions:', error);
      toast({
        title: UI.loadMoreErrorTitle,
        description: error.response?.data?.message || UI.loadMoreErrorDescription,
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
    const question = questions[currentQuestion];
    const elapsedMs = Math.max(0, Date.now() - questionStartedAtRef.current);

    try {
      const isValid = await validateAnswer(selectedAnswer, question, list?.context);
      const recommendation = recommendReviewRating({
        isCorrect: isValid,
        responseTimeMs: elapsedMs,
        usedHint,
        difficulty: question.difficulty
      });

      setActualCorrectness(isValid);
      setIsAnswered(true);
      setResponseTimeMs(elapsedMs);
      setRecommendedRating(recommendation.rating);
      setSelectedRating(recommendation.rating);
      setRecommendationReason(recommendation.reason);

      if (sessionService) {
        sessionService.answerQuestion(selectedAnswer, question, isValid);
        setSessionProgress(sessionService.getCurrentProgress());

        if (!isValid) {
          setLives(prev => {
            const newLives = prev - 1;
            if (newLives <= 0) {
              setGameOver(true);
            }
            return newLives;
          });
        }
      }

      setCurrentReview({
        wordId: question.wordId || question.word,
        correct: isValid,
        rating: recommendation.rating,
        questionType: question.type,
        responseTimeMs: elapsedMs,
        usedHint
      });
    } catch (error) {
      console.error('Error validating answer:', error);
      if (sessionService) {
        const fallbackCorrect = sessionService.answerQuestion(selectedAnswer, question);
        const recommendation = recommendReviewRating({
          isCorrect: fallbackCorrect,
          responseTimeMs: elapsedMs,
          usedHint,
          difficulty: question.difficulty
        });
        setActualCorrectness(fallbackCorrect);
        setIsAnswered(true);
        setSessionProgress(sessionService.getCurrentProgress());
        setResponseTimeMs(elapsedMs);
        setRecommendedRating(recommendation.rating);
        setSelectedRating(recommendation.rating);
        setRecommendationReason(recommendation.reason);
        setCurrentReview({
          wordId: question.wordId || question.word,
          correct: fallbackCorrect,
          rating: recommendation.rating,
          questionType: question.type,
          responseTimeMs: elapsedMs,
          usedHint
        });

        if (!fallbackCorrect) {
          setLives(prev => {
            const newLives = prev - 1;
            if (newLives <= 0) {
              setGameOver(true);
            }
            return newLives;
          });
        }
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleNext = async () => {
    commitCurrentReview();
    if (gameOver) {
      setIsCompleted(true);
      if (sessionService) {
        sessionService.completeSession();
      }
      return;
    }

    const isLastQuestion = currentQuestion === questions.length - 1;
    if (isLastQuestion && currentQuestion + 1 < totalQuestions) {
      const hasMoreQuestions = await loadMoreQuestions();
      if (!hasMoreQuestions && currentQuestion + 1 >= questions.length) {
        setIsCompleted(true);
        if (sessionService) {
          sessionService.completeSession();
        }
        return;
      }
    }

    if (currentQuestion + 1 >= totalQuestions) {
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

    setCurrentQuestion(prev => prev + 1);
    resetQuestionState();
  };

  if (isLoading) {
    return (
      <Center h="calc(100vh - 64px)">
        <Spinner size="xl" color="purple.400" thickness="4px" />
      </Center>
    );
  }

  if (!list || !questions.length) {
    return (
      <Box textAlign="center" py={10}>
        <Text mb={4}>{UI.noQuestions}</Text>
        <Link to="/lists">
          <Button variant="solid">{UI.backToLists}</Button>
        </Link>
      </Box>
    );
  }

  const question = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / totalQuestions) * 100;
  const combo = sessionProgress?.stats.streak || 0;
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
            {`${UI.quizPrefix}${list.name}`}
          </Text>
          <HStack spacing={4} mt={2} flexWrap="wrap" justify={{ base: 'center', md: 'flex-start' }}>
            <Badge
              colorScheme="purple"
              p={2}
              borderRadius="full"
              style={combo > 2 ? { animation: 'sparkle 1s ease infinite' } : undefined}
            >
              {`${UI.comboPrefix}${combo}`}
            </Badge>
            <Badge
              colorScheme="yellow"
              p={2}
              borderRadius="full"
              style={score > 0 ? { animation: 'bounce 1s ease infinite' } : undefined}
            >
              {`${UI.scorePrefix}${score}`}
            </Badge>
            <Badge
              colorScheme="red"
              p={2}
              borderRadius="full"
            >
              {'\u2764'.repeat(Math.max(0, lives))}
            </Badge>
          </HStack>
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
        colorScheme="purple"
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
        borderColor="purple.800"
        px={{ base: 4, md: 8 }}
        py={6}
      >
        <QuestionRenderer
          question={question}
          selectedAnswer={selectedAnswer}
          onAnswerChange={setSelectedAnswer}
          isAnswered={isAnswered}
          isCorrect={actualCorrectness}
          onHintShown={() => setUsedHint(true)}
        />

        {isAnswered && (
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            mt={6}
            p={4}
            bg={actualCorrectness ? 'purple.900' : 'red.900'}
            borderRadius="lg"
            textAlign="center"
          >
            <Text color="white" fontSize={{ base: 'lg', md: 'xl' }} fontWeight="bold">
              {actualCorrectness
                ? `${UI.correctMessage}${combo > 2 ? UI.comboExcellent : combo > 1 ? UI.comboNice : ''}`
                : UI.wrongMessage}
            </Text>

            {(gameOver || currentQuestion + 1 >= totalQuestions) && sessionService && (
              <VStack mt={4} spacing={2}>
                <Divider />
                <Text color="white" fontSize="lg" fontWeight="bold">
                  {gameOver ? UI.gameOver : UI.quizComplete}
                </Text>
                <HStack spacing={4}>
                  <Text color="green.500">{`${UI.statCorrect}\uff1a${sessionProgress?.stats.correct}`}</Text>
                  <Text color="red.300">{`${UI.statIncorrect}\uff1a${sessionProgress?.stats.incorrect}`}</Text>
                  <Text color="purple.300">{`${UI.statBestStreak}\uff1a${sessionProgress?.stats.maxStreak}`}</Text>
                </HStack>
                <Text color="yellow.300" fontSize="sm">
                  {sessionService.getInsights().join(' ')}
                </Text>
              </VStack>
            )}
          </MotionBox>
        )}

        {isAnswered && currentReview && (
          <ReviewRatingPanel
            isCorrect={currentReview.correct}
            selectedRating={selectedRating}
            recommendedRating={recommendedRating}
            recommendationReason={recommendationReason}
            responseTimeMs={responseTimeMs}
            usedHint={usedHint}
            onRatingChange={setSelectedRating}
          />
        )}

        {isCompleted && sessionService && (
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            mt={6}
          >
            <Card
              bg={useColorModeValue('white', 'gray.800')}
              borderColor={useColorModeValue('purple.200', 'purple.600')}
              borderWidth="2px"
              shadow="xl"
            >
              <CardHeader pb={2}>
                <HStack spacing={3} justify="center">
                  <Icon as={CheckCircleIcon} color="purple.500" boxSize={8} />
                  <Text fontSize="2xl" fontWeight="bold" color={useColorModeValue('gray.800', 'white')}>
                    {UI.quizComplete}
                  </Text>
                </HStack>
              </CardHeader>
              <CardBody pt={2}>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mb={4}>
                  <Stat textAlign="center">
                    <StatLabel color={useColorModeValue('gray.600', 'gray.400')}>
                      <HStack justify="center" spacing={1}>
                        <CheckCircleIcon color="green.500" />
                        <Text>{UI.statCorrect}</Text>
                      </HStack>
                    </StatLabel>
                    <StatNumber color="green.500" fontSize="3xl">
                      {sessionProgress?.stats.correct}
                    </StatNumber>
                    <StatHelpText color={useColorModeValue('gray.500', 'gray.400')}>
                      {UI.wellDone}
                    </StatHelpText>
                  </Stat>

                  <Stat textAlign="center">
                    <StatLabel color={useColorModeValue('gray.600', 'gray.400')}>
                      <HStack justify="center" spacing={1}>
                        <InfoIcon color="orange.500" />
                        <Text>{UI.statIncorrect}</Text>
                      </HStack>
                    </StatLabel>
                    <StatNumber color="orange.500" fontSize="3xl">
                      {sessionProgress?.stats.incorrect}
                    </StatNumber>
                    <StatHelpText color={useColorModeValue('gray.500', 'gray.400')}>
                      {UI.keepPracticing}
                    </StatHelpText>
                  </Stat>

                  <Stat textAlign="center">
                    <StatLabel color={useColorModeValue('gray.600', 'gray.400')}>
                      <HStack justify="center" spacing={1}>
                        <StarIcon color="purple.500" />
                        <Text>{UI.statBestStreak}</Text>
                      </HStack>
                    </StatLabel>
                    <StatNumber color="purple.500" fontSize="3xl">
                      {sessionProgress?.stats.maxStreak}
                    </StatNumber>
                    <StatHelpText color={useColorModeValue('gray.500', 'gray.400')}>
                      {UI.feelingGood}
                    </StatHelpText>
                  </Stat>
                </SimpleGrid>

                <Divider mb={4} />

                <VStack spacing={2}>
                  <Text fontSize="lg" fontWeight="semibold" color={useColorModeValue('gray.700', 'gray.200')}>
                    {UI.summary}
                  </Text>
                  <HStack spacing={2} wrap="wrap" justify="center">
                    {sessionService.getInsights().map((insight, index) => (
                      <Badge key={index} colorScheme="purple" fontSize="sm" p={2} borderRadius="full">
                        {insight}
                      </Badge>
                    ))}
                  </HStack>

                  <Text fontSize="sm" color={useColorModeValue('gray.600', 'gray.400')} textAlign="center" mt={2}>
                    {UI.finalScore}
                    <Text as="span" fontWeight="bold" color="purple.500">
                      {`${sessionProgress?.stats.score} ${UI.points}`}
                    </Text>
                  </Text>
                  {quizResults.length > 0 && (
                    <HStack spacing={2} wrap="wrap" justify="center" pt={2}>
                      <Badge colorScheme="red" variant="subtle">
                        Again {quizResults.filter((result) => result.rating === 'again').length}
                      </Badge>
                      <Badge colorScheme="orange" variant="subtle">
                        Hard {quizResults.filter((result) => result.rating === 'hard').length}
                      </Badge>
                      <Badge colorScheme="blue" variant="subtle">
                        Good {quizResults.filter((result) => result.rating === 'good').length}
                      </Badge>
                      <Badge colorScheme="green" variant="subtle">
                        Easy {quizResults.filter((result) => result.rating === 'easy').length}
                      </Badge>
                    </HStack>
                  )}
                </VStack>
              </CardBody>
            </Card>
          </MotionBox>
        )}

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
                colorScheme="purple"
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
                {UI.saveAndFinish}
              </Button>
              <Button
                variant="solid"
                colorScheme="blue"
                size="lg"
                onClick={() => loadMoreQuestions(true)}
                isLoading={isLoading}
                loadingText={UI.loading}
                _hover={{
                  transform: 'translateY(-2px)',
                  shadow: 'lg'
                }}
                transition="all 0.2s"
              >
                {UI.continueQuiz}
              </Button>
            </>
          ) : (
            <Button
              variant="solid"
              colorScheme="purple"
              size="lg"
              onClick={handleNext}
              isLoading={isLoading}
              loadingText={UI.loading}
              _hover={{
                transform: 'translateY(-2px)',
                shadow: 'lg'
              }}
              transition="all 0.2s"
            >
              {currentQuestion + 1 >= totalQuestions ? UI.finishQuiz : UI.nextQuestion}
            </Button>
          )}
        </Flex>
      </MotionBox>
    </MotionBox>
  );
};
