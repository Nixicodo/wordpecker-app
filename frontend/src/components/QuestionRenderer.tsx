import {
  Alert,
  AlertIcon,
  Box,
  Card,
  CardBody,
  HStack,
  Text,
  VStack,
  useColorModeValue
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { Exercise, Question } from '../types';
import PronunciationButton from './PronunciationButton';
import {
  FillBlankQuestion,
  MatchingQuestion,
  MultipleChoiceQuestion,
  SentenceCompletionQuestion,
  TrueFalseQuestion
} from './questions';

const MotionBox = motion(Box);

const UI = {
  feedbackPrefix: '璁茶В锛?',
  correctAnswerPrefix: '姝ｇ‘绛旀锛?',
  correctMatches: '姝ｇ‘閰嶅锛?',
  relatedWordsTitle: '鏈鐩稿叧璇嶆眹锛?'
};

interface QuestionRendererProps {
  question: Exercise | Question;
  selectedAnswer: string;
  onAnswerChange: (answer: string) => void;
  isAnswered: boolean;
  isCorrect?: boolean | null;
  autoPlayPronunciation?: boolean;
}

interface QuestionAnsweredSupplementProps {
  question: Exercise | Question;
  isAnswered: boolean;
  isCorrect?: boolean | null;
  autoPlayPronunciation?: boolean;
}

export const QuestionAnsweredSupplement: React.FC<QuestionAnsweredSupplementProps> = ({
  question,
  isAnswered,
  isCorrect,
  autoPlayPronunciation = false
}) => {
  const feedbackBg = useColorModeValue('green.50', 'green.900');
  const feedbackColor = useColorModeValue('green.700', 'green.200');
  const panelBg = useColorModeValue('white', 'slate.800');
  const mutedColor = useColorModeValue('gray.700', 'gray.300');
  const secondaryColor = useColorModeValue('gray.500', 'gray.400');
  const primaryWord = question.exposedWords?.[0]?.value || question.word;
  const primaryWordData = question.exposedWords?.[0];

  if (!isAnswered) {
    return null;
  }

  return (
    <VStack spacing={4} align="stretch" mt={6}>
      <Card borderRadius="xl" bg={panelBg} variant="outline">
        <CardBody>
          <VStack spacing={4} align="stretch">
            <HStack justify="space-between" align="center" wrap="wrap" spacing={3}>
              <Box>
                <Text fontSize="sm" fontWeight="bold" color="blue.400">
                  发音与说明
                </Text>
                <Text fontSize="xs" color={secondaryColor}>
                  结算完成后展示，可在这里复听和回顾
                </Text>
              </Box>
              <PronunciationButton
                text={primaryWord}
                type="word"
                language="es"
                size="sm"
                colorScheme="blue"
                tooltipText="播放这个单词的发音"
                autoPlay={autoPlayPronunciation}
              />
            </HStack>

            <Box>
              <Text fontSize="xs" color={secondaryColor} mb={1}>
                音标
              </Text>
              <Text fontSize="sm" color={mutedColor} lineHeight="1.6">
                {primaryWordData?.phonetic || '—'}
              </Text>
            </Box>

            <Box>
              <Text fontSize="xs" color={secondaryColor} mb={1}>
                详细解释
              </Text>
              <Text fontSize="sm" color={mutedColor} lineHeight="1.6">
                {primaryWordData?.detailedExplanation || '—'}
              </Text>
            </Box>
          </VStack>
        </CardBody>
      </Card>

      {question.feedback && isCorrect && (
        <Alert status="success" borderRadius="lg" bg={feedbackBg}>
          <AlertIcon />
          <Text color={feedbackColor} fontSize="sm">
            {`${UI.feedbackPrefix}${question.feedback}`}
          </Text>
        </Alert>
      )}

      {question.type === 'fill_blank' && !isCorrect && (
        <Text color="green.400" textAlign="center" fontSize="md">
          {`${UI.correctAnswerPrefix}${question.correctAnswer}`}
        </Text>
      )}

      {question.type === 'matching' && question.pairs && question.pairs.length > 0 && (
        <Box p={4} bg="slate.800" borderRadius="md">
          <Text fontWeight="bold" mb={2}>
            {UI.correctMatches}
          </Text>
          {question.pairs.map((pair, index) => (
            <Text key={`${pair.word}-${pair.definition}-${index}`} fontSize="sm" color="green.300">
              {pair.word} {'->'} {pair.definition}
            </Text>
          ))}
        </Box>
      )}

      {(question.type === 'multiple_choice' || question.type === 'sentence_completion') &&
        question.exposedWords &&
        question.exposedWords.length > 0 && (
          <Box p={4} bg="slate.800" borderRadius="md">
            <Text fontWeight="bold" mb={2}>
              {UI.relatedWordsTitle}
            </Text>
            {question.exposedWords.map((word) => (
              <Text key={word.id} fontSize="sm" color="green.300">
                {word.value} {'->'} {word.meaning || '释义解析中'}
              </Text>
            ))}
          </Box>
        )}
    </VStack>
  );
};

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  selectedAnswer,
  onAnswerChange,
  isAnswered,
  isCorrect,
  autoPlayPronunciation = false
}) => {
  const renderQuestionComponent = () => {
    switch (question.type) {
      case 'multiple_choice':
        return (
          <MultipleChoiceQuestion
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswerChange={onAnswerChange}
            isAnswered={isAnswered}
            isCorrect={isCorrect}
          />
        );
      case 'fill_blank':
        return (
          <FillBlankQuestion
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswerChange={onAnswerChange}
            isAnswered={isAnswered}
            isCorrect={isCorrect}
          />
        );
      case 'true_false':
        return (
          <TrueFalseQuestion
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswerChange={onAnswerChange}
            isAnswered={isAnswered}
            isCorrect={isCorrect}
          />
        );
      case 'sentence_completion':
        return (
          <SentenceCompletionQuestion
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswerChange={onAnswerChange}
            isAnswered={isAnswered}
            isCorrect={isCorrect}
          />
        );
      case 'matching':
        return (
          <MatchingQuestion
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswerChange={onAnswerChange}
            isAnswered={isAnswered}
            isCorrect={isCorrect}
          />
        );
      default:
        return null;
    }
  };

  return (
    <MotionBox
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <VStack spacing={4} align="stretch">
        <Text
          fontSize={{ base: 'xl', md: '2xl' }}
          textAlign="center"
          fontWeight="bold"
          bgGradient="linear(to-r, blue.200, purple.200)"
          bgClip="text"
        >
          {question.question}
        </Text>

        {renderQuestionComponent()}

        {isAnswered && (
          <QuestionAnsweredSupplement
            question={question}
            isAnswered={isAnswered}
            isCorrect={isCorrect}
            autoPlayPronunciation={autoPlayPronunciation}
          />
        )}
      </VStack>
    </MotionBox>
  );
};
