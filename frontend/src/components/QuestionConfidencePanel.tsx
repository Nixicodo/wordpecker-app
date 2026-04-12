import {
  Badge,
  Box,
  Button,
  HStack,
  SimpleGrid,
  Text,
  useColorModeValue
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { ExposureWord } from '../utils/questionExposure';

interface QuestionConfidencePanelProps {
  words: ExposureWord[];
  selectedWordIds: string[];
  onToggleWord: (wordId: string) => void;
}

const MotionBox = motion(Box);

export const QuestionConfidencePanel: React.FC<QuestionConfidencePanelProps> = ({
  words,
  selectedWordIds,
  onToggleWord
}) => {
  const panelBg = useColorModeValue('orange.50', 'orange.900');
  const panelBorder = useColorModeValue('orange.200', 'orange.500');
  const bodyColor = useColorModeValue('gray.600', 'gray.300');
  const chipBg = useColorModeValue('white', 'whiteAlpha.180');
  const selectedWordIdSet = new Set(selectedWordIds);

  if (!words.length) {
    return null;
  }

  return (
    <MotionBox
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      mt={6}
      p={4}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={panelBorder}
      bg={panelBg}
    >
      <HStack justify="space-between" align="center" mb={3} wrap="wrap">
        <Text fontWeight="bold" color="orange.300">
          哪些词你这次其实还不熟？
        </Text>
        <Badge colorScheme={selectedWordIds.length ? 'orange' : 'gray'} borderRadius="full" px={3} py={1}>
          {selectedWordIds.length ? `已标记 ${selectedWordIds.length}` : '可选标记'}
        </Badge>
      </HStack>

      <Text fontSize="sm" color={bodyColor} mb={4}>
        标记后的词会作为“需要再练”的信号并入后续调度。即使这题答对了，也能让系统更快把它们安排回来。
      </Text>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
        {words.map((word) => {
          const isSelected = selectedWordIdSet.has(word.id);

          return (
            <Button
              key={word.id}
              variant={isSelected ? 'solid' : 'outline'}
              colorScheme="orange"
              justifyContent="flex-start"
              h="auto"
              minH="72px"
              px={4}
              py={3}
              bg={isSelected ? undefined : chipBg}
              borderRadius="xl"
              whiteSpace="normal"
              onClick={() => onToggleWord(word.id)}
            >
              <Box textAlign="left">
                <Text fontWeight="bold">{word.value}</Text>
                <Text fontSize="sm" opacity={0.85}>
                  {word.meaning || '释义解析中'}
                </Text>
              </Box>
            </Button>
          );
        })}
      </SimpleGrid>
    </MotionBox>
  );
};
