import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Container,
  Flex,
  Heading,
  Progress,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
  useToast
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheck, FaHourglassHalf, FaSeedling, FaSnowflake } from 'react-icons/fa';
import { apiService } from '../services/api';
import { DiscoveryAssessment, DiscoveryWord, DiscoveryWordsResponse } from '../types';

const resolveApiErrorMessage = (error: unknown, fallback: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object'
  ) {
    const response = (error as { response?: { status?: number; data?: { message?: string; error?: string } } }).response;
    return response?.data?.message || response?.data?.error || fallback;
  }

  return fallback;
};

const assessmentButtons: Array<{
  assessment: DiscoveryAssessment;
  label: string;
  description: string;
  colorScheme: string;
  icon: typeof FaCheck;
}> = [
  {
    assessment: 'mastered',
    label: '非常熟练',
    description: '直接完成学习，不占今日新词数，也不再复习。',
    colorScheme: 'green',
    icon: FaCheck
  },
  {
    assessment: 'familiar',
    label: '比较熟练',
    description: '进入较长的首次复习间隔。',
    colorScheme: 'teal',
    icon: FaSnowflake
  },
  {
    assessment: 'uncertain',
    label: '不太熟悉',
    description: '进入中等的首次复习间隔。',
    colorScheme: 'orange',
    icon: FaHourglassHalf
  },
  {
    assessment: 'unknown',
    label: '完全陌生',
    description: '进入最短的首次复习间隔。',
    colorScheme: 'red',
    icon: FaSeedling
  }
];

export const WordLearningSession: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [submittingAssessment, setSubmittingAssessment] = useState<DiscoveryAssessment | null>(null);
  const [batch, setBatch] = useState<DiscoveryWordsResponse | null>(null);
  const [words, setWords] = useState<DiscoveryWord[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(15);
  const [remainingQuota, setRemainingQuota] = useState(15);

  const cardBg = useColorModeValue('white', '#1E293B');
  const borderColor = useColorModeValue('gray.200', '#334155');
  const pageBg = useColorModeValue('gray.50', '#0F172A');
  const headerBg = useColorModeValue('#EFF6FF', '#162032');
  const meaningBg = useColorModeValue('gray.50', '#334155');

  const currentWord = words[currentWordIndex];
  const progress = words.length ? ((currentWordIndex + 1) / words.length) * 100 : 0;

  const sourceDescription = useMemo(() => {
    if (!batch?.sourceList) {
      return '固定链中的来源词树已经没有待引入的新词了。';
    }

    return `当前来源：${batch.sourceList.name}。只要这一层还有新词，系统就不会切到更新一级。`;
  }, [batch]);

  const loadDiscoveryWords = async () => {
    setLoading(true);

    try {
      const response = await apiService.getDiscoveryWords(15);
      setBatch(response);
      setWords(response.words);
      setCurrentWordIndex(0);
    } catch (error) {
      console.error('Failed to load discovery words:', error);
      toast({
        title: '加载新词失败',
        description: resolveApiErrorMessage(error, '暂时无法读取固定链新词。'),
        status: 'error',
        duration: 4000,
        isClosable: true
      });
      navigate('/learn-new-words');
    } finally {
      setLoading(false);
    }
  };

  const loadDisciplineStatus = async () => {
    try {
      const status = await apiService.getDisciplineStatus();
      setDailyLimit(status.dailyNewWordLimit);
      setRemainingQuota(Math.max(0, status.dailyNewWordLimit - status.newWordsAddedToday));
    } catch (error) {
      console.error('Failed to load discipline status:', error);
    }
  };

  useEffect(() => {
    void Promise.all([loadDiscoveryWords(), loadDisciplineStatus()]);
  }, []);

  const moveToNextWord = async () => {
    if (currentWordIndex < words.length - 1) {
      setCurrentWordIndex((previous) => previous + 1);
      return;
    }

    await loadDiscoveryWords();
  };

  const handleAssessment = async (assessment: DiscoveryAssessment) => {
    if (!currentWord) {
      return;
    }

    setSubmittingAssessment(assessment);

    try {
      const response = await apiService.rateDiscoveryWord(
        currentWord.id,
        currentWord.sourceListId,
        assessment
      );

      setDailyLimit(response.disciplineStatus.dailyNewWordLimit);
      setRemainingQuota(
        Math.max(0, response.disciplineStatus.dailyNewWordLimit - response.disciplineStatus.newWordsAddedToday)
      );

      await moveToNextWord();
    } catch (error) {
      console.error('Failed to rate discovery word:', error);
      const message = resolveApiErrorMessage(error, '新词评分提交失败。');
      const translatedMessage = message === 'Daily new-word quota reached'
        ? '今日新词额度已用完。非常熟练不占额度，但其余三档今天不能再继续引入。'
        : message;

      toast({
        title: '评分失败',
        description: translatedMessage,
        status: 'error',
        duration: 4000,
        isClosable: true
      });

      if (message === 'Daily new-word quota reached') {
        await loadDisciplineStatus();
      }
    } finally {
      setSubmittingAssessment(null);
    }
  };

  if (loading) {
    return (
      <Container maxW="container.lg" py={8}>
        <Flex minH="60vh" align="center" justify="center">
          <VStack spacing={4}>
            <Spinner size="xl" color="blue.500" />
            <Text>正在读取固定链新词…</Text>
          </VStack>
        </Flex>
      </Container>
    );
  }

  if (!batch) {
    return null;
  }

  if (!currentWord) {
    return (
      <Box minH="100vh" bg={pageBg}>
        <Container maxW="container.lg" py={8} px={{ base: 4, md: 8 }}>
          <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="lg">
            <CardBody>
              <VStack spacing={5} py={8}>
                <Heading size="lg" color="green.400">
                  当前固定链已无新词
                </Heading>
                <Text color="gray.300" textAlign="center" maxW="2xl">
                  {sourceDescription}
                </Text>
                <Button colorScheme="blue" onClick={() => void loadDiscoveryWords()}>
                  再检查一次
                </Button>
              </VStack>
            </CardBody>
          </Card>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg={pageBg}>
      <Container maxW="container.lg" py={8} px={{ base: 4, md: 8 }}>
        <VStack spacing={6} align="stretch">
          <Flex justify="space-between" align={{ base: 'stretch', md: 'center' }} direction={{ base: 'column', md: 'row' }} gap={4}>
            <Button
              leftIcon={<FaArrowLeft />}
              variant="ghost"
              onClick={() => navigate('/learn-new-words')}
              size="lg"
              alignSelf={{ base: 'flex-start', md: 'center' }}
            >
              返回说明页
            </Button>

            <VStack spacing={2} align={{ base: 'start', md: 'center' }} flex={1}>
              <Heading size="md" color="blue.400">
                评分式学新词
              </Heading>
              <Text color="gray.400" fontSize="sm">
                {sourceDescription}
              </Text>
              <Progress value={progress} colorScheme="blue" size="lg" width={{ base: '100%', md: '320px' }} borderRadius="full" />
              <Text fontSize="sm" color="gray.500">
                当前批次 {currentWordIndex + 1} / {words.length}
              </Text>
            </VStack>

            <Badge colorScheme="blue" variant="solid" alignSelf={{ base: 'flex-start', md: 'center' }}>
              今日新词剩余 {remainingQuota}/{dailyLimit}
            </Badge>
          </Flex>

          <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="lg">
            <CardHeader bg={headerBg} borderTopRadius="xl">
              <VStack spacing={2} align="start">
                <Text fontSize="sm" color="gray.500">
                  来源词树
                </Text>
                <Badge colorScheme="orange" variant="solid">
                  {currentWord.sourceListName}
                </Badge>
              </VStack>
            </CardHeader>

            <CardBody>
              <VStack spacing={8} align="stretch">
                <VStack spacing={4} py={4}>
                  <Text fontSize={{ base: '3xl', md: '5xl' }} fontWeight="bold" color="blue.500" textAlign="center">
                    {currentWord.word}
                  </Text>
                  <Box w="100%" p={5} bg={meaningBg} borderRadius="xl">
                    <Text fontSize={{ base: 'lg', md: 'xl' }} color="gray.100" textAlign="center">
                      {currentWord.meaning}
                    </Text>
                  </Box>
                </VStack>

                <VStack spacing={3} align="stretch">
                  {assessmentButtons.map(({ assessment, label, description, colorScheme, icon: Icon }) => (
                    <Button
                      key={assessment}
                      leftIcon={<Icon />}
                      colorScheme={colorScheme}
                      variant={assessment === 'mastered' ? 'solid' : 'outline'}
                      size="lg"
                      justifyContent="space-between"
                      px={5}
                      py={7}
                      isLoading={submittingAssessment === assessment}
                      loadingText="提交中…"
                      onClick={() => void handleAssessment(assessment)}
                    >
                      <Box textAlign="left" w="100%">
                        <Text fontWeight="bold">{label}</Text>
                        <Text fontSize="sm" opacity={0.85} whiteSpace="normal">
                          {description}
                        </Text>
                      </Box>
                    </Button>
                  ))}
                </VStack>
              </VStack>
            </CardBody>
          </Card>
        </VStack>
      </Container>
    </Box>
  );
};
