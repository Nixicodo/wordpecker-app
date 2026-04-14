import { Box, Text, Progress, HStack, Badge, VStack, SimpleGrid } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { isDueForReview } from '../utils/reviewState';

const MotionBox = motion(Box);

interface ProgressIndicatorProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showBadge?: boolean;
}

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

const getProgressColor = (score: number) => {
  if (score >= 85) return 'green';
  if (score >= 65) return 'teal';
  if (score >= 45) return 'blue';
  if (score >= 25) return 'orange';
  return 'red';
};

const getProgressLabel = (score: number) => {
  if (score >= 85) return 'Anchored';
  if (score >= 65) return 'Stable';
  if (score >= 45) return 'Warming';
  if (score >= 25) return 'Fragile';
  return 'Due';
};

const getProgressEmoji = (score: number) => {
  if (score >= 85) return '◆';
  if (score >= 65) return '◈';
  if (score >= 45) return '◉';
  if (score >= 25) return '◌';
  return '◍';
};

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  score,
  size = 'md',
  showLabel = true,
  showBadge = true
}) => {
  const safeScore = clampScore(score);
  const progressColor = getProgressColor(safeScore);
  const progressLabel = getProgressLabel(safeScore);
  const progressEmoji = getProgressEmoji(safeScore);

  const sizeProps = {
    sm: {
      progressSize: 'sm' as const,
      fontSize: 'xs',
      badgeSize: 'sm' as const,
      spacing: 1
    },
    md: {
      progressSize: 'md' as const,
      fontSize: 'sm',
      badgeSize: 'md' as const,
      spacing: 2
    },
    lg: {
      progressSize: 'lg' as const,
      fontSize: 'md',
      badgeSize: 'lg' as const,
      spacing: 3
    }
  };

  const props = sizeProps[size];

  return (
    <MotionBox
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <HStack spacing={props.spacing} align="center">
        {showBadge && (
          <Badge
            colorScheme={progressColor}
            variant="subtle"
            borderRadius="full"
            px={2.5}
            py={1}
            fontSize={props.fontSize}
          >
            {progressEmoji} {safeScore}
          </Badge>
        )}

        <Box flex={1} minW="80px">
          <Progress
            value={safeScore}
            size={props.progressSize}
            colorScheme={progressColor}
            borderRadius="full"
            bg="whiteAlpha.100"
          />
        </Box>

        {showLabel && (
          <Text
            fontSize={props.fontSize}
            color={`${progressColor}.300`}
            fontWeight="semibold"
            letterSpacing="0.04em"
            textTransform="uppercase"
            minW="fit-content"
          >
            {progressLabel}
          </Text>
        )}
      </HStack>
    </MotionBox>
  );
};

interface OverallProgressProps {
  words: Array<{
    dueAt?: string;
    reviewCount: number;
    lapseCount: number;
    stability: number;
    status: number;
  }>;
  size?: 'sm' | 'md' | 'lg';
}

const buildAggregateScore = (words: OverallProgressProps['words']) => {
  if (!words.length) {
    return 0;
  }

  const total = words.reduce((sum, word) => {
    const base = Math.min(100, Math.round(word.stability * 14 + word.reviewCount * 7 - word.lapseCount * 9));
    return sum + Math.max(0, base);
  }, 0);

  return Math.round(total / words.length);
};

export const OverallProgress: React.FC<OverallProgressProps> = ({ words, size = 'md' }) => {
  const totalWords = words.length;
  const now = Date.now();
  const dueWords = words.filter((word) => isDueForReview(word, now)).length;
  const newWords = words.filter((word) => word.reviewCount === 0 || word.status === 0).length;
  const learningWords = words.filter((word) => word.status === 1 || word.status === 3).length;
  const stableWords = words.filter((word) => word.status === 2 && word.lapseCount === 0 && word.stability >= 4).length;
  const aggregateScore = buildAggregateScore(words);

  return (
    <MotionBox
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      p={5}
      bg="linear-gradient(135deg, rgba(17,25,40,0.96), rgba(8,15,28,0.92))"
      borderRadius="2xl"
      borderWidth={1}
      borderColor="whiteAlpha.120"
      boxShadow="0 28px 60px rgba(0,0,0,0.28)"
    >
      <VStack spacing={4} align="stretch">
        <Text fontSize="lg" fontWeight="bold" color="white">
          Review Pulse
        </Text>

        <ProgressIndicator
          score={aggregateScore}
          size={size}
          showLabel
          showBadge
        />

        <SimpleGrid columns={4} spacing={3}>
          <Box bg="whiteAlpha.060" borderRadius="xl" px={3} py={2}>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.08em">Due</Text>
            <Text fontSize="lg" color="red.300" fontWeight="bold">{dueWords}</Text>
          </Box>
          <Box bg="whiteAlpha.060" borderRadius="xl" px={3} py={2}>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.08em">New</Text>
            <Text fontSize="lg" color="orange.300" fontWeight="bold">{newWords}</Text>
          </Box>
          <Box bg="whiteAlpha.060" borderRadius="xl" px={3} py={2}>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.08em">Learning</Text>
            <Text fontSize="lg" color="blue.300" fontWeight="bold">{learningWords}</Text>
          </Box>
          <Box bg="whiteAlpha.060" borderRadius="xl" px={3} py={2}>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing="0.08em">Stable</Text>
            <Text fontSize="lg" color="green.300" fontWeight="bold">{stableWords}</Text>
          </Box>
        </SimpleGrid>

        <Text fontSize="sm" color="gray.500">
          Total words: {totalWords}
        </Text>
      </VStack>
    </MotionBox>
  );
};

export const deriveWordScore = (word: {
  reviewCount: number;
  lapseCount: number;
  stability: number;
  status?: number;
  dueAt?: string;
}) => {
  const now = Date.now();
  const overduePenalty = isDueForReview(word, now) ? 18 : 0;
  return clampScore(word.stability * 14 + word.reviewCount * 7 - word.lapseCount * 9 - overduePenalty);
};
