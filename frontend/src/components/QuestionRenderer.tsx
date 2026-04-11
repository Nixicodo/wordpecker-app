import {
  Box,
  Text,
  VStack,
  HStack,
  Button,
  Alert,
  AlertIcon,
  useColorModeValue,
  Collapse
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { FaLightbulb } from 'react-icons/fa';
import { Exercise, Question } from '../types';
import {
  MultipleChoiceQuestion,
  FillBlankQuestion,
  TrueFalseQuestion,
  SentenceCompletionQuestion,
  MatchingQuestion
} from './questions';

const MotionBox = motion(Box);

const UI = {
  hideHint: '隐藏提示',
  showHint: '显示提示',
  hintPrefix: '提示：',
  feedbackPrefix: '讲解：',
};

interface QuestionRendererProps {
  question: Exercise | Question;
  selectedAnswer: string;
  onAnswerChange: (answer: string) => void;
  isAnswered: boolean;
  isCorrect?: boolean | null;
  onHintShown?: () => void;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  selectedAnswer,
  onAnswerChange,
  isAnswered,
  isCorrect,
  onHintShown
}) => {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    setShowHint(false);
  }, [question.word, question.question]);

  const hintBg = useColorModeValue('blue.50', 'blue.900');
  const hintColor = useColorModeValue('blue.700', 'blue.200');
  const feedbackBg = useColorModeValue('green.50', 'green.900');
  const feedbackColor = useColorModeValue('green.700', 'green.200');

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

  const toggleHint = () => {
    if (!showHint) {
      onHintShown?.();
    }

    setShowHint((prev) => !prev);
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

        {question.hint && !isAnswered && (
          <HStack justify="center">
            <Button
              leftIcon={<FaLightbulb />}
              variant="outline"
              colorScheme="blue"
              size="sm"
              onClick={toggleHint}
            >
              {showHint ? UI.hideHint : UI.showHint}
            </Button>
          </HStack>
        )}

        {question.hint && !isAnswered && (
          <Collapse in={showHint} animateOpacity>
            <Alert status="info" borderRadius="lg" bg={hintBg}>
              <AlertIcon />
              <Text color={hintColor} fontSize="sm">
                {`${UI.hintPrefix} ${question.hint}`}
              </Text>
            </Alert>
          </Collapse>
        )}

        {renderQuestionComponent()}

        {question.feedback && isAnswered && isCorrect && (
          <Alert status="success" borderRadius="lg" bg={feedbackBg}>
            <AlertIcon />
            <Text color={feedbackColor} fontSize="sm">
              {`${UI.feedbackPrefix} ${question.feedback}`}
            </Text>
          </Alert>
        )}
      </VStack>
    </MotionBox>
  );
};
