import {
  Box,
  Button,
  Grid,
  GridItem,
  Stack,
  Text,
  VStack
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { Exercise, Question } from '../../types';

const UI = {
  empty: '当前没有可配对的内容',
  title: '将每个单词与对应释义配对：',
  help: '第一步：先点一个单词。第二步：再点对应的释义。',
  words: '单词：',
  definitions: '释义：',
  matched: '已配对',
  matchedWith: '已配对：',
  selectedPrefix: '已选中：',
  selectedSuffix: '，现在点击它对应的释义'
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
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  };

  const cleanText = (text: string): string => (
    text
      .replace(/^[A-Za-z]\.\s*/, '')
      .replace(/^[0-9]+\.\s*/, '')
      .replace(/^\([A-Za-z]\)\s*/, '')
      .replace(/^\([0-9]+\)\s*/, '')
      .replace(/^[A-Za-z]\)\s*/, '')
      .replace(/^[0-9]+\)\s*/, '')
      .trim()
  );

  const { shuffledWords, shuffledDefinitions } = useMemo(() => {
    if (!question.pairs || question.pairs.length === 0) {
      return { shuffledWords: [], shuffledDefinitions: [] };
    }

    const words = question.pairs.map((pair) => cleanText(pair.word));
    const definitions = question.pairs.map((pair) => cleanText(pair.definition));

    return {
      shuffledWords: shuffleArray(words),
      shuffledDefinitions: shuffleArray(definitions)
    };
  }, [question.pairs]);

  useEffect(() => {
    setSelectedWord(null);
    if (!selectedAnswer) {
      setMatchingAnswers({});
      return;
    }

    const answers = selectedAnswer.split('|').reduce((accumulator, pair) => {
      const [word, definition] = pair.split(':');
      if (word && definition) {
        accumulator[word] = definition;
      }
      return accumulator;
    }, {} as Record<string, string>);
    setMatchingAnswers(answers);
  }, [selectedAnswer, question.word]);

  const handleMatchingChange = (word: string, definition: string) => {
    const nextAnswers = { ...matchingAnswers };

    Object.keys(nextAnswers).forEach((key) => {
      if (nextAnswers[key] === definition) {
        delete nextAnswers[key];
      }
    });

    nextAnswers[word] = definition;
    setMatchingAnswers(nextAnswers);

    const answerString = Object.entries(nextAnswers)
      .map(([currentWord, currentDefinition]) => `${currentWord}:${currentDefinition}`)
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
                  isDisabled={isAnswered || Boolean(isMatched)}
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
              const matchedWord = Object.keys(matchingAnswers).find(
                (key) => matchingAnswers[key] === definition
              );

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
    </VStack>
  );
};
