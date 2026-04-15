import {
  Badge,
  Box,
  Button,
  Container,
  HStack,
  Heading,
  Text,
  VStack
} from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FaArrowRight, FaClock } from 'react-icons/fa';
import { DisciplineStatus } from '../types';

const getTitle = (status: DisciplineStatus) => {
  switch (status.entryState) {
    case 'hard_locked':
      return '新增入口已被硬锁定';
    case 'soft_locked':
      return '先清完今天的 due，再继续拓词';
    case 'quota_reached':
      return '今天的新词额度已经用完';
    default:
      return '当前入口暂不可用';
  }
};

const getDescription = (status: DisciplineStatus) => {
  switch (status.entryState) {
    case 'hard_locked':
      return `当前 backlog 为 ${status.backlog}，已经超过硬阈值 30。现在不允许继续进入新增词汇主流程。`;
    case 'soft_locked':
      return `你还有 ${status.dueCount} 个待复习内容没清。纪律化主线要求先完成 due review，再进入探索型入口。`;
    case 'quota_reached':
      return `今天已经引入 ${status.newWordsAddedToday} 个新词，达到每日上限 ${status.dailyNewWordLimit}。今天不再继续新增。`;
    default:
      return '请先回到主线复习。';
  }
};

export const DisciplineLockScreen = ({
  status,
  title
}: {
  status: DisciplineStatus;
  title: string;
}) => (
  <Container maxW="container.md" py={{ base: 8, md: 12 }} px={{ base: 4, md: 6 }}>
    <Box
      borderRadius="3xl"
      borderWidth="1px"
      borderColor={status.entryState === 'hard_locked' ? 'red.300' : 'orange.300'}
      bg="rgba(15, 23, 42, 0.94)"
      boxShadow="0 24px 60px rgba(15, 23, 42, 0.38)"
      px={{ base: 5, md: 8 }}
      py={{ base: 6, md: 8 }}
    >
      <VStack align="stretch" spacing={6}>
        <HStack spacing={3}>
          <Badge
            colorScheme={status.entryState === 'hard_locked' ? 'red' : 'orange'}
            variant="solid"
            px={3}
            py={1}
            borderRadius="full"
          >
            {title}
          </Badge>
          <Badge colorScheme="yellow" variant="subtle" px={3} py={1} borderRadius="full">
            Due {status.dueCount}
          </Badge>
          <Badge colorScheme="purple" variant="subtle" px={3} py={1} borderRadius="full">
            今日新词 {status.newWordsAddedToday}/{status.dailyNewWordLimit}
          </Badge>
        </HStack>

        <Box>
          <Heading size="lg" color="white">
            {getTitle(status)}
          </Heading>
          <Text mt={3} color="gray.300" lineHeight="1.8">
            {getDescription(status)}
          </Text>
        </Box>

        <Box
          borderRadius="2xl"
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          bg="whiteAlpha.100"
          px={5}
          py={4}
        >
          <Text color="gray.100" fontWeight="bold">
            当前状态
          </Text>
          <Text mt={2} color="gray.300">
            待复习 backlog：{status.backlog}
          </Text>
          <Text color="gray.300">
            今日剩余新词额度：{status.remainingNewWordQuota}
          </Text>
        </Box>

        <HStack spacing={3} flexWrap="wrap">
          <Button
            as={RouterLink}
            to="/reviews"
            colorScheme="orange"
            leftIcon={<FaClock />}
            rightIcon={<FaArrowRight />}
            size="lg"
          >
            立即前往 Due Review
          </Button>
          <Button
            as={RouterLink}
            to="/lists"
            variant="outline"
            borderColor="whiteAlpha.400"
            color="white"
            _hover={{ bg: 'whiteAlpha.120' }}
            size="lg"
          >
            返回词树首页
          </Button>
        </HStack>
      </VStack>
    </Box>
  </Container>
);
