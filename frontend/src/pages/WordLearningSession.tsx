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
  useToast
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheck, FaHourglassHalf, FaSeedling, FaSnowflake } from 'react-icons/fa';
import { useBackgrounds } from '../components/BackgroundProvider';
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

const buildAlpha = (value: number) => (value / 100).toFixed(2);

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
  const { cardOpacity } = useBackgrounds();

  const [loading, setLoading] = useState(true);
  const [submittingAssessment, setSubmittingAssessment] = useState<DiscoveryAssessment | null>(null);
  const [batch, setBatch] = useState<DiscoveryWordsResponse | null>(null);
  const [words, setWords] = useState<DiscoveryWord[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(15);
  const [remainingQuota, setRemainingQuota] = useState(15);

  const cardBg = `rgba(15, 23, 42, ${buildAlpha(cardOpacity)})`;
  const headerBg = `rgba(15, 23, 42, ${buildAlpha(Math.min(cardOpacity + 8, 100))})`;
  const sourceBg = `rgba(15, 23, 42, ${buildAlpha(Math.max(cardOpacity - 10, 24))})`;
  const meaningBg = `rgba(51, 65, 85, ${buildAlpha(Math.max(cardOpacity - 18, 28))})`;
  const borderColor = `rgba(148, 163, 184, ${Math.min(cardOpacity / 180, 0.45).toFixed(2)})`;

  const currentWord = words[currentWordIndex];
  const progress = words.length ? ((currentWordIndex + 1) / words.length) * 100 : 0;

  const sourceDescription = useMemo(() => {
    if (!batch?.sourceList) {
      return '固定链里的来源词树暂时没有可安排的新词了。';
    }

    return `当前来源：${batch.sourceList.name}。只要这一层还有新词，系统就不会切换到更新一级。`;
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
      <Box minH="100vh" bg="transparent">
        <Container maxW="container.lg" py={8}>
          <Flex minH="60vh" align="center" justify="center">
            <VStack spacing={4}>
              <Spinner size="xl" color="blue.300" />
              <Text color="whiteAlpha.900">正在读取固定链新词…</Text>
            </VStack>
          </Flex>
        </Container>
      </Box>
    );
  }

  if (!batch) {
    return null;
  }

  if (!currentWord) {
    return (
      <Box minH="100vh" bg="transparent">
        <Container maxW="container.lg" py={8} px={{ base: 4, md: 8 }}>
          <Card
            bg={cardBg}
            borderColor={borderColor}
            borderWidth="1px"
            borderRadius="2xl"
            shadow="2xl"
            backdropFilter="blur(18px)"
          >
            <CardBody>
              <VStack spacing={5} py={8}>
                <Heading size="lg" color="green.300">
                  当前固定链已无新词
                </Heading>
                <Text color="whiteAlpha.800" textAlign="center" maxW="2xl">
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
    <Box minH="100vh" bg="transparent">
      <Container maxW="container.lg" py={8} px={{ base: 4, md: 8 }}>
        <VStack spacing={6} align="stretch">
          <Flex
            justify="space-between"
            align={{ base: 'stretch', md: 'center' }}
            direction={{ base: 'column', md: 'row' }}
            gap={4}
          >
            <Button
              leftIcon={<FaArrowLeft />}
              variant="ghost"
              color="whiteAlpha.900"
              _hover={{ bg: 'whiteAlpha.200' }}
              onClick={() => navigate('/learn-new-words')}
              size="lg"
              alignSelf={{ base: 'flex-start', md: 'center' }}
            >
              返回说明页
            </Button>

            <VStack spacing={2} align={{ base: 'start', md: 'center' }} flex={1}>
              <Heading size="md" color="blue.200">
                评分式学新词
              </Heading>
              <Text color="whiteAlpha.700" fontSize="sm" textAlign={{ base: 'left', md: 'center' }}>
                {sourceDescription}
              </Text>
              <Progress
                value={progress}
                colorScheme="blue"
                size="lg"
                width={{ base: '100%', md: '320px' }}
                borderRadius="full"
                bg="whiteAlpha.200"
              />
              <Text fontSize="sm" color="whiteAlpha.600">
                当前批次 {currentWordIndex + 1} / {words.length}
              </Text>
            </VStack>

            <Badge
              bg="whiteAlpha.200"
              color="whiteAlpha.900"
              borderRadius="full"
              px={3}
              py={1.5}
              alignSelf={{ base: 'flex-start', md: 'center' }}
            >
              今日新词剩余 {remainingQuota}/{dailyLimit}
            </Badge>
          </Flex>

          <Card
            bg={cardBg}
            borderColor={borderColor}
            borderWidth="1px"
            borderRadius="2xl"
            shadow="2xl"
            backdropFilter="blur(20px)"
          >
            <CardHeader bg={headerBg} borderTopRadius="2xl">
              <VStack spacing={3} align="stretch">
                <Box p={4} bg={sourceBg} borderRadius="xl">
                  <Text fontSize="sm" color="whiteAlpha.700" mb={2}>
                    来源词树
                  </Text>
                  <Badge colorScheme="orange" variant="solid">
                    {currentWord.sourceListName}
                  </Badge>
                </Box>
              </VStack>
            </CardHeader>

            <CardBody>
              <VStack spacing={8} align="stretch">
                <VStack spacing={5} py={4}>
                  <Text
                    fontSize={{ base: '3xl', md: '5xl' }}
                    fontWeight="bold"
                    color="blue.300"
                    textAlign="center"
                    letterSpacing="0.02em"
                  >
                    {currentWord.word}
                  </Text>
                  <Box
                    w="100%"
                    p={5}
                    bg={meaningBg}
                    borderRadius="xl"
                    borderWidth="1px"
                    borderColor="whiteAlpha.100"
                    backdropFilter="blur(14px)"
                  >
                    <Text
                      fontSize={{ base: 'lg', md: 'xl' }}
                      color="whiteAlpha.950"
                      textAlign="center"
                    >
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
                      backdropFilter="blur(10px)"
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
