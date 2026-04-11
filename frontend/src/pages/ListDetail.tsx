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
  VStack
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Word, WordList } from '../types';
import { ArrowBackIcon, DeleteIcon } from '@chakra-ui/icons';
import { FaGraduationCap, FaGamepad, FaPlus, FaBookOpen, FaMicrophone, FaFileImport } from 'react-icons/fa';
import { GiTreeBranch } from 'react-icons/gi';
import { AddWordModal } from '../components/AddWordModal';
import { BulkImportWordsModal } from '../components/BulkImportWordsModal';
import { ProgressIndicator, OverallProgress } from '../components/ProgressIndicator';
// Voice agent modal component removed - now using dedicated page
import { apiService } from '../services/api';
import { UserPreferences } from '../types';

// Animation keyframes removed for build compatibility

// Dynamic color generator
const generateColor = (word: string) => {
  // Generate a hue based on the word's characters
  const hue = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  // Use fixed saturation and lightness for consistency
  return `hsl(${hue}, 70%, 25%)`;
};

// Generate hover color (slightly lighter version)
const generateHoverColor = (word: string) => {
  if (!word) return `hsl(0, 70%, 30%)`;
  const hue = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 70%, 30%)`;
};

const MotionBox = motion(Box);

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
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
  emptyHint: '你的词树还是空的，先添加一些单词让它长起来吧。🌱',
  emptyPrimaryButton: '添加第一个单词',
  deleteWordAria: '删除单词',
  readingModalTitle: '生成轻阅读',
  readingModalHint: '根据词树中的单词生成一篇个性化短文，请选择难度：',
  readingLevelLabel: '阅读难度',
  readingLevelBeginner: '初级 - 简短句子与基础词汇',
  readingLevelIntermediate: '中级 - 自然表达与适中复杂度',
  readingLevelAdvanced: '高级 - 复杂句式与更地道表达',
  cancel: '取消',
  generateReading: '生成阅读',
  creatingReading: '生成中...',
  bulkImportSuccess: '批量导入完成',
  bulkImportFail: '批量导入失败',
  bulkImportResult: (imported: number, skipped: number, failed: number) =>
    `成功 ${imported} 条，跳过 ${skipped} 条，失败 ${failed} 条。`
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
  
  const { 
    isOpen: isReadingModalOpen, 
    onOpen: onReadingModalOpen, 
    onClose: onReadingModalClose 
  } = useDisclosure();

  // Voice agent modal state removed - now using dedicated page

  useEffect(() => {
    const fetchListDetails = async () => {
      if (!id) return;
      
      try {
        // Fetch list details, words, and user preferences in parallel
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
          isClosable: true,
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
      setWords(prevWords => [newWord, ...prevWords]);
      toast({
        title: UI.addedWordTitle,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onClose();
    } catch (error) {
      console.error('添加单词失败:', error);
      toast({
        title: UI.errorAddWordTitle,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleDeleteWord = async (wordId: string) => {
    try {
      await apiService.deleteWord(id!, wordId);
      setWords(prevWords => prevWords.filter(word => word.id !== wordId));
      toast({
        title: UI.deletedWordTitle,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('删除单词失败:', error);
      toast({
        title: UI.errorDeleteWordTitle,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleBulkImportWords = async (entries: Array<{ word: string; meaning?: string }>) => {
    if (!id || entries.length === 0) return;

    try {
      const result = await apiService.bulkAddWords(id, entries);
      if (result.imported.length > 0) {
        setWords(prevWords => [...result.imported, ...prevWords]);
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
        isClosable: true,
      });
      onBulkImportClose();
    } catch (error) {
      console.error('批量导入单词失败:', error);
      toast({
        title: UI.bulkImportFail,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true,
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
        isClosable: true,
      });
      navigate('/lists');
    } catch (error) {
      console.error('删除词树失败:', error);
      toast({
        title: UI.errorDeleteListTitle,
        description: UI.errorLoadListDescription,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleGenerateLightReading = async () => {
    if (!id || words.length === 0) return;
    
    setGeneratingReading(true);
    try {
      const reading = await apiService.generateLightReading(id, lightReadingLevel);
      
      // Navigate to a new reading page with the generated content
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
        isClosable: true,
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
          <Button 
            onClick={() => navigate('/lists')} 
            mt={4}
            colorScheme="green"
          >
            {UI.backToLists}
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8} px={{ base: 4, md: 8 }}>
      <MotionBox
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        transition={{ duration: 0.5 }}
        p={4}
      >
        <Flex mb={6} justify="space-between" align="center">
          <Flex align="center" gap={2}>
            <IconButton
              aria-label="返回上一页"
              icon={<ArrowBackIcon />}
              variant="ghost"
              onClick={() => navigate(-1)}
              size="lg"
              _hover={{
                transform: 'translateY(-2px)',
                color: 'green.400'
              }}
              transition="all 0.2s"
            />
            <Heading 
              as="h1" 
              size="xl"
              bgGradient="linear(to-r, green.400, brand.400)"
              bgClip="text"
              display="flex"
              alignItems="center"
              gap={2}
            >
              <Icon 
                as={GiTreeBranch} 
                color="green.400"
                style={{ animation: 'sparkle 3s ease infinite' }}
              />
              {isMistakeBook ? '错题本' : list.name}
            </Heading>
          </Flex>
          {!isMistakeBook && (
            <IconButton
              aria-label="删除词树"
              icon={<DeleteIcon />}
              variant="ghost"
              colorScheme="red"
              onClick={handleDeleteList}
              size="lg"
              _hover={{
                bg: 'red.900',
                transform: 'scale(1.1)'
              }}
              transition="all 0.2s"
            />
          )}
        </Flex>

        {/* Overall Progress Section */}
        {words.length > 0 && (
          <Box mb={6}>
            <OverallProgress words={words} size="md" />
          </Box>
        )}
        
        <Flex 
          justify="space-between" 
          align="center" 
          mb={6}
          direction={{ base: 'column', md: 'row' }}
          gap={4}
        >
          <Box maxW="container.md">
            <Text color="gray.400" fontSize="lg">
              {isMistakeBook
                ? '这里会自动收集你在其他词树里答错过的单词。答对得越多，它们在后续练习里的出现频率就越低。'
                : list.description}
            </Text>
            {list.context && (
              <Text color="gray.500" fontSize="md" mt={2}>
                {UI.contextPrefix} {list.context}
              </Text>
            )}
          </Box>
          <Flex gap={3} flexWrap="wrap" justify={{ base: 'center', md: 'flex-end' }}>
            <Button 
              variant="ghost" 
              leftIcon={<FaGraduationCap />}
              colorScheme="green"
              _hover={{ 
                transform: 'translateY(-2px)',
              }}
              transition="all 0.2s"
              size="lg"
              isDisabled={words.length === 0}
              onClick={() => navigate(`/learn/${list!.id}`, { state: { list } })}
            >
              {UI.actionLearn}
            </Button>
            <Button 
              variant="ghost"
              leftIcon={<FaGamepad />}
              colorScheme="orange"
              _hover={{ 
                transform: 'translateY(-2px)',
              }}
              transition="all 0.2s"
              size="lg"
              isDisabled={words.length === 0}
              onClick={() => navigate(`/quiz/${list!.id}`, { state: { list } })}
            >
              {UI.actionQuiz}
            </Button>
            <Button 
              variant="ghost"
              leftIcon={<FaBookOpen />}
              colorScheme="purple"
              _hover={{ 
                transform: 'translateY(-2px)',
              }}
              transition="all 0.2s"
              size="lg"
              isDisabled={words.length === 0}
              onClick={onReadingModalOpen}
            >
              {UI.actionLightReading}
            </Button>
            <Button 
              variant="ghost"
              leftIcon={<FaMicrophone />}
              colorScheme="blue"
              _hover={{ 
                transform: 'translateY(-2px)',
              }}
              transition="all 0.2s"
              size="lg"
              isDisabled={words.length === 0}
              onClick={() => navigate(`/voice-chat/${list!.id}`, { 
                state: { 
                  config: {
                    listId: list!.id,
                    listName: list!.name,
                    listContext: list!.context,
                    userLanguages: {
                      baseLanguage: userPreferences?.baseLanguage || 'English',
                      targetLanguage: userPreferences?.targetLanguage || 'English'
                    }
                  },
                  listName: list!.name
                } 
              })}
            >
              {UI.actionVoiceChat}
            </Button>
            {!isMistakeBook && (
              <Button
                variant="outline"
                colorScheme="green"
                leftIcon={<FaFileImport />}
                _hover={{
                  transform: 'translateY(-2px)',
                }}
                transition="all 0.2s"
                size="lg"
                onClick={onBulkImportOpen}
              >
                {UI.actionBulkImport}
              </Button>
            )}
            {!isMistakeBook && (
              <Button 
                variant="solid"
                colorScheme="green"
                leftIcon={<FaPlus />}
                _hover={{ 
                  transform: 'translateY(-2px)',
                }}
                transition="all 0.2s"
                size="lg"
                onClick={onOpen}
              >
                {UI.actionAddWord}
              </Button>
            )}
          </Flex>
        </Flex>

        <Box 
          bg="slate.800"
          borderRadius="xl"
          borderWidth="1px"
          borderColor="slate.700"
          overflow="hidden"
          _hover={{ borderColor: 'slate.600' }}
          transition="all 0.2s"
        >
          {words.length === 0 ? (
            <Flex 
              direction="column" 
              align="center" 
              gap={4} 
              py={12}
              px={4}
            >
              <Icon 
                as={GiTreeBranch} 
                boxSize={12} 
                color="green.400" 
                style={{ animation: 'sparkle 3s ease infinite' }}
              />
              <Text color="gray.400" fontSize="lg" textAlign="center">
                {UI.emptyHint}
              </Text>
              {!isMistakeBook && (
                <Button
                  variant="outline"
                  colorScheme="green"
                  leftIcon={<FaPlus />}
                  onClick={onOpen}
                  size="lg"
                  _hover={{
                    transform: 'translateY(-2px)',
                  }}
                  transition="all 0.2s"
                >
                  {UI.emptyPrimaryButton}
                </Button>
              )}
            </Flex>
          ) : (
            <Box p={4}>
              {words.map((word: Word, index: number) => (
                <MotionBox
                  key={word.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ 
                    x: 10,
                    backgroundColor: generateHoverColor(word.value),
                  }}
                  transition={{ 
                    duration: 0.3, 
                    delay: index * 0.1,
                    type: "tween",
                    ease: "easeOut"
                  }}
                  onClick={() => navigate(`/words/${word.id}`)}
                  p={4}
                  mb={2}
                  borderRadius="lg"
                  bg={generateColor(word.value)}
                  position="relative"
                  cursor="pointer"
                >
                  <Flex justify="space-between" align="center">
                    <Box w="full">
                      <Text 
                        fontSize="xl" 
                        fontWeight="bold" 
                        color="white"
                        mb={2}
                      >
                        {word.value}
                      </Text>
                      
                      {/* Progress Indicator */}
                      <Box mb={selectedWord === word.id ? 3 : 2}>
                        <ProgressIndicator 
                          learnedPoint={word.learnedPoint || 0} 
                          size="sm" 
                          showLabel={true}
                          showBadge={true}
                        />
                      </Box>
                      
                      {selectedWord === word.id && (
                        <Text 
                          color="gray.200" 
                          fontSize="md"
                          transition="all 0.3s"
                        >
                          {word.meaning}
                        </Text>
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
                      {!isMistakeBook && (
                        <IconButton
                          aria-label={UI.deleteWordAria}
                          icon={<DeleteIcon />}
                          variant="ghost"
                          colorScheme="red"
                          opacity={selectedWord === word.id ? 1 : 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteWord(word.id);
                          }}
                          _hover={{
                            transform: 'scale(1.1)',
                          }}
                          transition="all 0.2s"
                        />
                      )}
                    </Box>
                  </Flex>
                </MotionBox>
              ))}
            </Box>
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

        {/* Light Reading Level Selection Modal */}
        <Modal isOpen={isReadingModalOpen} onClose={onReadingModalClose} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>
              <Flex align="center" gap={2}>
                <FaBookOpen color="purple" />
                <Text color="purple.400">{UI.readingModalTitle}</Text>
              </Flex>
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4} align="stretch">
                <Text fontSize="sm" color="gray.400">
                  {UI.readingModalHint}
                </Text>
                
                <FormControl>
                  <FormLabel color="purple.300">{UI.readingLevelLabel}</FormLabel>
                  <Select 
                    value={lightReadingLevel} 
                    onChange={(e) => setLightReadingLevel(e.target.value as 'beginner' | 'intermediate' | 'advanced')}
                    bg="slate.700"
                    borderColor="slate.600"
                    _focus={{ borderColor: 'purple.400' }}
                  >
                    <option value="beginner">{UI.readingLevelBeginner}</option>
                    <option value="intermediate">{UI.readingLevelIntermediate}</option>
                    <option value="advanced">{UI.readingLevelAdvanced}</option>
                  </Select>
                </FormControl>

                <Box p={3} bg="purple.50" borderRadius="md" borderLeft="4px solid" borderColor="purple.400">
                  <Text fontSize="sm" color="purple.700">
                    本次将随机选取 {Math.min(12, words.length)} 个单词生成轻阅读
                    {words.length > 12 && `（共 ${words.length} 个）`}
                    {list?.context && `，并结合学习场景「${list.context}」`}
                    。
                  </Text>
                </Box>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onReadingModalClose}>
                {UI.cancel}
              </Button>
              <Button
                colorScheme="purple"
                onClick={handleGenerateLightReading}
                isLoading={generatingReading}
                loadingText={UI.creatingReading}
                leftIcon={<FaBookOpen />}
              >
                {UI.generateReading}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Voice Agent Modal removed - now using dedicated page at /voice-chat/:listId */}
      </MotionBox>
    </Container>
  );
}; 


