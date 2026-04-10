import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Heading,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  FormControl,
  FormLabel,
  Card,
  CardBody,
  useToast,
  Badge,
  Wrap,
  WrapItem,
  Spinner,
  Center,
  useColorModeValue,
  Divider,
  RadioGroup,
  Radio,
  Flex
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FaRandom, FaArrowRight } from 'react-icons/fa';
import { apiService } from '../services/api';
import { WordList } from '../types';

export const GetNewWords: React.FC = () => {
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [customContext, setCustomContext] = useState('');
  const [selectedContext, setSelectedContext] = useState<string>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'basic' | 'intermediate' | 'advanced'>('intermediate');
  const [loading, setLoading] = useState(true);
  const [generatingContext, setGeneratingContext] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  
  const navigate = useNavigate();
  const toast = useToast();
  
  const cardBg = useColorModeValue('white', '#1E293B');
  const borderColor = useColorModeValue('gray.200', '#334155');

  useEffect(() => {
    loadWordLists();
  }, []);

  const loadWordLists = async () => {
    try {
      const lists = await apiService.getLists();
      setWordLists(lists);
    } catch (error) {
      console.error('Failed to load word lists:', error);
      toast({
        title: '出错了',
        description: '加载你的词树失败',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRandomContext = async () => {
    setGeneratingContext(true);
    try {
      const suggestions = await apiService.getContextSuggestions();
      if (suggestions.suggestions.length > 0) {
        const randomContext = suggestions.suggestions[0];
        setSelectedContext(randomContext);
        setCustomContext(randomContext);
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

  const handleStartLearning = async () => {
    const contextToUse = selectedContext || customContext.trim();
    
    if (!contextToUse) {
      toast({
        title: '未选择场景',
        description: '请选择一个场景或输入自定义场景',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setStartingSession(true);
    try {
      // Navigate to the learning session with the selected context and difficulty
      navigate('/learn-new-words/session', { 
        state: { 
          context: contextToUse,
          difficulty: selectedDifficulty
        }
      });
    } catch (error) {
      console.error('Failed to start learning session:', error);
      toast({
        title: '出错了',
        description: '启动学习会话失败',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setStartingSession(false);
    }
  };

  const handleContextSelect = (context: string) => {
    setSelectedContext(context);
    setCustomContext(context);
  };

  if (loading) {
    return (
      <Container maxW="container.xl" py={8}>
        <Center>
          <Spinner size="xl" color="blue.500" />
        </Center>
      </Container>
    );
  }

  return (
    <Box minH="100vh" bg={useColorModeValue('gray.50', '#0F172A')}>
      <Container maxW="container.xl" py={8} px={{ base: 4, md: 8 }}>
        <VStack spacing={8} align="stretch">
          {/* Header */}
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
                  <Text fontSize="4xl">📚</Text>
                  <Text fontSize="3xl">🎓</Text>
                </Flex>
                发现新词
              </Heading>
              <Text mt={2} color="gray.400" fontSize="lg">
                在你偏好的场景中发现并学习新词。可选择已有场景，或创建自己的场景。
              </Text>
            </Box>
          </Flex>

          {/* Context Selection */}
          <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="lg">
            <CardBody>
              <VStack spacing={6} align="stretch">
                
                {/* Existing List Contexts */}
                {wordLists.filter(list => list.context).length > 0 && (
                  <Box>
                    <Text fontSize="lg" fontWeight="semibold" color="blue.400" mb={4}>
                      📚 你的已有场景
                    </Text>
                    <Wrap spacing={3}>
                      {wordLists
                        .filter(list => list.context)
                        .map((list) => (
                          <WrapItem key={list.id}>
                            <Button
                              variant={selectedContext === list.context ? "solid" : "outline"}
                              colorScheme="blue"
                              onClick={() => handleContextSelect(list.context!)}
                              size="md"
                              borderRadius="lg"
                              _hover={{
                                transform: 'translateY(-2px)',
                                shadow: 'md'
                              }}
                              transition="all 0.2s"
                            >
                              <Text fontSize="sm" fontWeight="bold">
                                {list.context}
                              </Text>
                            </Button>
                          </WrapItem>
                        ))}
                    </Wrap>
                  </Box>
                )}

                <Divider />

                {/* Custom Context Input */}
                <Box>
                  <FormControl>
                    <FormLabel color="green.400" fontSize="lg" fontWeight="semibold">
                      ✍️ 创建自定义场景
                    </FormLabel>
                    <HStack spacing={3}>
                      <Input
                        value={customContext}
                        onChange={(e) => {
                          setCustomContext(e.target.value);
                          setSelectedContext(e.target.value);
                        }}
                        placeholder="例如：太空探索、中世纪历史、烹饪技巧……"
                        size="lg"
                        borderColor={selectedContext === customContext ? "green.400" : borderColor}
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
                    <Text fontSize="sm" color="gray.500" mt={2}>
                      输入你感兴趣的任意学习场景或主题
                    </Text>
                  </FormControl>
                </Box>

                <Divider />

                {/* Difficulty Selection */}
                <Box>
                  <FormControl>
                    <FormLabel color="purple.400" fontSize="lg" fontWeight="semibold">
                      🎯 选择难度
                    </FormLabel>
                    <RadioGroup 
                      value={selectedDifficulty} 
                      onChange={(value) => setSelectedDifficulty(value as 'basic' | 'intermediate' | 'advanced')}
                      colorScheme="purple"
                    >
                      <VStack align="start" spacing={3}>
                        <Radio value="basic" size="lg">
                          <VStack align="start" spacing={1}>
                            <HStack>
                              <Text fontWeight="medium">🌱 基础</Text>
                              <Badge colorScheme="green" variant="subtle">入门</Badge>
                            </HStack>
                            <Text fontSize="sm" color="gray.500">
                              适合初学者的高频日常词汇
                            </Text>
                          </VStack>
                        </Radio>
                        <Radio value="intermediate" size="lg">
                          <VStack align="start" spacing={1}>
                            <HStack>
                              <Text fontWeight="medium">🌳 进阶</Text>
                              <Badge colorScheme="orange" variant="subtle">提升</Badge>
                            </HStack>
                            <Text fontSize="sm" color="gray.500">
                              适合提升阶段学习者的中高阶词汇
                            </Text>
                          </VStack>
                        </Radio>
                        <Radio value="advanced" size="lg">
                          <VStack align="start" spacing={1}>
                            <HStack>
                              <Text fontWeight="medium">🦅 高阶</Text>
                              <Badge colorScheme="red" variant="subtle">熟练</Badge>
                            </HStack>
                            <Text fontSize="sm" color="gray.500">
                              适合熟练学习者的复杂、细腻词汇
                            </Text>
                          </VStack>
                        </Radio>
                      </VStack>
                    </RadioGroup>
                    <Text fontSize="sm" color="gray.500" mt={3}>
                      AI 会在相近场景中生成你尚未掌握的新词
                    </Text>
                  </FormControl>
                </Box>

                <Divider />

                {/* Start Learning Button */}
                <Box textAlign="center">
                  <Text fontSize="md" color="gray.400" mb={4}>
                    {selectedContext ? (
                      <>
                        准备在此场景学习新词：<Text as="span" fontWeight="bold" color="blue.400">「{selectedContext}」</Text>
                      </>
                    ) : (
                      '请选择或输入一个场景后开始学习'
                    )}
                  </Text>
                  
                  <Button
                    rightIcon={<FaArrowRight />}
                    onClick={handleStartLearning}
                    colorScheme="blue"
                    size="xl"
                    isDisabled={!selectedContext && !customContext.trim()}
                    isLoading={startingSession}
                    loadingText="启动中..."
                    borderRadius="xl"
                    px={12}
                    py={6}
                    fontSize="lg"
                    fontWeight="bold"
                    shadow="lg"
                    _hover={{ 
                      shadow: "xl", 
                      transform: "translateY(-3px)"
                    }}
                    _active={{
                      transform: "translateY(-1px)"
                    }}
                    transition="all 0.3s"
                  >
                    开始学习新词
                  </Button>
                </Box>
              </VStack>
            </CardBody>
          </Card>
        </VStack>
      </Container>
    </Box>
  );
};
