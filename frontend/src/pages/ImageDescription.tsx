import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Heading,
  VStack,
  HStack,
  Flex,
  Text,
  Image,
  Textarea,
  Button,
  Input,
  FormControl,
  FormLabel,
  useToast,
  Card,
  CardHeader,
  CardBody,
  Divider,
  Badge,
  Alert,
  AlertIcon,
  useColorModeValue,
  Select,
  Wrap,
  WrapItem,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Checkbox,
  RadioGroup,
  Radio
} from '@chakra-ui/react';
import { FaRandom } from 'react-icons/fa';
import { apiService } from '../services/api';
import { ImageDescriptionAnalysis, WordList } from '../types';
import PronunciationButton from '../components/PronunciationButton';

type ExerciseState = 'setup' | 'describing' | 'results';

export const ImageDescription: React.FC = () => {
  const [state, setState] = useState<ExerciseState>('setup');
  const [context, setContext] = useState('');
  const [sessionContext, setSessionContext] = useState(''); // Track the current session context
  const [image, setImage] = useState<{ url: string; alt: string; id: string } | null>(null);
  const [instructions, setInstructions] = useState('');
  const [userDescription, setUserDescription] = useState('');
  const [analysis, setAnalysis] = useState<ImageDescriptionAnalysis | null>(null);
  const [exerciseId, setExerciseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [createNewList, setCreateNewList] = useState(false);
  const [imageSource, setImageSource] = useState<'ai' | 'stock'>('ai');
  const [generatingContext, setGeneratingContext] = useState(false);
  
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const cardBg = useColorModeValue('white', '#1E293B');
  const borderColor = useColorModeValue('gray.200', '#334155');
  const accentBg = useColorModeValue('#F6FFED', '#1E293B');
  const feedbackBg = useColorModeValue('#F6FFED', '#1E293B');
  const vocabCardBg = useColorModeValue('white', '#1E293B');

  useEffect(() => {
    loadWordLists();
  }, []);

  const loadWordLists = async () => {
    try {
      const lists = await apiService.getLists();
      setWordLists(lists);
      if (lists.length > 0) {
        setSelectedListId(lists[0].id);
      }
    } catch (error) {
      console.error('Failed to load word lists:', error);
    }
  };

  const handleGenerateRandomContext = async () => {
    setGeneratingContext(true);
    try {
      const suggestions = await apiService.getContextSuggestions();
      if (suggestions.suggestions.length > 0) {
        const randomContext = suggestions.suggestions[0];
        setContext(randomContext);
        toast({
          title: '已生成随机场景',
          description: `生成场景：「${randomContext}」`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Failed to generate random context:', error);
      toast({
        title: '出错了',
        description: '生成随机场景失败',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setGeneratingContext(false);
    }
  };

  const startExercise = async (useSessionContext = false) => {
    // Use session context if continuing, otherwise use input context
    const exerciseContext = useSessionContext ? sessionContext : (context.trim() || undefined);

    setLoading(true);
    try {
      const data = await apiService.startDescriptionExercise(exerciseContext, imageSource);
      setImage(data.image);
      setInstructions(data.instructions);
      
      // Set session context if starting new session
      if (!useSessionContext) {
        setSessionContext(data.context);
      }
      
      setState('describing');
      
      toast({
        title: useSessionContext ? '已生成新图片' : (exerciseContext ? '已生成自定义图片' : '已生成随机图片'),
        description: useSessionContext ? `继续当前场景：${sessionContext}` : '请描述你在图片中看到的内容。',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Failed to start exercise:', error);
      toast({
        title: '出错了',
        description: '加载图片失败，请稍后重试。',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const submitDescription = async () => {
    if (!userDescription.trim() || userDescription.trim().length < 10) {
      toast({
        title: '描述过短',
        description: '请至少输入 10 个字符来描述图片。',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!image) return;

    setAnalyzing(true);
    try {
      const data = await apiService.submitDescription({
        context: sessionContext,
        imageUrl: image.url,
        imageAlt: image.alt,
        userDescription: userDescription.trim()
      });
      
      setAnalysis(data.analysis);
      setExerciseId(data.exerciseId);
      setState('results');
      
      toast({
        title: '分析完成',
        description: '请查看你的个性化反馈和词汇推荐。',
        status: 'success',
        duration: 4000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Failed to analyze description:', error);
      toast({
        title: '分析失败',
        description: '分析你的描述失败，请稍后重试。',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const addWordsToList = async () => {
    if (!analysis || selectedWords.length === 0) {
      toast({
        title: '未选择单词',
        description: '请至少选择 1 个单词添加到词树。',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!createNewList && !selectedListId) {
      toast({
        title: '未选择词树',
        description: '请选择一个词树，或勾选创建新词树。',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const wordsToAdd = analysis.recommendations
        .filter(rec => selectedWords.includes(rec.word))
        .map(rec => ({ word: rec.word, meaning: rec.meaning }));

      const data = await apiService.addWordsToList({
        exerciseId,
        listId: createNewList ? undefined : selectedListId,
        selectedWords: wordsToAdd,
        createNewList
      });

      toast({
        title: createNewList ? '已创建新词树' : '添加成功',
        description: data.message,
        status: 'success',
        duration: 4000,
        isClosable: true,
      });
      
      // If we created a new list, update our local list
      if (data.createdNewList) {
        await loadWordLists();
      }
      
      onClose();
      setSelectedWords([]);
      setCreateNewList(false);
    } catch (error) {
      console.error('Failed to add words:', error);
      toast({
        title: '出错了',
        description: '添加单词失败，请稍后重试。',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const resetExercise = () => {
    setState('setup');
    setContext('');
    setSessionContext('');
    setImage(null);
    setUserDescription('');
    setAnalysis(null);
    setExerciseId('');
    setSelectedWords([]);
    setCreateNewList(false);
  };

  const continueSession = () => {
    setUserDescription('');
    setAnalysis(null);
    setExerciseId('');
    setState('setup'); // Reset to setup state to show loading properly
    startExercise(true); // Use session context
  };

  return (
    <Box minH="100vh" bg={useColorModeValue('gray.50', '#0F172A')}>
      <Container maxW="container.xl" py={8} px={{ base: 4, md: 8 }}>
        <VStack spacing={8} align="stretch">
          <Flex 
            justify="space-between" 
            align={{ base: 'flex-start', md: 'center' }}
            direction={{ base: 'column', md: 'row' }}
            gap={4}
          >
            <Box>
              <Heading 
                as="h1" 
                size="2xl"
                color="green.500"
                display="flex"
                alignItems="center"
                gap={3}
              >
                <Flex align="center" gap={2}>
                  <Text fontSize="4xl">🌳</Text>
                  <Text fontSize="3xl">🐦</Text>
                </Flex>
                视觉花园
              </Heading>
              <Text mt={2} color="gray.400" fontSize="lg">
                通过图片探索来扩展词汇量。描述你所看到的内容，让 WordPecker 帮你发现新词。
              </Text>
            </Box>
          </Flex>

        {/* Setup Phase */}
        {state === 'setup' && (
          <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="lg">
            <CardHeader bg={accentBg} borderTopRadius="xl">
              <HStack spacing={2}>
                <Text fontSize="xl">🌱</Text>
                <Heading size="md" color={useColorModeValue('green.600', '#38A169')}>种下你的学习种子</Heading>
              </HStack>
              <Text fontSize="sm" color={useColorModeValue('gray.600', '#94A3B8')} mt={2} fontWeight="medium">
                选择一个词汇场景开始探索，或让 WordPecker 带你进入随机冒险！
              </Text>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel color="green.400" fontSize="lg" fontWeight="semibold">
                    ✍️ 创建自定义场景
                  </FormLabel>
                  <HStack spacing={3}>
                    <Input
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder="例如：商务英语词汇（留空可随机）"
                      size="lg"
                      borderColor={context ? "green.400" : borderColor}
                      borderWidth="2px"
                      _focus={{
                        borderColor: "green.400",
                        boxShadow: "0 0 0 1px var(--chakra-colors-green-400)"
                      }}
                    />
                    <Button
                      leftIcon={<FaRandom />}
                      onClick={handleGenerateRandomContext}
                      colorScheme="purple"
                      variant="outline"
                      size="lg"
                      isLoading={generatingContext}
                      loadingText="生成中..."
                      flexShrink={0}
                      _hover={{
                        transform: 'translateY(-2px)',
                        bg: useColorModeValue('purple.50', 'purple.800'),
                        borderColor: useColorModeValue('purple.400', 'purple.300')
                      }}
                      transition="all 0.2s"
                    >
                      AI 生成
                    </Button>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    留空即可获得一个惊喜随机场景。
                  </Text>
                </FormControl>

                <FormControl>
                  <FormLabel fontWeight="semibold">图片来源</FormLabel>
                  <RadioGroup 
                    value={imageSource} 
                    onChange={(value) => setImageSource(value as 'ai' | 'stock')}
                    colorScheme="green"
                  >
                    <VStack align="start" spacing={3}>
                      <Radio value="ai" size="lg">
                        <VStack align="start" spacing={1}>
                          <Text fontWeight="medium">🤖 AI 生成图片</Text>
                          <Text fontSize="sm" color="gray.500">
                            使用 DALL-E 生成独特且可定制的图片
                          </Text>
                        </VStack>
                      </Radio>
                      <Radio value="stock" size="lg">
                        <VStack align="start" spacing={1}>
                          <Text fontWeight="medium">📷 图库图片</Text>
                          <Text fontSize="sm" color="gray.500">
                            使用来自 Pexels 的真实照片
                          </Text>
                        </VStack>
                      </Radio>
                    </VStack>
                  </RadioGroup>
                </FormControl>

                {wordLists.length > 0 && wordLists.filter(list => list.context).length > 0 && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontSize="lg" fontWeight="semibold" color="blue.400" mb={4}>
                        📚 你的已有场景
                      </Text>
                      <Wrap spacing={3}>
                        {wordLists
                          .filter(list => list.context) // Only show lists with contexts
                          .map((list) => (
                          <WrapItem key={list.id}>
                            <Button
                              size="md"
                              variant="outline"
                              onClick={() => setContext(list.context || '')}
                              colorScheme="blue"
                              borderWidth="2px"
                              _hover={{
                                transform: 'translateY(-2px)',
                                bg: useColorModeValue('blue.50', 'blue.800'),
                                borderColor: useColorModeValue('blue.400', 'blue.300')
                              }}
                              transition="all 0.2s"
                            >
                              <Text fontWeight="medium" fontSize="sm">
                                {list.context}
                              </Text>
                            </Button>
                          </WrapItem>
                        ))}
                      </Wrap>
                    </Box>
                  </>
                )}

                <Divider />

                <HStack spacing={4}>
                  <Button
                    colorScheme="green"
                    size="lg"
                    onClick={() => startExercise()}
                    isLoading={loading}
                    loadingText={context.trim() ? "🌱 正在生成图片..." : "🎲 正在寻找随机冒险..."}
                    flex={1}
                    borderRadius="lg"
                    leftIcon={context.trim() ? <Text>🌿</Text> : <Text>🎲</Text>}
                    _hover={{
                      transform: 'translateY(-2px)',
                      bg: 'green.600'
                    }}
                    transition="all 0.2s"
                  >
                    {context.trim() ? "开始我的花园" : "随机冒险"}
                  </Button>
                  {context.trim() && (
                    <Button
                      variant="outline"
                      colorScheme="green"
                      size="lg"
                      onClick={() => {
                        setContext('');
                        startExercise();
                      }}
                      isLoading={loading}
                      loadingText="🎲 正在寻找随机冒险..."
                      borderRadius="lg"
                      leftIcon={<Text>🎲</Text>}
                      _hover={{
                        transform: 'translateY(-2px)',
                        bg: 'green.50',
                        borderColor: 'green.500'
                      }}
                      transition="all 0.2s"
                    >
                      改为随机
                    </Button>
                  )}
                </HStack>
              </VStack>
            </CardBody>
          </Card>
        )}

        {/* Describing Phase */}
        {state === 'describing' && image && (
          <VStack spacing={6} align="stretch">
            <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="lg">
              <CardHeader bg={accentBg} borderTopRadius="xl">
                <VStack align="start" spacing={2}>
                  <HStack spacing={2}>
                    <Text fontSize="xl">🔍</Text>
                    <Heading size="md" color="green.700">探索你的视觉花园</Heading>
                  </HStack>
                  <HStack spacing={2}>
                    <Text fontSize="sm" color="green.600" fontWeight="medium">
                      当前场景：
                    </Text>
                    <Badge colorScheme="green" variant="solid" borderRadius="full" px={3}>
                      🌿 {sessionContext}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color="green.600" fontStyle="italic">
                    {instructions}
                  </Text>
                </VStack>
              </CardHeader>
              <CardBody>
                <VStack spacing={6}>
                  <Box borderRadius="xl" overflow="hidden" border="3px solid" borderColor="green.200" shadow="md">
                    <Image
                      src={image.url}
                      alt={image.alt}
                      objectFit="contain"
                      w="100%"
                      maxW="100%"
                    />
                  </Box>

                  <FormControl>
                    <FormLabel color="green.700" fontWeight="semibold" fontSize="md">
                      🌱 在这里写下你的描述
                    </FormLabel>
                    <Textarea
                      value={userDescription}
                      onChange={(e) => setUserDescription(e.target.value)}
                      placeholder="请描述你看到的一切：物体、人物、颜色、情绪、氛围……"
                      minH="150px"
                      size="lg"
                      borderColor="green.200"
                      borderWidth="2px"
                      borderRadius="lg"
                      _focus={{
                        borderColor: "green.400",
                        boxShadow: "0 0 0 1px var(--chakra-colors-green-400)"
                      }}
                      bg={useColorModeValue('gray.50', '#1E293B')}
                      _placeholder={{ color: useColorModeValue('gray.500', '#94A3B8') }}
                    />
                    <Text fontSize="sm" color={useColorModeValue('gray.600', '#94A3B8')} mt={2} fontWeight="medium">
                    🌿 已输入 {userDescription.length} 个字符（至少 10 个字符）
                    </Text>
                  </FormControl>

                  <HStack spacing={4} justify="center">
                    <Button
                      colorScheme="green"
                      size="lg"
                      onClick={submitDescription}
                      isLoading={analyzing}
                    loadingText="🔍 WordPecker 正在分析中..."
                      isDisabled={userDescription.trim().length < 10}
                      borderRadius="lg"
                      leftIcon={<Text>🐦</Text>}
                      px={8}
                      _hover={{
                        transform: 'translateY(-2px)',
                        bg: useColorModeValue('green.600', 'green.500')
                      }}
                      transition="all 0.2s"
                    >
                    获取 WordPecker 分析
                    </Button>
                    <Button 
                      variant="outline" 
                      colorScheme="green"
                      onClick={resetExercise}
                      borderRadius="lg"
                      leftIcon={<Text>🔄</Text>}
                      _hover={{
                        transform: 'translateY(-2px)',
                        bg: useColorModeValue('green.50', 'green.800'),
                        borderColor: useColorModeValue('green.500', 'green.400')
                      }}
                      transition="all 0.2s"
                    >
                      Start Over
                    </Button>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>
          </VStack>
        )}

        {/* Results Phase */}
        {state === 'results' && analysis && image && (
          <VStack spacing={8} align="stretch">
            {/* Show the image again for reference */}
            <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="md">
              <CardHeader bg={accentBg} borderTopRadius="xl">
                <VStack align="start" spacing={2}>
                  <HStack spacing={2}>
                    <Text fontSize="xl">📸</Text>
                    <Heading size="md" color="green.700">你的视觉花园</Heading>
                  </HStack>
                  <HStack spacing={2}>
                    <Text fontSize="sm" color="green.600" fontWeight="medium">
                      场景：
                    </Text>
                    <Badge colorScheme="green" variant="solid" borderRadius="full" px={3}>
                      🌿 {sessionContext}
                    </Badge>
                  </HStack>
                </VStack>
              </CardHeader>
              <CardBody>
                <Box borderRadius="xl" overflow="hidden" border="3px solid" borderColor="green.200" shadow="md">
                  <Image
                    src={image.url}
                    alt={image.alt}
                    objectFit="contain"
                    w="100%"
                    maxW="100%"
                    mx="auto"
                  />
                </Box>
              </CardBody>
            </Card>

            <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="lg">
              <CardHeader bg={feedbackBg} borderTopRadius="xl">
                <HStack spacing={2}>
                  <Text fontSize="xl">🐦</Text>
                  <Heading size="md" color="emerald.700">WordPecker 花园报告</Heading>
                </HStack>
              </CardHeader>
              <CardBody>
                <VStack spacing={6} align="stretch">

                  {/* Feedback */}
                  <Box>
                    <HStack spacing={2} mb={3}>
                      <Text fontSize="xl">💭</Text>
                      <Heading size="sm" color={useColorModeValue('green.600', '#38A169')}>WordPecker 点评</Heading>
                    </HStack>
                    <Box p={5} bg={useColorModeValue('gray.50', '#1E293B')} borderRadius="xl" border="1px solid" borderColor={borderColor} shadow="sm">
                      <Text fontSize="md" lineHeight="tall" color={useColorModeValue('gray.700', '#F8FAFC')} fontWeight="medium">
                        {analysis.feedback}
                      </Text>
                    </Box>
                  </Box>

                  {/* Strengths */}
                  {analysis.user_strengths.length > 0 && (
                    <Box>
                      <HStack spacing={2} mb={3}>
                        <Text fontSize="xl">🌟</Text>
                        <Heading size="sm" color={useColorModeValue('green.600', '#38A169')}>你已掌握的亮点</Heading>
                      </HStack>
                      <Wrap spacing={3}>
                        {analysis.user_strengths.map((strength, index) => (
                          <WrapItem key={index}>
                            <Badge 
                              colorScheme="green" 
                              variant="solid" 
                              px={3} 
                              py={1} 
                              borderRadius="full"
                              fontSize="sm"
                            >
                              ✨ {strength}
                            </Badge>
                          </WrapItem>
                        ))}
                      </Wrap>
                    </Box>
                  )}

                  {/* Missed Concepts */}
                  {analysis.missed_concepts.length > 0 && (
                    <Box>
                      <HStack spacing={2} mb={3}>
                        <Text fontSize="xl">🔍</Text>
                        <Heading size="sm" color={useColorModeValue('orange.600', '#FB923C')}>可进一步提升的点</Heading>
                      </HStack>
                      <Box p={4} bg={useColorModeValue('orange.50', '#1E293B')} borderRadius="lg" border="1px solid" borderColor={useColorModeValue('orange.200', '#FB923C')}>
                        <VStack align="start" spacing={2}>
                          {analysis.missed_concepts.map((concept, index) => (
                            <HStack key={index} align="start" spacing={2}>
                              <Text fontSize="sm" color={useColorModeValue('orange.600', '#FB923C')}>•</Text>
                              <Text fontSize="sm" color={useColorModeValue('orange.700', '#FDBA74')} lineHeight="1.5">
                                {concept}
                              </Text>
                            </HStack>
                          ))}
                        </VStack>
                      </Box>
                      <Text fontSize="xs" color={useColorModeValue('gray.500', '#94A3B8')} mt={2} fontStyle="italic">
                        💡 这些细节会让你的描述更丰富。
                      </Text>
                    </Box>
                  )}

                  {/* Vocabulary Recommendations */}
                  <Box>
                    <HStack spacing={2} mb={4}>
                      <Text fontSize="xl">🌱</Text>
                      <Heading size="sm" color={useColorModeValue('green.600', '#38A169')}>推荐学习新词</Heading>
                    </HStack>
                    <VStack spacing={4} align="stretch">
                      {analysis.recommendations.map((rec, index) => (
                        <Box 
                          key={index} 
                          p={5} 
                          bg={vocabCardBg}
                          borderWidth="2px" 
                          borderRadius="xl" 
                          borderColor="green.200"
                          shadow="md"
                          _hover={{ shadow: "lg", transform: "translateY(-2px)" }}
                          transition="all 0.2s"
                        >
                          <VStack align="start" spacing={3}>
                            <HStack justify="space-between" w="100%">
                              <HStack spacing={3}>
                                <Text fontSize="lg">🌿</Text>
                                <Text fontWeight="bold" fontSize="xl" color={useColorModeValue('green.600', '#38A169')}>
                                  {rec.word}
                                </Text>
                                <PronunciationButton
                                  text={rec.word}
                                  type="word"
                                  language="en"
                                  size="sm"
                                  colorScheme="green"
                                  tooltipText="收听单词发音"
                                />
                                {rec.difficulty_level && (
                                  <Badge
                                    colorScheme={
                                      rec.difficulty_level === 'basic' ? 'green' :
                                      rec.difficulty_level === 'intermediate' ? 'orange' : 'red'
                                    }
                                    variant="solid"
                                    borderRadius="full"
                                    px={3}
                                    py={1}
                                  >
                                    {rec.difficulty_level === 'basic' ? '🌱 基础' :
                                     rec.difficulty_level === 'intermediate' ? '🌳 进阶' : '🦅 高阶'}
                                  </Badge>
                                )}
                              </HStack>
                            </HStack>
                            <Box bg={useColorModeValue('gray.50', '#1E293B')} p={3} borderRadius="lg" border="1px solid" borderColor={borderColor}>
                              <Text fontSize="md" color={useColorModeValue('gray.700', '#F8FAFC')} fontWeight="medium" lineHeight="tall">
                                {rec.meaning}
                              </Text>
                            </Box>
                            <Box bg={useColorModeValue('blue.50', '#1E293B')} p={3} borderRadius="lg" border="1px solid" borderColor={borderColor}>
                              <HStack justify="space-between" align="start">
                                <Text fontSize="sm" color={useColorModeValue('gray.600', '#94A3B8')} fontWeight="medium" flex="1">
                                  💡 例句：<Text as="span" fontStyle="italic">{rec.example}</Text>
                                </Text>
                                <PronunciationButton
                                  text={rec.example}
                                  type="sentence"
                                  language="en"
                                  size="sm"
                                  colorScheme="blue"
                                  tooltipText="收听例句发音"
                                />
                              </HStack>
                            </Box>
                          </VStack>
                        </Box>
                      ))}
                    </VStack>
                  </Box>

                  {/* Action Buttons */}
                  <VStack spacing={5} pt={4}>
                    <Box textAlign="center" w="full">
                      <Button
                        colorScheme="orange"
                        size="xl"
                        onClick={onOpen}
                        isDisabled={analysis.recommendations.length === 0}
                        borderRadius="xl"
                        px={12}
                        py={6}
                        fontSize="lg"
                        fontWeight="bold"
                        leftIcon={<Text fontSize="2xl">🌱</Text>}
                        shadow="lg"
                        _hover={{ 
                          shadow: "xl", 
                          transform: "translateY(-3px)",
                          bg: useColorModeValue("orange.600", "orange.500")
                        }}
                        _active={{
                          transform: "translateY(-1px)"
                        }}
                        transition="all 0.3s"
                        w={{ base: "full", md: "auto" }}
                        minW="280px"
                      >
                        🌿 把单词种进我的词树 🌿
                      </Button>
                    </Box>
                    
                    <Divider borderColor="green.200" />
                    
                    <HStack spacing={4} justify="center">
                      <Button
                        colorScheme="green"
                        onClick={() => continueSession()}
                        isLoading={loading}
                        loadingText="🌱 正在生成新花园..."
                        borderRadius="lg"
                        leftIcon={<Text>🔄</Text>}
                        size="md"
                        _hover={{
                          transform: 'translateY(-2px)',
                          bg: useColorModeValue('green.600', 'green.500')
                        }}
                        transition="all 0.2s"
                      >
                        新花园（同一场景）
                      </Button>
                      <Button
                        variant="outline"
                        colorScheme="green"
                        onClick={resetExercise}
                        borderRadius="lg"
                        leftIcon={<Text>🆕</Text>}
                        size="md"
                        _hover={{
                          transform: 'translateY(-2px)',
                          bg: useColorModeValue('green.50', 'green.800'),
                          borderColor: useColorModeValue('green.500', 'green.400')
                        }}
                        transition="all 0.2s"
                      >
                        新场景
                      </Button>
                    </HStack>
                  </VStack>
                </VStack>
              </CardBody>
            </Card>
          </VStack>
        )}
      </VStack>

      {/* Add Words Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent borderRadius="xl" bg={useColorModeValue('white', 'gray.800')}>
          <ModalHeader bg={useColorModeValue('green.50', 'green.900')} borderTopRadius="xl">
            <HStack spacing={3}>
              <Text fontSize="2xl">🌱</Text>
              <Text color={useColorModeValue('green.700', 'green.200')} fontWeight="bold" fontSize="xl">
                将单词种入你的词树
              </Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody py={6}>
            <VStack spacing={6} align="stretch">
              {/* List Selection */}
              <Box>
                <FormControl display="flex" alignItems="center" mb={4}>
                  <Checkbox
                    isChecked={createNewList}
                    onChange={(e) => setCreateNewList(e.target.checked)}
                    colorScheme="green"
                    size="lg"
                  >
                    <Text fontSize="md" fontWeight="medium">
                      为该场景创建新词树
                    </Text>
                  </Checkbox>
                </FormControl>
                
                {createNewList ? (
                  <Alert status="info" borderRadius="lg">
                    <AlertIcon />
                    <Text fontSize="sm">
                      New list: "{sessionContext}"
                    </Text>
                  </Alert>
                ) : (
                  <FormControl>
                    <FormLabel fontWeight="medium" color={useColorModeValue('gray.700', 'gray.200')}>
                      添加到已有词树
                    </FormLabel>
                    <Select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      size="lg"
                      bg={useColorModeValue('white', 'gray.700')}
                    >
                      {wordLists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>

              {/* Word Selection */}
              {analysis && (
                <Box>
                  <Text fontSize="md" fontWeight="semibold" mb={4} color={useColorModeValue('gray.700', 'gray.200')}>
                    选择要添加的单词（已选 {selectedWords.length} 个）
                  </Text>
                  <VStack align="stretch" spacing={3} maxH="400px" overflowY="auto">
                    {analysis.recommendations.map((rec) => (
                      <Box
                        key={rec.word}
                        p={4}
                        bg={selectedWords.includes(rec.word) 
                          ? useColorModeValue('green.50', 'green.900') 
                          : useColorModeValue('gray.50', 'gray.700')}
                        borderWidth="2px"
                        borderColor={selectedWords.includes(rec.word) 
                          ? useColorModeValue('green.300', 'green.600') 
                          : useColorModeValue('gray.200', 'gray.600')}
                        borderRadius="lg"
                        cursor="pointer"
                        onClick={() => {
                          if (selectedWords.includes(rec.word)) {
                            setSelectedWords(selectedWords.filter(w => w !== rec.word));
                          } else {
                            setSelectedWords([...selectedWords, rec.word]);
                          }
                        }}
                        transition="all 0.2s"
                        _hover={{
                          borderColor: useColorModeValue('green.400', 'green.500'),
                          shadow: "sm"
                        }}
                      >
                        <HStack spacing={4} align="start">
                          <Checkbox 
                            isChecked={selectedWords.includes(rec.word)}
                            colorScheme="green"
                            size="lg"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedWords([...selectedWords, rec.word]);
                              } else {
                                setSelectedWords(selectedWords.filter(w => w !== rec.word));
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <VStack align="start" spacing={1} flex={1}>
                            <HStack spacing={2} align="center">
                              <Text fontWeight="bold" fontSize="lg" color={useColorModeValue('green.700', 'green.300')}>
                                {rec.word}
                              </Text>
                              <PronunciationButton
                                text={rec.word}
                                type="word"
                                language="en"
                                size="sm"
                                colorScheme="green"
                                variant="ghost"
                                tooltipText="收听单词发音"
                              />
                            </HStack>
                            <Text color={useColorModeValue('gray.600', 'gray.400')} fontSize="sm" lineHeight="1.4">
                              {rec.meaning}
                            </Text>
                          </VStack>
                        </HStack>
                      </Box>
                    ))}
                  </VStack>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter bg={useColorModeValue('gray.50', 'gray.700')} borderBottomRadius="xl">
            <HStack spacing={3}>
              <Button 
                variant="outline" 
                colorScheme="gray" 
                onClick={onClose} 
                size="lg"
              >
                取消
              </Button>
              <Button 
                colorScheme="green" 
                onClick={addWordsToList} 
                leftIcon={<Text>🌱</Text>}
                size="lg"
                fontWeight="bold"
                _hover={{
                  transform: "translateY(-1px)"
                }}
                transition="all 0.2s"
                isDisabled={selectedWords.length === 0}
              >
                Plant {selectedWords.length} Word{selectedWords.length !== 1 ? 's' : ''}
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
      </Container>
    </Box>
  );
};
