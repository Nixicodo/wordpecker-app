import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Icon,
  Text,
  useDisclosure,
  VStack,
  Badge,
  SimpleGrid,
  useToast,
  Spinner,
  Center,
  HStack
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { GiTreeBranch } from 'react-icons/gi';
import { FaPlus, FaGamepad, FaBook, FaFeatherAlt, FaEye } from 'react-icons/fa';
import { CreateListModal } from '../components/CreateListModal';
import { ProgressIndicator } from '../components/ProgressIndicator';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { WordList } from '../types';
import { apiService } from '../services/api';
import { designTokens } from '../theme/design-system';
import { detectUiLocale } from '../i18n/ui';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 }
};

const listNameZhMap: Record<string, string> = {
  'Spanish Travel Basics': '西班牙语旅行基础',
  'Spanish Starter': '西班牙语起步'
};

const listDescriptionZhMap: Record<string, string> = {
  'Starter Spanish travel list with AI-generated support': '面向旅行场景的西班牙语入门词表（含 AI 支持）',
  'Local deployment smoke test list': '本地部署冒烟测试词表'
};

const getDisplayListName = (name: string, isZh: boolean): string => {
  if (!isZh) return name;
  return listNameZhMap[name] ?? name;
};

const getDisplayListDescription = (description: string | undefined, isZh: boolean): string => {
  if (!description) return isZh ? '暂无描述' : 'No description yet';
  if (!isZh) return description;
  return listDescriptionZhMap[description] ?? description;
};

export const Lists = () => {
  const isZh = detectUiLocale() === 'zh-CN';
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const [lists, setLists] = useState<WordList[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLists = async () => {
      try {
        const listsData = await apiService.getLists();
        setLists(listsData);
      } catch (error) {
        console.error('Error fetching lists:', error);
        toast({
          title: isZh ? '获取词树失败' : 'Error fetching lists',
          description: isZh ? '请稍后再试' : 'Please try again later',
          status: 'error',
          duration: 5000,
          isClosable: true
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchLists();
  }, [toast, isZh]);

  const handleCreateList = async (name: string, description: string, context: string) => {
    try {
      const newList = await apiService.createList({ name, description, context });
      setLists((prevLists) => [newList, ...prevLists]);
      toast({
        title: isZh ? '词树创建成功' : 'List created successfully',
        status: 'success',
        duration: 3000,
        isClosable: true
      });
      onClose();
    } catch (error) {
      console.error('Error creating list:', error);
      toast({
        title: isZh ? '创建词树失败' : 'Error creating list',
        description: isZh ? '请稍后再试' : 'Please try again later',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  };

  if (isLoading) {
    return (
      <Center h="calc(100vh - 64px)">
        <Spinner size="xl" color="green.500" thickness="4px" />
      </Center>
    );
  }

  return (
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
                <Icon as={GiTreeBranch} boxSize={10} color="green.500" />
                <Icon as={FaFeatherAlt} boxSize={8} color="orange.400" transform="rotate(-45deg)" ml={-4} mt={-4} />
              </Flex>
              {isZh ? '我的词树' : 'My Word Trees'}
            </Heading>
            <Text mt={2} color="gray.400" fontSize="lg">
              {isZh ? '现在看到的是待复习、新词和稳定词的真实脉搏。' : 'Track what is due, new, and stable at a glance.'}
            </Text>
          </Box>
          <Button
            leftIcon={<FaPlus />}
            colorScheme="green"
            size="lg"
            onClick={onOpen}
            _hover={{ transform: 'translateY(-2px)' }}
            transition="all 0.2s"
            w={{ base: 'full', md: 'auto' }}
          >
            {isZh ? '新建词树' : 'Plant New Tree'}
          </Button>
        </Flex>

        <SimpleGrid
          columns={{ base: 1, md: 2, lg: 3 }}
          spacing={6}
          as={motion.div}
          variants={container}
          initial="hidden"
          animate="show"
        >
          {lists.map((list) => {
            const wordCount = list.wordCount || 0;

            return (
              <Box
                key={list.id}
                as={motion.div}
                variants={item}
                whileHover={{ y: -4 }}
              >
                <Box
                  layerStyle="card"
                  h="full"
                  position="relative"
                  overflow="hidden"
                  borderWidth="1px"
                  borderColor={designTokens.cardVariants.userList.borderColor}
                  _hover={{
                    borderColor: designTokens.cardVariants.userList.hoverBorderColor,
                    shadow: designTokens.cardVariants.userList.hoverShadow
                  }}
                  transition="all 0.3s"
                  p={5}
                  borderRadius="2xl"
                  minH="350px"
                  bg="linear-gradient(180deg, rgba(16,23,36,0.98), rgba(8,14,24,0.95))"
                >
                  <VStack spacing={4} h="full" align="stretch">
                    <Box>
                      <Flex justify="space-between" align="flex-start" mb={3}>
                        <Flex align="center" gap={2} flex={1} pr={3}>
                          <Icon as={GiTreeBranch} color="green.500" boxSize={6} />
                          <VStack align="flex-start" spacing={1} flex={1}>
                            <Text fontWeight="bold" fontSize="lg" color="white" noOfLines={1} lineHeight="1.2">
                              {getDisplayListName(list.name, isZh)}
                            </Text>
                            <Text color="gray.400" fontSize="xs" noOfLines={1}>
                              {list.kind === 'mistake_book' ? (isZh ? '错题复盘' : 'Mistake review') : (isZh ? '自定义词树' : 'Custom tree')}
                            </Text>
                          </VStack>
                        </Flex>

                        <VStack spacing={1} align="flex-end" flexShrink={0}>
                          <Badge bg={wordCount > 0 ? designTokens.badgeColors.secondary : designTokens.badgeColors.neutral} color="white" variant="solid" fontSize="xs" px={2} py={1}>
                            {isZh ? `${wordCount} 个词` : `${wordCount} words`}
                          </Badge>
                          {(list.masteredCount || 0) > 0 && (
                            <Badge bg={designTokens.badgeColors.primary} color="white" variant="solid" fontSize="xs" px={2} py={1}>
                              Stable {list.masteredCount}
                            </Badge>
                          )}
                        </VStack>
                      </Flex>

                      <Text color="gray.400" fontSize="sm" noOfLines={2} lineHeight="1.4" mb={3}>
                        {getDisplayListDescription(list.description, isZh)}
                      </Text>
                    </Box>

                    <Box flex={1}>
                      {wordCount > 0 ? (
                        <>
                          <ProgressIndicator score={list.retentionScore || 0} size="sm" showLabel showBadge={false} />
                          <SimpleGrid columns={2} spacing={2} mt={3}>
                            <Badge colorScheme="red" variant="subtle">Due {list.dueCount || 0}</Badge>
                            <Badge colorScheme="orange" variant="subtle">New {list.newCount || 0}</Badge>
                            <Badge colorScheme="blue" variant="subtle">Learning {list.learningCount || 0}</Badge>
                            <Badge colorScheme="green" variant="subtle">Review {list.reviewCount || 0}</Badge>
                          </SimpleGrid>
                        </>
                      ) : (
                        <Box borderRadius="xl" bg="whiteAlpha.060" p={4}>
                          <Text color="gray.500" fontSize="sm">
                            {isZh ? '这里还没有词，先播种一些内容。' : 'This tree is still empty.'}
                          </Text>
                        </Box>
                      )}
                    </Box>

                    <HStack spacing={2} wrap="wrap" mt="auto" pt={3} borderTop="1px" borderColor="whiteAlpha.120">
                      <Link to={`/learn/${list.id}`} state={{ list }} style={{ flex: 1 }}>
                        <Button w="full" variant="ghost" colorScheme="green" leftIcon={<Icon as={FaBook} boxSize={5} />} isDisabled={wordCount === 0}>
                          {isZh ? '学习' : 'Learn'}
                        </Button>
                      </Link>
                      <Link to={`/quiz/${list.id}`} state={{ list }} style={{ flex: 1 }}>
                        <Button w="full" variant="ghost" colorScheme="orange" leftIcon={<Icon as={FaGamepad} />} isDisabled={wordCount === 0}>
                          {isZh ? '测验' : 'Quiz'}
                        </Button>
                      </Link>
                      <Link to={`/lists/${list.id}`} style={{ flex: 1 }}>
                        <Button w="full" variant="ghost" colorScheme="blue" leftIcon={<Icon as={FaEye} />}>
                          {isZh ? '查看' : 'View'}
                        </Button>
                      </Link>
                    </HStack>
                  </VStack>
                </Box>
              </Box>
            );
          })}
        </SimpleGrid>
      </VStack>

      <CreateListModal
        isOpen={isOpen}
        onClose={onClose}
        onCreateList={handleCreateList}
      />
    </Container>
  );
};
