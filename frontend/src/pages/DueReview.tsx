import {
  Badge,
  Box,
  Button,
  Center,
  Container,
  Heading,
  HStack,
  SimpleGrid,
  Spinner,
  Text,
  VStack,
  useToast
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { FaBookOpen, FaClock, FaListUl, FaSitemap } from 'react-icons/fa';
import { useBackgrounds } from '../components/BackgroundProvider';
import { apiService } from '../services/api';
import { DisciplineStatus, WordList } from '../types';
import { discoveryQuotaAssessments, discoveryQuotaLabels } from '../utils/discipline';

const formatDateTime = (value?: string) => {
  if (!value) {
    return '--';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
};

const getDisciplineLabel = (status?: DisciplineStatus | null) => {
  if (!status) {
    return '纪律状态加载中';
  }

  switch (status.entryState) {
    case 'hard_locked':
      return '今天禁止新增';
    case 'soft_locked':
      return '先复习后拓词';
    case 'quota_reached':
      return '今日新词额度已满';
    default:
      return '今天可按纪律拓词';
  }
};

export const DueReview = () => {
  const toast = useToast();
  const { cardOpacity } = useBackgrounds();
  const [list, setList] = useState<WordList | null>(null);
  const [disciplineStatus, setDisciplineStatus] = useState<DisciplineStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const [nextList, nextStatus] = await Promise.all([
          apiService.getDueReview(),
          apiService.getDisciplineStatus()
        ]);

        if (!isMounted) {
          return;
        }

        setList(nextList);
        setDisciplineStatus(nextStatus);
      } catch (error) {
        console.error('Failed to load due review hub:', error);
        if (!isMounted) {
          return;
        }

        const message = '待复习入口暂时无法加载，请稍后重试。';
        setErrorMessage(message);
        toast({
          title: '加载待复习失败',
          description: message,
          status: 'error',
          duration: 4000,
          isClosable: true
        });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [toast]);

  const dueCount = list?.dueCount ?? 0;
  const sourceListCount = list?.sourceListCount ?? 0;
  const retentionScore = list?.retentionScore ?? 0;
  const mainCardBg = `rgba(15, 23, 42, ${(cardOpacity / 100).toFixed(2)})`;
  const sectionCardBg = `rgba(255, 255, 255, ${(Math.max(cardOpacity - 74, 6) / 100).toFixed(2)})`;
  const systemInfoBg = `rgba(255, 255, 255, ${(Math.max(cardOpacity - 80, 4) / 100).toFixed(2)})`;
  const actionCardBg = dueCount > 0
    ? `rgba(154, 52, 18, ${(Math.max(cardOpacity - 66, 10) / 100).toFixed(2)})`
    : sectionCardBg;

  return (
    <Container maxW="container.lg" py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }} data-testid="due-review-page">
      <VStack spacing={6} align="stretch">
        <Box
          borderRadius="3xl"
          borderWidth="1px"
          borderColor="orange.200"
          bg={mainCardBg}
          boxShadow="0 24px 60px rgba(15, 23, 42, 0.38)"
          px={{ base: 5, md: 8 }}
          py={{ base: 6, md: 8 }}
        >
          <VStack align="stretch" spacing={6}>
            <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }}>
              <VStack align="flex-start" spacing={3}>
                <Badge px={3} py={1} borderRadius="full" colorScheme="orange" variant="solid">
                  <HStack spacing={2}>
                    <FaClock />
                    <Text>待复习主入口</Text>
                  </HStack>
                </Badge>
                <Box>
                  <Heading color="white" size="xl" lineHeight="1.15">
                    今天该复习的内容，都在这里先清掉
                  </Heading>
                  <Text mt={3} color="gray.300" fontSize={{ base: 'md', md: 'lg' }} maxW="2xl" lineHeight="1.8">
                    这里聚合了所有已经进入复习流、且复习日期不晚于今天的单词。你在这里的作答结果会继续回写到原始词树，不再拆出独立错题本。
                  </Text>
                </Box>
              </VStack>

              {list && (
                <Box
                  minW={{ base: 'full', md: '240px' }}
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor="whiteAlpha.200"
                  bg={systemInfoBg}
                  color="white"
                  px={5}
                  py={4}
                >
                  <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.14em" color="whiteAlpha.700">
                    系统清单
                  </Text>
                  <Text mt={2} fontSize="xl" fontWeight="bold">
                    {list.name}
                  </Text>
                  <Text mt={1} fontSize="sm" color="whiteAlpha.700">
                    最近更新：{formatDateTime(list.updated_at)}
                  </Text>
                </Box>
              )}
            </HStack>

            {isLoading ? (
              <Center minH="260px">
                <VStack spacing={4}>
                  <Spinner size="xl" thickness="4px" color="orange.300" />
                  <Text color="gray.300">正在汇总今天的待复习内容…</Text>
                </VStack>
              </Center>
            ) : errorMessage ? (
              <Box borderRadius="2xl" borderWidth="1px" borderColor="red.300" bg="rgba(127, 29, 29, 0.35)" px={5} py={5}>
                <Text color="white" fontWeight="bold" fontSize="lg">
                  待复习页面加载失败
                </Text>
                <Text mt={2} color="red.100">
                  {errorMessage}
                </Text>
                <Button mt={4} colorScheme="orange" onClick={() => window.location.reload()}>
                  重新加载
                </Button>
              </Box>
            ) : (
              <>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <Box borderRadius="2xl" bg={sectionCardBg} borderWidth="1px" borderColor="whiteAlpha.200" px={5} py={5}>
                    <Text fontSize="sm" color="orange.100">今日应复习</Text>
                    <Text mt={2} fontSize="4xl" lineHeight="1" fontWeight="bold" color="white">
                      {dueCount}
                    </Text>
                    <Text mt={2} color="gray.300">
                      所有已经进入复习流、且今天以前到期的词
                    </Text>
                  </Box>

                  <Box borderRadius="2xl" bg={sectionCardBg} borderWidth="1px" borderColor="whiteAlpha.200" px={5} py={5}>
                    <Text fontSize="sm" color="orange.100">来源词树</Text>
                    <Text mt={2} fontSize="4xl" lineHeight="1" fontWeight="bold" color="white">
                      {sourceListCount}
                    </Text>
                    <Text mt={2} color="gray.300">
                      这些待复习内容实际来自多少个原始词树
                    </Text>
                  </Box>

                  <Box borderRadius="2xl" bg={sectionCardBg} borderWidth="1px" borderColor="whiteAlpha.200" px={5} py={5}>
                    <Text fontSize="sm" color="orange.100">当前保持率</Text>
                    <Text mt={2} fontSize="4xl" lineHeight="1" fontWeight="bold" color="white">
                      {retentionScore}%
                    </Text>
                    <Text mt={2} color="gray.300">
                      今日纪律状态：{getDisciplineLabel(disciplineStatus)}
                    </Text>
                  </Box>
                </SimpleGrid>

                {disciplineStatus && (
                  <Box borderRadius="2xl" bg={sectionCardBg} borderWidth="1px" borderColor="whiteAlpha.200" px={5} py={5}>
                    <HStack spacing={3} flexWrap="wrap">
                      <Badge colorScheme={disciplineStatus.entryState === 'open' ? 'green' : 'orange'} variant="solid" px={3} py={1} borderRadius="full">
                        {getDisciplineLabel(disciplineStatus)}
                      </Badge>
                      <Badge colorScheme="purple" variant="subtle" px={3} py={1} borderRadius="full">
                        今日已引入 {disciplineStatus.newWordsAddedToday}/{disciplineStatus.dailyNewWordLimit}
                      </Badge>
                      <Badge colorScheme="yellow" variant="subtle" px={3} py={1} borderRadius="full">
                        总剩余额度 {disciplineStatus.remainingNewWordQuota}
                      </Badge>
                      {discoveryQuotaAssessments.map((assessment) => (
                        <Badge
                          key={assessment}
                          colorScheme={assessment === 'familiar' ? 'teal' : assessment === 'uncertain' ? 'orange' : 'red'}
                          variant="subtle"
                          px={3}
                          py={1}
                          borderRadius="full"
                        >
                          {discoveryQuotaLabels[assessment]} {disciplineStatus.remainingNewWordQuotaByAssessment[assessment]}/
                          {disciplineStatus.dailyNewWordLimits[assessment]}
                        </Badge>
                      ))}
                    </HStack>
                  </Box>
                )}

                <Box
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor={dueCount > 0 ? 'orange.200' : 'whiteAlpha.200'}
                  bg={actionCardBg}
                  px={{ base: 5, md: 6 }}
                  py={{ base: 5, md: 6 }}
                >
                  <Text color="white" fontWeight="bold" fontSize="xl">
                    {dueCount > 0 ? '现在就从 due review 开始' : '当前没有到期内容'}
                  </Text>
                  <Text mt={2} color="gray.200" maxW="3xl" lineHeight="1.8">
                    {dueCount > 0
                      ? '进入后会直接开始纪律化复习。题目提交后会先进入 AI 审核，再在最终通过后写回原始词树。'
                      : '今天到期的复习内容已经清空。你可以回到词树继续浏览，或者在额度允许时再去探索新词。'}
                  </Text>

                  <HStack spacing={3} mt={5} flexWrap="wrap">
                    {list && (
                      <Button
                        data-testid="due-review-start-link"
                        as={RouterLink}
                        to={`/learn/${list.id}`}
                        state={{ list }}
                        colorScheme="orange"
                        leftIcon={<FaBookOpen />}
                        size="lg"
                        isDisabled={dueCount <= 0}
                      >
                        开始复习
                      </Button>
                    )}
                    {list && (
                      <Button
                        data-testid="due-review-list-link"
                        as={RouterLink}
                        to={`/lists/${list.id}`}
                        state={{ list }}
                        variant="outline"
                        borderColor="whiteAlpha.500"
                        color="white"
                        _hover={{ bg: 'whiteAlpha.200' }}
                        leftIcon={<FaListUl />}
                        size="lg"
                      >
                        查看清单
                      </Button>
                    )}
                    <Button
                      as={RouterLink}
                      to="/lists"
                      variant="ghost"
                      color="gray.200"
                      _hover={{ bg: 'whiteAlpha.160', color: 'white' }}
                      leftIcon={<FaSitemap />}
                      size="lg"
                    >
                      返回词树
                    </Button>
                  </HStack>
                </Box>
              </>
            )}
          </VStack>
        </Box>
      </VStack>
    </Container>
  );
};
