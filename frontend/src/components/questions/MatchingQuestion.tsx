import {
  Text,
  Button,
  VStack,
  Box,
  Stack,
  Grid,
  GridItem
} from '@chakra-ui/react';
import { useState, useEffect, useMemo } from 'react';
import { Exercise, Question } from '../../types';

const UI = {
  empty: '\u5f53\u524d\u6ca1\u6709\u53ef\u5339\u914d\u7684\u5185\u5bb9',
  title: '\u5c06\u6bcf\u4e2a\u5355\u8bcd\u4e0e\u5bf9\u5e94\u91ca\u4e49\u914d\u5bf9\uff1a',
  help: '\u7b2c\u4e00\u6b65\uff1a\u5148\u70b9\u4e00\u4e2a\u5355\u8bcd\u3002\u7b2c\u4e8c\u6b65\uff1a\u518d\u70b9\u5bf9\u5e94\u7684\u91ca\u4e49\u3002',
  words: '\u5355\u8bcd\uff1a',
  definitions: '\u91ca\u4e49\uff1a',
  matched: '\u5df2\u914d\u5bf9',
  matchedWith: '\u5df2\u914d\u5bf9\uff1a',
  selectedPrefix: '\u5df2\u9009\u4e2d\uff1a',
  selectedSuffix: '\uff0c\u73b0\u5728\u70b9\u51fb\u5b83\u5bf9\u5e94\u7684\u91ca\u4e49',
  correctMatches: '\u6b63\u786e\u914d\u5bf9\uff1a',
};

interface MatchingQuestionProps {
  question: Exercise | Question;
  selectedAnswer: string;
  onAnswerChange: (answer: string) => void;
  isAnswered: boolean;
  isCorrect?: boolean | null;
}

export const MatchingQuestion: React.FC<MatchingQuestionProps> = ({
  question,
  selectedAnswer,
  onAnswerChange,
  isAnswered
}) => {
  const [matchingAnswers, setMatchingAnswers] = useState<Record<string, string>>({});
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const cleanText = (text: string): string => {
    return text
      .replace(/^[A-Za-z]\.\s*/, '')
      .replace(/^[0-9]+\.\s*/, '')
      .replace(/^\([A-Za-z]\)\s*/, '')
      .replace(/^\([0-9]+\)\s*/, '')
      .replace(/^[A-Za-z]\)\s*/, '')
      .replace(/^[0-9]+\)\s*/, '')
      .trim();
  };

  const { shuffledWords, shuffledDefinitions } = useMemo(() => {
    if (!question.pairs || question.pairs.length === 0) {
      return { shuffledWords: [], shuffledDefinitions: [] };
    }

    const words = question.pairs.map(p => cleanText(p.word));
    const definitions = question.pairs.map(p => cleanText(p.definition));

    return {
      shuffledWords: shuffleArray(words),
      shuffledDefinitions: shuffleArray(definitions)
    };
  }, [question.pairs]);

  useEffect(() => {
    setSelectedWord(null);
    if (!selectedAnswer) {
      setMatchingAnswers({});
    } else {
      const answers = selectedAnswer.split('|').reduce((acc, pair) => {
        const [word, definition] = pair.split(':');
        if (word && definition) acc[word] = definition;
        return acc;
      }, {} as Record<string, string>);
      setMatchingAnswers(answers);
    }
  }, [selectedAnswer, question.word]);

  const handleMatchingChange = (word: string, definition: string) => {
    const newAnswers = { ...matchingAnswers };

    Object.keys(newAnswers).forEach(key => {
      if (newAnswers[key] === definition) {
        delete newAnswers[key];
      }
    });

    newAnswers[word] = definition;
    setMatchingAnswers(newAnswers);

    const answerString = Object.entries(newAnswers)
      .map(([w, d]) => `${w}:${d}`)
      .join('|');
    onAnswerChange(answerString);
  };

  if (!question.pairs || question.pairs.length === 0) {
    return <Text>{UI.empty}</Text>;
  }

  return (
    <VStack spacing={4} align="stretch">
      <Text fontSize="lg" textAlign="center" mb={4}>
        {UI.title}
      </Text>
      <Text fontSize="sm" color="gray.400" textAlign="center">
        {UI.help}
      </Text>

      <Grid templateColumns="1fr 1fr" gap={6}>
        <GridItem>
          <Text fontWeight="bold" mb={3} color="blue.300">{UI.words}</Text>
          <Stack spacing={2}>
            {shuffledWords.map((word) => {
              const isSelected = selectedWord === word;
              const isMatched = matchingAnswers[word];
              return (
                <Button
                  key={word}
                  variant={isSelected ? 'solid' : 'outline'}
                  size="md"
                  p={3}
                  bg={isMatched ? 'green.600' : isSelected ? 'blue.600' : 'slate.700'}
                  borderColor={isMatched ? 'green.500' : isSelected ? 'blue.500' : 'slate.600'}
                  color="white"
                  fontSize="md"
                  textAlign="center"
                  onClick={() => {
                    if (!isAnswered && !isMatched) {
                      setSelectedWord(isSelected ? null : word);
                    }
                  }}
                  isDisabled={isAnswered || !!isMatched}
                  _hover={{
                    bg: isAnswered || isMatched ? undefined : isSelected ? 'blue.500' : 'slate.600'
                  }}
                  cursor={isAnswered || isMatched ? 'default' : 'pointer'}
                >
                  {word}
                  {isMatched && ` ${UI.matched}`}
                </Button>
              );
            })}
          </Stack>
        </GridItem>

        <GridItem>
          <Text fontWeight="bold" mb={3} color="green.300">{UI.definitions}</Text>
          <Stack spacing={2}>
            {shuffledDefinitions.map((definition) => {
              const isMatched = Object.values(matchingAnswers).includes(definition);
              const matchedWord = Object.keys(matchingAnswers).find(key => matchingAnswers[key] === definition);

              return (
                <Button
                  key={definition}
                  variant="outline"
                  size="md"
                  p={3}
                  whiteSpace="normal"
                  height="auto"
                  bg={isMatched ? 'green.600' : 'slate.700'}
                  borderColor={isMatched ? 'green.500' : 'slate.600'}
                  color="white"
                  onClick={() => {
                    if (selectedWord && !isAnswered && !isMatched) {
                      handleMatchingChange(selectedWord, definition);
                      setSelectedWord(null);
                    }
                  }}
                  isDisabled={isAnswered || isMatched || !selectedWord}
                  _hover={{
                    bg: isAnswered || isMatched || !selectedWord ? undefined : 'slate.600'
                  }}
                  cursor={isAnswered || isMatched || !selectedWord ? 'default' : 'pointer'}
                >
                  <VStack spacing={1} align="stretch">
                    <Text fontSize="sm">{definition}</Text>
                    {isMatched && matchedWord && (
                      <Text fontSize="xs" color="green.200">
                        {`${UI.matchedWith}${matchedWord}`}
                      </Text>
                    )}
                  </VStack>
                </Button>
              );
            })}
          </Stack>
        </GridItem>
      </Grid>

      {selectedWord && (
        <Box p={3} bg="blue.800" borderRadius="md" textAlign="center">
          <Text color="blue.200">
            {UI.selectedPrefix}
            <strong>{selectedWord}</strong>
            {UI.selectedSuffix}
          </Text>
        </Box>
      )}

      {isAnswered && (
        <Box mt={4} p={4} bg="slate.800" borderRadius="md">
          <Text fontWeight="bold" mb={2}>{UI.correctMatches}</Text>
          {question.pairs?.map((pair, idx) => (
            <Text key={idx} fontSize="sm" color="green.300">
              {pair.word} {'->'} {pair.definition}
            </Text>
          ))}
        </Box>
      )}
    </VStack>
  );
};
