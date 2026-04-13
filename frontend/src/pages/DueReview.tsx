import {
  Badge,
  Box,
  Button,
  Center,
  Container,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  VStack,
  useToast
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaClock, FaListUl, FaGraduationCap } from 'react-icons/fa';
import { apiService } from '../services/api';
import { WordList } from '../types';
import { detectUiLocale } from '../i18n/ui';

const MotionBox = motion(Box);

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export const DueReview = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const isZh = detectUiLocale() === 'zh-CN';

  const [list, setList] = useState<WordList | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDueReview = async () => {
      try {
        const dueReviewList = await apiService.getDueReview();
        setList(dueReviewList);
      } catch (error) {
        console.error('Failed to load due review list:', error);
        toast({
          title: isZh ? '加载待复习失败' : 'Failed to load due review',
          description: isZh ? '请稍后重试' : 'Please try again later',
          status: 'error',
          duration: 5000,
          isClosable: true
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadDueReview();
  }, [isZh, toast]);

  if (isLoading) {
    return (
      <Center h="calc(100vh - 64px)" flexDirection="column" gap={4}>
        <Spinner size="xl" color="orange.300" thickness="4px" />
        <Text color="gray.300">
          {isZh ? '正在汇总今天该复习的单词…' : 'Collecting today\'s review words...'}
        </Text>
      </Center>
    );
  }

  if (!list) {
    return (
      <Center h="calc(100vh - 64px)" px={6}>
        <VStack spacing={4}>
          <Text color="gray.300">
            {isZh ? '暂时无法打开待复习模块。' : 'Unable to open due review right now.'}
          </Text>
          <Button colorScheme="green" onClick={() => navigate('/lists')}>
            {isZh ? '返回词树' : 'Back to Trees'}
          </Button>
        </VStack>
      </Center>
    );
  }

  const dueCount = list.dueCount || 0;
  const sourceListCount = list.sourceListCount || 0;
  const retentionScore = list.retentionScore || 0;

  return (
    <Container maxW="container.lg" py={{ base: 8, md: 12 }} px={{ base: 4, md: 8 }}>
      <MotionBox initial="hidden" animate="visible" variants={fadeIn} transition={{ duration: 0.45 }}>
        <Box
          bg="linear-gradient(180deg, rgba(14,22,36,0.96), rgba(9,14,24,0.92))"
          borderRadius="3xl"
          borderWidth="1px"
          borderColor="whiteAlpha.160"
          p={{ base: 6, md: 8 }}
          boxShadow="2xl"
        >
          <Flex
            direction={{ base: 'column', md: 'row' }}
            justify="space-between"
            align={{ base: 'flex-start', md: 'center' }}
            gap={6}
          >
            <Box maxW="2xl">
              <Badge colorScheme="orange" variant="solid" px={3} py={1} borderRadius="full" mb={4}>
                {isZh ? '系统聚合复习' : 'System Review Queue'}
              </Badge>
              <Heading
                as="h1"
                size="2xl"
                color="white"
                display="flex"
                alignItems="center"
                gap={3}
              >
                <Icon as={FaClock} color="orange.300" />
                {isZh ? '待复习' : 'Due Review'}
              </Heading>
              <Text mt={4} color="gray.300" fontSize="lg" lineHeight="1.8">
                {dueCount > 0
                  ? (isZh
                    ? '这里汇总了所有计划复习日期不晚于今天的单词。你在这里完成的作答，会直接同步回它们原本所属的词树与学习状态。'
                    : 'This queue aggregates every word whose scheduled review date is due on or before today, and every answer syncs back to its original tree.')
                  : (isZh
                    ? '今天暂时没有到期的复习任务。你可以先去词树里学习新单词，稍后再回来查看。'
                    : 'There are no review items due today right now. You can learn new words first and come back later.')}
              </Text>
            </Box>

            <VStack align={{ base: 'stretch', md: 'flex-end' }} spacing={3} w={{ base: 'full', md: 'auto' }}>
              <Button
                leftIcon={<FaGraduationCap />}
                colorScheme="green"
                size="lg"
                width={{ base: 'full', md: '220px' }}
                isDisabled={dueCount === 0}
                onClick={() => navigate(`/learn/${list.id}`, { state: { list } })}
              >
                {isZh ? '开始复习' : 'Start Review'}
              </Button>
              <Button
                leftIcon={<FaListUl />}
                variant="outline"
                colorScheme="orange"
                size="lg"
                width={{ base: 'full', md: '220px' }}
                onClick={() => navigate(`/lists/${list.id}`, { state: { list } })}
              >
                {isZh ? '查看复习清单' : 'View Queue'}
              </Button>
            </VStack>
          </Flex>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mt={8}>
            <Box bg="whiteAlpha.060" borderWidth="1px" borderColor="whiteAlpha.120" borderRadius="2xl" p={5}>
              <Stat>
                <StatLabel color="gray.400">{isZh ? '今日应复习' : 'Due Today'}</StatLabel>
                <StatNumber color="orange.300">{dueCount}</StatNumber>
              </Stat>
            </Box>
            <Box bg="whiteAlpha.060" borderWidth="1px" borderColor="whiteAlpha.120" borderRadius="2xl" p={5}>
              <Stat>
                <StatLabel color="gray.400">{isZh ? '来源词树' : 'Source Trees'}</StatLabel>
                <StatNumber color="yellow.300">{sourceListCount}</StatNumber>
              </Stat>
            </Box>
            <Box bg="whiteAlpha.060" borderWidth="1px" borderColor="whiteAlpha.120" borderRadius="2xl" p={5}>
              <Stat>
                <StatLabel color="gray.400">{isZh ? '当前保留率' : 'Retention'}</StatLabel>
                <StatNumber color="green.300">{retentionScore}%</StatNumber>
              </Stat>
            </Box>
          </SimpleGrid>
        </Box>
      </MotionBox>
    </Container>
  );
};
