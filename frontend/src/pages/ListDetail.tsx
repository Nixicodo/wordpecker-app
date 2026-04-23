import {
  Box,
  Button,
  Text,
  Flex,
  IconButton,
  useDisclosure,
  Container,
  Heading,
  Icon,
  useToast,
  Spinner,
  Center,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Select,
  FormControl,
  FormLabel,
  VStack,
  HStack,
  Badge,
  SimpleGrid
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Word, WordList } from '../types';
import { ArrowBackIcon, CheckCircleIcon, DeleteIcon } from '@chakra-ui/icons';
import { FaGraduationCap, FaGamepad, FaPlus, FaBookOpen, FaMicrophone, FaFileImport, FaClock } from 'react-icons/fa';
import { GiTreeBranch } from 'react-icons/gi';
import { AddWordModal } from '../components/AddWordModal';
import { BulkImportWordsModal } from '../components/BulkImportWordsModal';
import { ProgressIndicator, OverallProgress, deriveWordScore } from '../components/ProgressIndicator';
import { apiService } from '../services/api';
import { UserPreferences } from '../types';
import { hasStartedReviewFlow, isDueForReview, isMasteredForever } from '../utils/reviewState';

const generateColor = (word: string) => {
  const hue = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 62%, 18%)`;
};

const generateHoverColor = (word: string) => {
  const hue = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 62%, 24%)`;
};

const MotionBox = motion(Box);

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const formatDueDate = (value?: string) => {
  if (!value) {
    return '';
  }

  const dueAt = new Date(value);
  if (!Number.isFinite(dueAt.getTime())) {
    return '';
  }

  const year = String(dueAt.getFullYear()).slice(-2);
  const month = String(dueAt.getMonth() + 1).padStart(2, '0');
  const day = String(dueAt.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const UI = {
  errorLoadListTitle: '加载词树失败',
  errorLoadListDescription: '请稍后重试',
  addedWordTitle: '单词添加成功',
  errorAddWordTitle: '添加单词失败',
  deletedWordTitle: '单词删除成功',
  errorDeleteWordTitle: '删除单词失败',
  confirmDeleteList: '确定要删除这个词树吗？该操作无法撤销。',
  deletedListTitle: '词树删除成功',
  errorDeleteListTitle: '删除词树失败',
  errorGenerateReadingTitle: '生成轻阅读失败',
  listNotFound: '未找到词树',
  backToLists: '返回词树列表',
  contextPrefix: '学习场景：',
  actionLearn: '学习',
  actionQuiz: '测验',
  actionLightReading: '轻阅读',
  actionVoiceChat: '语音对练',
  actionAddWord: '添加单词',
  actionBulkImport: '批量导入',
  emptyHint: '你的词树还是空的，先添加一些单词让它长起来吧。',
  emptyPrimaryButton: '添加第一个单词',
  deleteWordAria: '删除单词',
  readingModalTitle: '生成轻阅读',
  readingModalHint: '根据词树中的单词生成一篇个性化短文，请选择难度：',
  readingLevelLabel: '阅读难度',
  readingLevelBeginner: '初级',
  readingLevelIntermediate: '中级',
  readingLevelAdvanced: '高级',
  cancel: '取消',
  bulkImportSuccess: '批量导入完成',
  bulkImportFail: '批量导入失败',
  bulkImportResult: (imported: number, skipped: number, failed: number) =>
    `成功 ${imported} 条，跳过 ${skipped} 条，失败 ${failed} 条。`
};

const statusLabelMap: Record<number, string> = {
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning'
};

export const ListDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isBulkImportOpen,
    onOpen: onBulkImportOpen,
    onClose: onBulkImportClose
  } = useDisclosure();

  const [list, setList] = useState<WordList | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lightReadingLevel, setLightReadingLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [generatingReading, setGeneratingReading] = useState(false);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const isMistakeBook = list?.kind === 'mistake_book';
  const isDueReview = list?.kind === 'due_review';
  const isSystemList = isMistakeBook || isDueReview;
  const dueReviewSourceTreeCount = new Set(
    words.flatMap((word) => word.sourceListIds || (word.sourceListId ? [word.sourceListId] : []))
  ).size;

  const {
    isOpen: isReadingModalOpen,
    onOpen: onReadingModalOpen,
    onClose: onReadingModalClose
  } = useDisclosure();

  useEffect(() => {
    const fetchListDetails = async () => {
      if (!id) return;

      try {
        const [listData, wordsData, preferencesData] = await Promise.all([
          apiService.getList(id),
          apiService.getWords(id),
          apiService.getPreferences()
        ]);

        setList(listData);
        setWords(wordsData);
        setUserPreferences(preferencesData);
      } catch (error) {
        console.error('加载词树详情失败:', error);
        toast({
          title: UI.errorLoadListTitle,
          description: UI.errorLoadListDescription,
          status: 'error',
          duration: 5000,
          isClosable: true
        });
        navigate('/lists');
      } finally {
        setIsLoading(false);
      }
    };

    fetchListDetails();
  }, [id, navigate, toast]);

  const handleAddWord = async (word: string): Promise<void> => {
    try {
      const newWord = await apiService.addWord(id!, word);
      setWords((prevWords) => [newWord, ...prevWords]);
      toast({
        title: UI.addedWordTitle,
        status: 'success',
        duration: 3000,
        isClosable: true
      });
      onClose();
    } catch (error) {
      console.error('添加单词失败:', error);
      toast({
        title: UI.errorAddWordTitle,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  };

  const handleDeleteWord = async (wordId: string) => {
    try {
      await apiService.deleteWord(id!, wordId);
      setWords((prevWords) => prevWords.filter((word) => word.id !== wordId));
      toast({
        title: UI.deletedWordTitle,
        status: 'success',
        duration: 3000,
        isClosable: true
      });
    } catch (error) {
      console.error('删除单词失败:', error);
      toast({
        title: UI.errorDeleteWordTitle,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  };

  const handleBulkImportWords = async (entries: Array<{ word: string; meaning?: string }>) => {
    if (!id || entries.length === 0) return;

    try {
      const result = await apiService.bulkAddWords(id, entries);
      if (result.imported.length > 0) {
        setWords((prevWords) => [...result.imported, ...prevWords]);
      }
      toast({
        title: UI.bulkImportSuccess,
        description: UI.bulkImportResult(
          result.summary.imported,
          result.summary.skipped,
          result.summary.failed
        ),
        status: result.summary.failed > 0 ? 'warning' : 'success',
        duration: 5000,
        isClosable: true
      });
      onBulkImportClose();
    } catch (error) {
      console.error('批量导入单词失败:', error);
      toast({
        title: UI.bulkImportFail,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  };

  const handleDeleteList = async () => {
    if (!id || !window.confirm(UI.confirmDeleteList)) return;

    try {
      await apiService.deleteList(id);
      toast({
        title: UI.deletedListTitle,
        status: 'success',
        duration: 3000,
        isClosable: true
      });
      navigate('/lists');
    } catch (error) {
      console.error('删除词树失败:', error);
      toast({
        title: UI.errorDeleteListTitle,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  };

  const handleGenerateLightReading = async () => {
    if (!id || words.length === 0) return;

    setGeneratingReading(true);
    try {
      const reading = await apiService.generateLightReading(id, lightReadingLevel);

      navigate(`/reading/${id}`, {
        state: {
          reading,
          list,
          level: lightReadingLevel
        }
      });

      onReadingModalClose();
    } catch (error) {
      console.error('生成轻阅读失败:', error);
      toast({
        title: UI.errorGenerateReadingTitle,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    } finally {
      setGeneratingReading(false);
    }
  };

  if (isLoading) {
    return (
      <Center h="calc(100vh - 64px)">
        <Spinner size="xl" color="green.400" thickness="4px" />
      </Center>
    );
  }

  if (!list) {
    return (
      <Container maxW="container.xl" py={8} px={{ base: 4, md: 8 }}>
        <Box textAlign="center" py={10}>
          <Text>{UI.listNotFound}</Text>
          <Button onClick={() => navigate('/lists')} mt={4} colorScheme="green">
            {UI.backToLists}
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8} px={{ base: 4, md: 8 }}>
      <MotionBox initial="hidden" animate="visible" variants={fadeIn} transition={{ duration: 0.5 }} p={4}>
        <Flex mb={6} justify="space-between" align="center">
          <Flex align="center" gap={2}>
            <IconButton
              aria-label="返回上一页"
              icon={<ArrowBackIcon />}
              variant="ghost"
              onClick={() => navigate(-1)}
              size="lg"
            />
            <Heading as="h1" size="xl" color="green.300" display="flex" alignItems="center" gap={2}>
              <Icon as={isDueReview ? FaClock : GiTreeBranch} color={isDueReview ? 'orange.300' : 'green.400'} />
              {isMistakeBook ? '错题本' : isDueReview ? '待复习' : list.name}
            </Heading>
          </Flex>
          {!isSystemList && (
            <IconButton
              aria-label="删除词树"
              icon={<DeleteIcon />}
              variant="ghost"
              colorScheme="red"
              onClick={handleDeleteList}
              size="lg"
            />
          )}
        </Flex>

        {words.length > 0 && (
          <Box mb={6}>
            <OverallProgress words={words} size="md" />
          </Box>
        )}

        <Flex justify="space-between" align="center" mb={6} direction={{ base: 'column', md: 'row' }} gap={4}>
          <Box maxW="container.md">
            <Text color="gray.300" fontSize="lg">
              {isDueReview
                ? '这里会汇总所有计划复习日期不晚于今天的单词，你在这里的作答会直接回写到它们原本的词树进度。'
                : isMistakeBook
                ? '这里会自动收集你在其他词树里失手的词。现在它们按到期和脆弱程度重新排序。'
                : list.description}
            </Text>
            {isDueReview && (
              <HStack spacing={2} mt={3} wrap="wrap">
                <Badge colorScheme="orange" variant="solid">
                  {`今日应复习 ${words.length}`}
                </Badge>
                <Badge colorScheme="yellow" variant="subtle">
                  {`来源词树 ${dueReviewSourceTreeCount}`}
                </Badge>
              </HStack>
            )}
            {list.context && !isDueReview && (
              <Text color="gray.500" fontSize="md" mt={2}>
                {UI.contextPrefix} {list.context}
              </Text>
            )}
          </Box>
          <Flex gap={3} flexWrap="wrap" justify={{ base: 'center', md: 'flex-end' }}>
            <Button variant="ghost" leftIcon={<FaGraduationCap />} colorScheme="green" size="lg" isDisabled={words.length === 0} onClick={() => navigate(`/learn/${list.id}`, { state: { list } })}>
              {isDueReview ? '开始复习' : UI.actionLearn}
            </Button>
            {!isDueReview && (
              <Button variant="ghost" leftIcon={<FaGamepad />} colorScheme="orange" size="lg" isDisabled={words.length === 0} onClick={() => navigate(`/quiz/${list.id}`, { state: { list } })}>
                {UI.actionQuiz}
              </Button>
            )}
            {!isDueReview && (
              <Button variant="ghost" leftIcon={<FaBookOpen />} colorScheme="purple" size="lg" isDisabled={words.length === 0} onClick={onReadingModalOpen}>
                {UI.actionLightReading}
              </Button>
            )}
            {!isDueReview && (
              <Button
                variant="ghost"
                leftIcon={<FaMicrophone />}
                colorScheme="blue"
                size="lg"
                isDisabled={words.length === 0}
                onClick={() => navigate(`/voice-chat/${list.id}`, {
                  state: {
                    config: {
                      listId: list.id,
                      listName: list.name,
                      listContext: list.context,
                      userLanguages: {
                        baseLanguage: userPreferences?.baseLanguage || 'English',
                        targetLanguage: userPreferences?.targetLanguage || 'English'
                      }
                    },
                    listName: list.name
                  }
                })}
              >
                {UI.actionVoiceChat}
              </Button>
            )}
            {!isSystemList && (
              <Button variant="outline" colorScheme="green" leftIcon={<FaFileImport />} size="lg" onClick={onBulkImportOpen}>
                {UI.actionBulkImport}
              </Button>
            )}
            {!isSystemList && (
              <Button variant="solid" colorScheme="green" leftIcon={<FaPlus />} size="lg" onClick={onOpen}>
                {UI.actionAddWord}
              </Button>
            )}
          </Flex>
        </Flex>

        <Box bg="linear-gradient(180deg, rgba(15,22,34,0.98), rgba(8,13,22,0.96))" borderRadius="2xl" borderWidth="1px" borderColor="whiteAlpha.120" overflow="hidden">
          {words.length === 0 ? (
            <Flex direction="column" align="center" gap={4} py={12} px={4}>
              <Icon as={isDueReview ? FaClock : GiTreeBranch} boxSize={12} color={isDueReview ? 'orange.300' : 'green.400'} />
              <Text color="gray.400" fontSize="lg" textAlign="center">
                {isDueReview
                  ? '今天暂时没有到期单词，可以先回到词树中学习新内容，或者稍后再来查看。'
                  : UI.emptyHint}
              </Text>
              {!isSystemList && (
                <Button variant="outline" colorScheme="green" leftIcon={<FaPlus />} onClick={onOpen} size="lg">
                  {UI.emptyPrimaryButton}
                </Button>
              )}
            </Flex>
          ) : (
            <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3} p={4}>
              {words.map((word: Word, index: number) => {
                const score = deriveWordScore(word);
                const startedReviewFlow = hasStartedReviewFlow(word);
                const masteredForever = isMasteredForever(word);
                const nextReviewDate = masteredForever ? '' : formatDueDate(word.dueAt);

                return (
                  <MotionBox
                    key={word.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.03 }}
                    whileHover={{ y: -3, backgroundColor: generateHoverColor(word.value) }}
                    onClick={() => navigate(`/words/${word.id}`)}
                    p={4}
                    borderRadius="xl"
                    bg={generateColor(word.value)}
                    position="relative"
                    cursor="pointer"
                  >
                    <Flex justify="space-between" align="flex-start" gap={4}>
                      <Box flex={1}>
                        <HStack spacing={2} mb={2} wrap="wrap">
                          <Text fontSize="xl" fontWeight="bold" color="white">
                            {word.value}
                          </Text>
                          <Badge colorScheme={word.status === 2 ? 'green' : word.status === 0 ? 'orange' : 'blue'} variant="subtle">
                            {statusLabelMap[word.status] || 'New'}
                          </Badge>
                          {isDueForReview(word) && (
                            <Badge colorScheme="red" variant="solid">Due</Badge>
                          )}
                        </HStack>

                        <ProgressIndicator score={score} size="sm" showLabel showBadge />

                        <HStack spacing={2} mt={3} wrap="wrap">
                          <Badge variant="subtle" colorScheme="blue">Reviews {word.reviewCount}</Badge>
                          <Badge variant="subtle" colorScheme="orange">Lapses {word.lapseCount}</Badge>
                          <Badge variant="subtle" colorScheme="teal">Stability {word.stability.toFixed(1)}</Badge>
                          {isDueReview && word.sourceListNames?.map((sourceListName) => (
                            <Badge key={`${word.id}-${sourceListName}`} variant="subtle" colorScheme="yellow">
                              {sourceListName}
                            </Badge>
                          ))}
                        </HStack>

                        <Text color="gray.200" fontSize="md" mt={3} noOfLines={selectedWord === word.id ? undefined : 1}>
                          {word.meaning}
                        </Text>
                        {startedReviewFlow && (
                          masteredForever ? (
                            <Flex mt={2} align="center" color="green.300">
                              <Icon as={CheckCircleIcon} boxSize={4} />
                            </Flex>
                          ) : nextReviewDate ? (
                            <Text color="gray.400" fontSize="sm" mt={2}>
                              {nextReviewDate}
                            </Text>
                          ) : null
                        )}
                      </Box>

                      <Box
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          setSelectedWord(word.id);
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation();
                          if (selectedWord !== word.id) {
                            setSelectedWord(null);
                          }
                        }}
                      >
                        {!isSystemList && (
                          <IconButton
                            aria-label={UI.deleteWordAria}
                            icon={<DeleteIcon />}
                            variant="ghost"
                            colorScheme="red"
                            opacity={selectedWord === word.id ? 1 : 0.2}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteWord(word.id);
                            }}
                          />
                        )}
                      </Box>
                    </Flex>
                  </MotionBox>
                );
              })}
            </SimpleGrid>
          )}
        </Box>

        <AddWordModal
          isOpen={isOpen}
          onClose={onClose}
          onAddWord={handleAddWord}
          listName={list?.name || ''}
        />

        <BulkImportWordsModal
          isOpen={isBulkImportOpen}
          onClose={onBulkImportClose}
          onImport={handleBulkImportWords}
        />

        <Modal isOpen={isReadingModalOpen} onClose={onReadingModalClose} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{UI.readingModalTitle}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4} align="stretch">
                <Text fontSize="sm" color="gray.400">
                  {UI.readingModalHint}
                </Text>

                <FormControl>
                  <FormLabel>{UI.readingLevelLabel}</FormLabel>
                  <Select value={lightReadingLevel} onChange={(e) => setLightReadingLevel(e.target.value as 'beginner' | 'intermediate' | 'advanced')}>
                    <option value="beginner">{UI.readingLevelBeginner}</option>
                    <option value="intermediate">{UI.readingLevelIntermediate}</option>
                    <option value="advanced">{UI.readingLevelAdvanced}</option>
                  </Select>
                </FormControl>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onReadingModalClose}>
                {UI.cancel}
              </Button>
              <Button colorScheme="purple" onClick={handleGenerateLightReading} isLoading={generatingReading}>
                {generatingReading ? '生成中...' : '生成阅读'}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </MotionBox>
    </Container>
  );
};
