import {
  Badge,
  Box,
  Button,
  HStack,
  SimpleGrid,
  Text,
  useColorModeValue
} from '@chakra-ui/react';
import { ReviewRating } from '../types';
import { formatResponseTime } from '../utils/reviewRating';

const ratingMeta: Array<{
  value: Exclude<ReviewRating, 'again'>;
  label: string;
  description: string;
  colorScheme: 'orange' | 'blue' | 'green';
}> = [
  { value: 'hard', label: 'Hard', description: '答对了，但明显吃力', colorScheme: 'orange' },
  { value: 'good', label: 'Good', description: '正常答对，节奏合适', colorScheme: 'blue' },
  { value: 'easy', label: 'Easy', description: '很轻松，几乎秒出', colorScheme: 'green' }
];

interface ReviewRatingPanelProps {
  isCorrect: boolean;
  selectedRating: ReviewRating;
  recommendedRating: ReviewRating;
  recommendationReason: string;
  responseTimeMs: number;
  usedHint: boolean;
  onRatingChange: (rating: ReviewRating) => void;
}

export const ReviewRatingPanel: React.FC<ReviewRatingPanelProps> = ({
  isCorrect,
  selectedRating,
  recommendedRating,
  recommendationReason,
  responseTimeMs,
  usedHint,
  onRatingChange
}) => {
  const panelBg = useColorModeValue('blackAlpha.50', 'whiteAlpha.70');
  const metricBg = useColorModeValue('white', 'whiteAlpha.120');
  const bodyColor = useColorModeValue('gray.600', 'gray.300');

  return (
    <Box
      mt={6}
      p={4}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={isCorrect ? 'green.300' : 'red.300'}
      bg={panelBg}
    >
      <HStack justify="space-between" align="center" mb={3} wrap="wrap">
        <Text fontWeight="bold" color={isCorrect ? 'green.300' : 'red.300'}>
          {isCorrect ? '这题算得怎么样？' : '这题会重新安排复习'}
        </Text>
        <HStack spacing={2}>
          <Badge bg={metricBg} color="inherit" borderRadius="full" px={3} py={1}>
            耗时 {formatResponseTime(responseTimeMs)}
          </Badge>
          <Badge
            colorScheme={usedHint ? 'yellow' : 'gray'}
            variant={usedHint ? 'solid' : 'subtle'}
            borderRadius="full"
            px={3}
            py={1}
          >
            {usedHint ? '已使用提示' : '未使用提示'}
          </Badge>
        </HStack>
      </HStack>

      <Text fontSize="sm" color={bodyColor} mb={4}>
        {recommendationReason}
      </Text>

      {isCorrect ? (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          {ratingMeta.map((item) => (
            <Button
              key={item.value}
              variant={selectedRating === item.value ? 'solid' : 'outline'}
              colorScheme={item.colorScheme}
              justifyContent="flex-start"
              h="auto"
              py={3}
              px={4}
              onClick={() => onRatingChange(item.value)}
              borderRadius="xl"
              whiteSpace="normal"
            >
              <Box textAlign="left">
                <HStack spacing={2} mb={1}>
                  <Text fontWeight="bold">{item.label}</Text>
                  {recommendedRating === item.value && (
                    <Badge colorScheme={item.colorScheme} variant="subtle">
                      推荐
                    </Badge>
                  )}
                </HStack>
                <Text fontSize="sm" opacity={0.85}>
                  {item.description}
                </Text>
              </Box>
            </Button>
          ))}
        </SimpleGrid>
      ) : (
        <Badge colorScheme="red" variant="solid" borderRadius="full" px={4} py={2}>
          Again
        </Badge>
      )}
    </Box>
  );
};
