import { Box, HStack, Icon, Spinner, Text, Tooltip } from '@chakra-ui/react';
import { useEffect, useMemo, useRef } from 'react';
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';
import { FaTimes } from 'react-icons/fa';

export type ReviewTimelineStatus = 'idle' | 'pending' | 'correct' | 'incorrect' | 'failed';

const getStatusStyles = (status: ReviewTimelineStatus, viewed: boolean) => {
  switch (status) {
    case 'pending':
      return {
        bg: 'blue.500',
        color: 'white',
        borderColor: 'blue.300'
      };
    case 'correct':
      return {
        bg: 'green.500',
        color: 'white',
        borderColor: 'green.300'
      };
    case 'incorrect':
      return {
        bg: viewed ? 'gray.500' : 'red.500',
        color: 'white',
        borderColor: viewed ? 'gray.300' : 'red.300'
      };
    case 'failed':
      return {
        bg: 'orange.500',
        color: 'white',
        borderColor: 'orange.300'
      };
    default:
      return {
        bg: 'gray.700',
        color: 'gray.200',
        borderColor: 'whiteAlpha.300'
      };
  }
};

const getStatusLabel = (status: ReviewTimelineStatus) => {
  switch (status) {
    case 'pending':
      return '审核中';
    case 'correct':
      return '已判对';
    case 'incorrect':
      return '已判错';
    case 'failed':
      return '审核失败';
    default:
      return '未作答';
  }
};

export const ReviewTimeline = ({
  items,
  currentIndex,
  onSelect
}: {
  items: Array<{ status: ReviewTimelineStatus; viewed: boolean }>;
  currentIndex: number;
  onSelect: (index: number) => void;
}) => {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const currentNode = itemRefs.current[currentIndex];
    currentNode?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [currentIndex]);

  const nodes = useMemo(() => items.map((item, index) => {
    const style = getStatusStyles(item.status, item.viewed);
    const isCurrent = index === currentIndex;

    return (
      <Tooltip key={`timeline-${index}`} label={`第 ${index + 1} 题：${getStatusLabel(item.status)}`} hasArrow>
        <Box
          as="button"
          ref={(element: HTMLButtonElement | null) => {
            itemRefs.current[index] = element;
          }}
          onClick={() => onSelect(index)}
          borderRadius="full"
          minW="46px"
          h="46px"
          borderWidth="2px"
          borderColor={isCurrent ? 'white' : style.borderColor}
          bg={style.bg}
          color={style.color}
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxShadow={isCurrent ? '0 0 0 2px rgba(251, 191, 36, 0.38)' : 'none'}
          transition="all 0.2s"
          flexShrink={0}
        >
          {item.status === 'pending' ? (
            <Spinner size="sm" thickness="3px" />
          ) : item.status === 'correct' ? (
            <Icon as={CheckCircleIcon} boxSize={5} />
          ) : item.status === 'incorrect' ? (
            <Icon as={FaTimes} boxSize={4} />
          ) : item.status === 'failed' ? (
            <Icon as={WarningIcon} boxSize={5} />
          ) : (
            <Text fontWeight="bold">{index + 1}</Text>
          )}
        </Box>
      </Tooltip>
    );
  }), [currentIndex, items, onSelect]);

  return (
    <Box
      borderRadius="2xl"
      borderWidth="1px"
      borderColor="whiteAlpha.200"
      bg="whiteAlpha.090"
      px={4}
      py={4}
      overflowX="auto"
    >
      <HStack spacing={3} minW="max-content">
        {nodes}
      </HStack>
    </Box>
  );
};
