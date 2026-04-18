import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Container,
  Divider,
  Flex,
  Heading,
  HStack,
  Progress,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
  useToast
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheck, FaPlus, FaRedo, FaTimes } from 'react-icons/fa';
import { apiService } from '../services/api';
import { DiscoveryWord, DiscoveryWordsResponse, WordDetailsResponse } from '../types';
import PronunciationButton from '../components/PronunciationButton';

const buildFallbackDetails = (word: DiscoveryWord): WordDetailsResponse => ({
  word: word.word,
  meaning: word.meaning,
  example: '',
  difficulty_level: word.difficulty_level,
  context: word.sourceContext || word.context
});

const resolveApiErrorMessage = (error: unknown, fallback: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object'
  ) {
    const response = (error as { response?: { data?: { message?: string; error?: string } } }).response;
    return response?.data?.message || response?.data?.error || fallback;
  }

  return fallback;
};

export const WordLearningSession: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadingWordDetails, setLoadingWordDetails] = useState(false);
  const [processingKnownWord, setProcessingKnownWord] = useState(false);
  const [addingToTarget, setAddingToTarget] = useState(false);
  const [batch, setBatch] = useState<DiscoveryWordsResponse | null>(null);
  const [vocabularyWords, setVocabularyWords] = useState<DiscoveryWord[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [showWordDetails, setShowWordDetails] = useState(false);
  const [currentWordDetails, setCurrentWordDetails] = useState<WordDetailsResponse | null>(null);
  const [wordsLearned, setWordsLearned] = useState(0);
  const [wordsKnown, setWordsKnown] = useState(0);

  const cardBg = useColorModeValue('white', '#1E293B');
  const borderColor = useColorModeValue('gray.200', '#334155');
  const pageBg = useColorModeValue('gray.50', '#0F172A');
  const accentBg = useColorModeValue('#EFF6FF', '#162032');
  const definitionBg = useColorModeValue('gray.50', '#334155');
  const exampleBg = useColorModeValue('green.50', '#1E293B');

  const currentWord = vocabularyWords[currentWordIndex];
  const progress = vocabularyWords.length
    ? ((currentWordIndex + 1) / vocabularyWords.length) * 100
    : 0;

  const currentSourceDescription = useMemo(() => {
    if (!batch?.sourceList) {
      return '固定链中的来源词树都已经没有未纳入私教词树的新词了。';
    }

    const source = batch.sourceList;
    return `当前来源：${source.name}。本层还有 ${source.remainingCount} 个候选词，只有这一层清空后才会上移到下一层。`;
  }, [batch]);

  const loadDiscoveryWords = async () => {
    setLoading(true);

    try {
      const response = await apiService.getDiscoveryWords(15);
      setBatch(response);
      setVocabularyWords(response.words);
      setCurrentWordIndex(0);
      setShowWordDetails(false);
      setCurrentWordDetails(null);
    } catch (error) {
      console.error('Failed to load fixed discovery words:', error);
      toast({
        title: '加载固定链新词失败',
        description: resolveApiErrorMessage(error, '暂时无法读取固定链词树，请稍后再试。'),
        status: 'error',
        duration: 4000,
        isClosable: true
      });
      navigate('/learn-new-words');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDiscoveryWords();
  }, []);

  const moveToNextWord = async () => {
    if (currentWordIndex < vocabularyWords.length - 1) {
      setCurrentWordIndex((previous) => previous + 1);
      setShowWordDetails(false);
      setCurrentWordDetails(null);
      return;
    }

    await loadDiscoveryWords();
  };

  const handleKnowWord = async () => {
    if (!currentWord || !batch?.targetList) {
      return;
    }

    setProcessingKnownWord(true);

    try {
      await apiService.addWord(batch.targetList.id, currentWord.word, currentWord.meaning);
      setWordsKnown((previous) => previous + 1);
      await moveToNextWord();
    } catch (error) {
      console.error('Failed to add known word to private list:', error);
      toast({
        title: '纳入私教词树失败',
        description: resolveApiErrorMessage(error, '该词未能写入私教学习词树。'),
        status: 'error',
        duration: 4000,
        isClosable: true
      });
    } finally {
      setProcessingKnownWord(false);
    }
  };

  const handleDontKnowWord = async () => {
    if (!currentWord) {
      return;
    }

    setLoadingWordDetails(true);
    setShowWordDetails(true);

    try {
      const details = await apiService.getVocabularyWordDetails(
        currentWord.word,
        currentWord.sourceContext || currentWord.context
      );
      setCurrentWordDetails(details);
    } catch (error) {
      console.error('Failed to load discovery word details:', error);
      setCurrentWordDetails(buildFallbackDetails(currentWord));
      toast({
        title: '词条详情回退到来源释义',
        description: '示例句暂时没有生成出来，已先展示来源词树中的释义。',
        status: 'warning',
        duration: 3500,
        isClosable: true
      });
    } finally {
      setLoadingWordDetails(false);
    }
  };

  const handleAddToTargetList = async () => {
    if (!currentWord || !batch?.targetList) {
      return;
    }

    setAddingToTarget(true);

    try {
      await apiService.addWord(batch.targetList.id, currentWord.word, currentWord.meaning);
      setWordsLearned((previous) => previous + 1);
      toast({
        title: '已纳入私教词树',
        description: `“${currentWord.word}” 已加入 ${batch.targetList.name}。`,
        status: 'success',
        duration: 2500,
        isClosable: true
      });
      await moveToNextWord();
    } catch (error) {
      console.error('Failed to add discovery word to private list:', error);
      toast({
        title: '加入私教词树失败',
        description: resolveApiErrorMessage(error, '该词未能写入目标词树。'),
        status: 'error',
        duration: 4000,
        isClosable: true
      });
    } finally {
      setAddingToTarget(false);
    }
  };

  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
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
                  固定链已到顶端
                </Heading>
                <Text color="gray.300" textAlign="center" maxW="2xl">
                  {currentSourceDescription}
                </Text>
                <Text color="gray.400">
                  目标词树：{batch.targetList.name}
                </Text>
                <HStack spacing={3}>
                  <Button leftIcon={<FaRedo />} colorScheme="blue" onClick={() => void loadDiscoveryWords()}>
                    再检查一次旧来源
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/learn-new-words')}>
                    返回说明页
                  </Button>
                </HStack>
              </VStack>
            </CardBody>
          </Card>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg={pageBg}>
      <Container maxW="container.xl" py={8} px={{ base: 4, md: 8 }}>
        <VStack spacing={6} align="stretch">
          <Flex justify="space-between" align={{ base: 'stretch', lg: 'center' }} direction={{ base: 'column', lg: 'row' }} gap={4}>
            <Button
              leftIcon={<FaArrowLeft />}
              variant="ghost"
              onClick={() => navigate('/learn-new-words')}
              size="lg"
              alignSelf={{ base: 'flex-start', lg: 'center' }}
            >
              返回固定链说明
            </Button>

            <VStack spacing={2} align={{ base: 'start', lg: 'center' }} flex={1}>
              <Heading size="md" color="blue.400">
                固定链学习
              </Heading>
              <Text color="gray.300">
                目标词树：{batch.targetList.name}
              </Text>
              <Text color="gray.400" fontSize="sm">
                {currentSourceDescription}
              </Text>
              <Progress value={progress} colorScheme="blue" size="lg" width={{ base: '100%', lg: '360px' }} borderRadius="full" />
              <Text fontSize="sm" color="gray.500">
                当前批次 {currentWordIndex + 1} / {vocabularyWords.length}
              </Text>
            </VStack>

            <VStack align={{ base: 'start', lg: 'end' }} spacing={1}>
              <Badge colorScheme="green" fontSize="sm">我认识 {wordsKnown}</Badge>
              <Badge colorScheme="blue" fontSize="sm">已纳入 {wordsLearned}</Badge>
            </VStack>
          </Flex>

          <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="lg">
            <CardHeader bg={accentBg} borderTopRadius="xl">
              <Flex justify="space-between" align="center" gap={4} wrap="wrap">
                <VStack align="start" spacing={1}>
                  <Text fontSize="sm" color="gray.500">
                    来源词树
                  </Text>
                  <Badge colorScheme="orange" variant="solid">
                    {currentWord.sourceListName}
                  </Badge>
                </VStack>
                <Badge
                  colorScheme={
                    currentWord.difficulty_level === 'basic'
                      ? 'green'
                      : currentWord.difficulty_level === 'intermediate'
                        ? 'orange'
                        : 'red'
                  }
                  variant="solid"
                >
                  {currentWord.difficulty_level === 'basic'
                    ? '基础'
                    : currentWord.difficulty_level === 'intermediate'
                      ? '进阶'
                      : '高阶'}
                </Badge>
              </Flex>
            </CardHeader>

            <CardBody>
              <VStack spacing={6} align="stretch">
                <Box textAlign="center" py={8}>
                  <VStack spacing={4}>
                    <HStack spacing={4} justify="center">
                      <Text fontSize={{ base: '3xl', md: '4xl' }} fontWeight="bold" color="blue.500">
                        {currentWord.word}
                      </Text>
                      <PronunciationButton
                        text={currentWord.word}
                        type="word"
                        language="es"
                        size="lg"
                        colorScheme="blue"
                        tooltipText="播放单词发音"
                      />
                    </HStack>

                    <Text color="gray.400">
                      {currentWord.sourceContext || currentWord.context}
                    </Text>

                    <Text fontSize="lg" color="gray.400" pt={2}>
                      这个词你已经认识了吗？
                    </Text>
                  </VStack>

                  <HStack spacing={6} justify="center" pt={8} flexWrap="wrap">
                    <Button
                      leftIcon={<FaCheck />}
                      colorScheme="green"
                      size="lg"
                      onClick={() => void handleKnowWord()}
                      isLoading={processingKnownWord}
                      loadingText="纳入中…"
                      borderRadius="xl"
                      px={10}
                    >
                      我认识，直接纳入
                    </Button>
                    <Button
                      leftIcon={<FaTimes />}
                      colorScheme="orange"
                      size="lg"
                      onClick={() => void handleDontKnowWord()}
                      isLoading={loadingWordDetails}
                      loadingText="加载详情…"
                      borderRadius="xl"
                      px={10}
                    >
                      我不认识，先看详情
                    </Button>
                  </HStack>
                </Box>

                {showWordDetails && currentWordDetails && (
                  <Box>
                    <Divider mb={6} />

                    <VStack spacing={6} align="stretch">
                      <Box>
                        <Text fontSize="xl" fontWeight="bold" color="blue.400" mb={3}>
                          释义
                        </Text>
                        <Box p={4} bg={definitionBg} borderRadius="lg">
                          <Text fontSize="lg">{currentWordDetails.meaning}</Text>
                        </Box>
                      </Box>

                      <Box>
                        <HStack justify="space-between" align="center" mb={3}>
                          <Text fontSize="xl" fontWeight="bold" color="green.400">
                            示例句
                          </Text>
                          <PronunciationButton
                            text={currentWordDetails.example}
                            type="sentence"
                            language="es"
                            size="sm"
                            colorScheme="green"
                            variant="outline"
                            tooltipText="播放示例句发音"
                            disabled={!currentWordDetails.example}
                          />
                        </HStack>
                        <Box p={4} bg={exampleBg} borderRadius="lg">
                          <Text fontSize="lg" fontStyle={currentWordDetails.example ? 'italic' : 'normal'}>
                            {currentWordDetails.example || '这次没有拿到可用示例句，已先保留来源释义。'}
                          </Text>
                        </Box>
                      </Box>

                      <HStack spacing={4} justify="center" pt={4} flexWrap="wrap">
                        <Button
                          leftIcon={<FaPlus />}
                          colorScheme="blue"
                          size="lg"
                          onClick={() => void handleAddToTargetList()}
                          isLoading={addingToTarget}
                          loadingText="加入中…"
                          borderRadius="lg"
                        >
                          加入 {batch.targetList.name}
                        </Button>
                        <Button
                          variant="outline"
                          colorScheme="gray"
                          size="lg"
                          onClick={() => void moveToNextWord()}
                          borderRadius="lg"
                        >
                          暂时跳过
                        </Button>
                      </HStack>
                    </VStack>
                  </Box>
                )}
              </VStack>
            </CardBody>
          </Card>
        </VStack>
      </Container>
    </Box>
  );
};
