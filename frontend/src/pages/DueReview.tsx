import {
  Box,
  Button,
  Center,
  Container,
  Heading,
  HStack,
  Spinner,
  Text,
  VStack,
  Badge,
  SimpleGrid,
  useToast
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { FaBookOpen, FaClock, FaListUl, FaSitemap } from 'react-icons/fa';
import { apiService } from '../services/api';
import { WordList } from '../types';
import { detectUiLocale } from '../i18n/ui';

const formatRetentionScore = (score?: number) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return '--';
  }

  return `${Math.round(score)}%`;
};

const formatUpdatedAt = (value?: string, locale?: string) => {
  if (!value) {
    return '--';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
};

export const DueReview = () => {
  const isZh = detectUiLocale() === 'zh-CN';
  const locale = isZh ? 'zh-CN' : 'en-US';
  const toast = useToast();
  const [list, setList] = useState<WordList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchDueReview = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const response = await apiService.getDueReview();
        if (!isMounted) {
          return;
        }
        setList(response);
      } catch (error) {
        console.error('Failed to load due review list:', error);
        const message = isZh ? '待复习入口暂时无法加载，请稍后重试。' : 'Unable to load due review right now. Please try again later.';
        if (!isMounted) {
          return;
        }
        setErrorMessage(message);
        toast({
          title: isZh ? '加载待复习失败' : 'Failed to load due review',
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

    fetchDueReview();

    return () => {
      isMounted = false;
    };
  }, [isZh, toast]);

  const dueCount = list?.dueCount ?? 0;
  const sourceListCount = list?.sourceListCount ?? 0;
  const wordCount = list?.wordCount ?? 0;

  return (
    <Container
      maxW="container.lg"
      py={{ base: 6, md: 10 }}
      px={{ base: 4, md: 6 }}
      data-testid="due-review-page"
    >
      <VStack spacing={6} align="stretch" position="relative" zIndex={1}>
        <Box
          position="relative"
          overflow="hidden"
          borderRadius="3xl"
          borderWidth="1px"
          borderColor="orange.200"
          bg="rgba(15, 23, 42, 0.92)"
          boxShadow="0 24px 60px rgba(15, 23, 42, 0.38)"
          px={{ base: 5, md: 8 }}
          py={{ base: 6, md: 8 }}
        >
          <Box
            position="absolute"
            top="-80px"
            right="-60px"
            w="240px"
            h="240px"
            borderRadius="full"
            bg="radial-gradient(circle, rgba(251, 191, 36, 0.28), rgba(251, 191, 36, 0))"
            pointerEvents="none"
          />

          <VStack align="stretch" spacing={6} position="relative" zIndex={1}>
            <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
              <VStack align="flex-start" spacing={3}>
                <Badge
                  px={3}
                  py={1}
                  borderRadius="full"
                  colorScheme="orange"
                  variant="solid"
                  display="inline-flex"
                  alignItems="center"
                  gap={2}
                >
                  <FaClock />
                  <Text>{isZh ? '待复习入口' : 'Due Review Hub'}</Text>
                </Badge>
                <Box>
                  <Heading color="white" size="2xl" lineHeight="1.1">
                    {isZh ? '今天该复习的单词都集中在这里' : 'Everything due today is gathered here'}
                  </Heading>
                  <Text mt={3} color="gray.300" fontSize={{ base: 'md', md: 'lg' }} maxW="2xl">
                    {isZh
                      ? '系统会聚合所有计划复习日期早于今天的单词，并沿用学习模式原本的复习与回写逻辑。你在这里答对或答错，都会同步更新到它们原本所属的词树。'
                      : 'Words whose scheduled review date is earlier than today are aggregated here and still use the original learning pipeline.'}
                  </Text>
                </Box>
              </VStack>

              {list && (
                <Box
                  minW={{ base: 'full', md: '220px' }}
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor="whiteAlpha.200"
                  bg="whiteAlpha.90"
                  color="gray.900"
                  px={5}
                  py={4}
                >
                  <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.14em" color="gray.500">
                    {isZh ? '系统清单' : 'System list'}
                  </Text>
                  <Text mt={2} fontSize="xl" fontWeight="bold">
                    {list.name}
                  </Text>
                  <Text mt={1} fontSize="sm" color="gray.600">
                    {isZh ? `最近更新：${formatUpdatedAt(list.updated_at, locale)}` : `Updated: ${formatUpdatedAt(list.updated_at, locale)}`}
                  </Text>
                </Box>
              )}
            </HStack>

            {isLoading ? (
              <Center minH="260px">
                <VStack spacing={4}>
                  <Spinner size="xl" thickness="4px" color="orange.300" />
                  <Text color="gray.300">{isZh ? '正在汇总待复习单词…' : 'Collecting due review words...'}</Text>
                </VStack>
              </Center>
            ) : errorMessage ? (
              <Box
                data-testid="due-review-error"
                borderRadius="2xl"
                borderWidth="1px"
                borderColor="red.300"
                bg="rgba(127, 29, 29, 0.35)"
                px={5}
                py={5}
              >
                <Text color="white" fontWeight="bold" fontSize="lg">
                  {isZh ? '待复习页面加载失败' : 'Due review failed to load'}
                </Text>
                <Text mt={2} color="red.100">
                  {errorMessage}
                </Text>
                <Button
                  mt={4}
                  colorScheme="orange"
                  variant="solid"
                  onClick={() => window.location.reload()}
                >
                  {isZh ? '重新加载' : 'Reload'}
                </Button>
              </Box>
            ) : (
              <>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <Box borderRadius="2xl" bg="whiteAlpha.120" borderWidth="1px" borderColor="whiteAlpha.200" px={5} py={5}>
                    <Text fontSize="sm" color="orange.100">{isZh ? '今日应复习' : 'Due now'}</Text>
                    <Text mt={2} fontSize="4xl" lineHeight="1" fontWeight="bold" color="white">
                      {dueCount}
                    </Text>
                    <Text mt={2} color="gray.300">
                      {isZh ? '计划日期早于今天的单词数量' : 'Words scheduled before today'}
                    </Text>
                  </Box>

                  <Box borderRadius="2xl" bg="whiteAlpha.120" borderWidth="1px" borderColor="whiteAlpha.200" px={5} py={5}>
                    <Text fontSize="sm" color="orange.100">{isZh ? '来源词树' : 'Source trees'}</Text>
                    <Text mt={2} fontSize="4xl" lineHeight="1" fontWeight="bold" color="white">
                      {sourceListCount}
                    </Text>
                    <Text mt={2} color="gray.300">
                      {isZh ? '这些待复习内容来自的原始词树数量' : 'Original trees contributing review items'}
                    </Text>
                  </Box>

                  <Box borderRadius="2xl" bg="whiteAlpha.120" borderWidth="1px" borderColor="whiteAlpha.200" px={5} py={5}>
                    <Text fontSize="sm" color="orange.100">{isZh ? '当前保留率' : 'Retention score'}</Text>
                    <Text mt={2} fontSize="4xl" lineHeight="1" fontWeight="bold" color="white">
                      {formatRetentionScore(list?.retentionScore)}
                    </Text>
                    <Text mt={2} color="gray.300">
                      {isZh ? `系统清单总词数 ${wordCount}` : `Total words in this system list: ${wordCount}`}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Box
                  borderRadius="2xl"
                  borderWidth="1px"
                  borderColor={dueCount > 0 ? 'orange.200' : 'whiteAlpha.200'}
                  bg={dueCount > 0 ? 'rgba(154, 52, 18, 0.24)' : 'whiteAlpha.090'}
                  px={{ base: 5, md: 6 }}
                  py={{ base: 5, md: 6 }}
                >
                  <Text color="white" fontWeight="bold" fontSize="xl">
                    {dueCount > 0
                      ? (isZh ? '可以开始复习了' : 'Ready to review')
                      : (isZh ? '当前没有到期内容' : 'Nothing is due right now')}
                  </Text>
                  <Text mt={2} color="gray.200" maxW="3xl">
                    {dueCount > 0
                      ? (isZh
                        ? '点击开始复习后，会直接进入学习模式。复习记录会按来源词树分别回写，不会变成一份孤立的数据。'
                        : 'Starting review sends you into the shared learning flow and writes results back to each source tree.')
                      : (isZh
                        ? '系统已经把到今天为止需要复习的内容清空了。你仍然可以查看完整清单，确认它来自哪些词树。'
                        : 'Everything due up to today has been cleared. You can still inspect the system list for details.')}
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
                        {isZh ? '开始复习' : 'Start review'}
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
                        {isZh ? '查看清单' : 'View list'}
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
                      {isZh ? '返回词树' : 'Back to trees'}
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
