import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Icon,
  Text,
  VStack,
  Badge,
  SimpleGrid,
  useToast,
  Spinner,
  Center,
  Input,
  Select,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  HStack,
  Wrap,
  WrapItem,
  Divider
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { GiBookshelf, GiFeather } from 'react-icons/gi';
import { FaSearch, FaClone, FaStar, FaFilter, FaTags } from 'react-icons/fa';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Template } from '../types';
import { apiService } from '../services/api';

const MotionBox = motion(Box);

const UI = {
  title: '\u6a21\u677f\u5e93',
  subtitle: '\u53d1\u73b0\u5e76\u590d\u5236\u7ecf\u8fc7\u7cbe\u5fc3\u6574\u7406\u7684\u8bcd\u6c47\u5217\u8868\u3002',
  loadErrorTitle: '\u52a0\u8f7d\u6a21\u677f\u5931\u8d25',
  retryLater: '\u8bf7\u7a0d\u540e\u91cd\u8bd5',
  previewErrorTitle: '\u52a0\u8f7d\u6a21\u677f\u8be6\u60c5\u5931\u8d25',
  cloneSuccessTitle: '\u6a21\u677f\u590d\u5236\u6210\u529f',
  cloneSuccessDescriptionSuffix: '\u5df2\u52a0\u5165\u4f60\u7684\u8bcd\u8868',
  cloneErrorTitle: '\u590d\u5236\u6a21\u677f\u5931\u8d25',
  searchPlaceholder: '\u641c\u7d22\u6a21\u677f\u3001\u63cf\u8ff0\u6216\u6807\u7b7e\u2026\u2026',
  allCategories: '\u5168\u90e8\u5206\u7c7b',
  allDifficulties: '\u5168\u90e8\u96be\u5ea6',
  beginner: '\u521d\u7ea7',
  intermediate: '\u4e2d\u7ea7',
  advanced: '\u9ad8\u7ea7',
  featured: '\u7cbe\u9009',
  foundPrefix: '\u627e\u5230 ',
  templatesUnit: '\u4e2a\u6a21\u677f',
  totalWordsPrefix: '\u603b\u5355\u8bcd\u6570\uff1a',
  wordsUnit: '\u4e2a\u5355\u8bcd',
  clonesUnit: '\u6b21\u590d\u5236',
  clickPreview: '\u70b9\u51fb\u9884\u89c8',
  noMatch: '\u6ca1\u6709\u627e\u5230\u7b26\u5408\u6761\u4ef6\u7684\u6a21\u677f',
  clearFilters: '\u6e05\u7a7a\u7b5b\u9009',
  context: '\u573a\u666f\uff1a',
  tags: '\u6807\u7b7e\uff1a',
  wordsTitlePrefix: '\u5355\u8bcd\uff08',
  wordsTitleSuffix: '\uff09\uff1a',
  customListName: '\u81ea\u5b9a\u4e49\u8bcd\u8868\u540d\u79f0\uff1a',
  customListPlaceholder: '\u8f93\u5165\u590d\u5236\u540e\u7684\u8bcd\u8868\u540d\u79f0',
  cancel: '\u53d6\u6d88',
  cloning: '\u6b63\u5728\u590d\u5236\u2026\u2026',
  cloneTemplate: '\u590d\u5236\u6a21\u677f',
  copySuffix: '\uff08\u526f\u672c\uff09',
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'business': return '\ud83d\udcbc';
    case 'academic': return '\ud83c\udf93';
    case 'science': return '\ud83d\udd2c';
    case 'travel': return '\u2708\ufe0f';
    case 'health': return '\ud83e\ude7a';
    case 'general': return '\ud83d\udcd6';
    default: return '\ud83d\udcda';
  }
};

const categoryZhMap: Record<string, string> = {
  business: '商业',
  academic: '学术',
  science: '科学',
  travel: '旅行',
  health: '健康',
  general: '通用',
  technology: '科技',
  entertainment: '娱乐',
  social: '社交',
  legal: '法律',
  sports: '运动',
  arts: '艺术',
  cooking: '烹饪',
  psychology: '心理',
  environment: '环境',
};

const difficultyZhMap: Record<string, string> = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级',
};

const templateNameZhMap: Record<string, string> = {
  'Sherlock Holmes Vocabulary': '福尔摩斯词汇',
  'Digital Communications & Social Media Strategy': '数字传播与社媒策略',
  'Star Wars Vocabulary': '星球大战词汇',
  'Sophisticated Daily Communication': '高阶日常沟通',
  'Game of Thrones Vocabulary': '权力的游戏词汇',
};

const templateDescriptionZhMap: Record<string, string> = {
  'English vocabulary words learned from Sherlock Holmes stories': '从福尔摩斯故事中学习的英语词汇。',
  'Advanced vocabulary for digital marketing, social media strategy, content creation, and online engagement analytics.': '覆盖数字营销、社媒策略、内容创作与互动分析的高级词汇。',
  'English vocabulary words learned from Star Wars': '从《星球大战》场景中学习的英语词汇。',
  'Elevated vocabulary for articulate conversation, nuanced expression, and eloquent daily discourse.': '用于清晰表达、细腻措辞与日常高质量交流的提升词汇。',
  'English vocabulary words learned from Game of Thrones': '从《权力的游戏》场景中学习的英语词汇。',
};

const getLocalizedCategory = (category: string): string => {
  return categoryZhMap[category.toLowerCase()] ?? category;
};

const getLocalizedDifficulty = (difficulty: string): string => {
  return difficultyZhMap[difficulty.toLowerCase()] ?? difficulty;
};

const getLocalizedTemplateName = (name: string): string => {
  return templateNameZhMap[name] ?? name;
};

const getLocalizedTemplateDescription = (description: string): string => {
  return templateDescriptionZhMap[description] ?? description;
};

const normalizeTag = (tag: string): string => {
  return tag.replace(/[_-]/g, ' ').trim();
};

const getLocalizedTag = (tag: string): string => {
  const tagMap: Record<string, string> = {
    business: '商业',
    finance: '金融',
    corporate: '企业',
    strategy: '战略',
    communication: '沟通',
    conversation: '会话',
    social: '社交',
    daily: '日常',
    travel: '旅行',
    culture: '文化',
    tourism: '旅游',
    adventure: '冒险',
    science: '科学',
    technology: '科技',
    innovation: '创新',
    legal: '法律',
    medical: '医学',
    psychology: '心理',
    environment: '环境',
    sports: '运动',
    movies: '电影',
    literature: '文学',
    fantasy: '奇幻',
    detective: '侦探',
    mystery: '悬疑',
  };
  const key = normalizeTag(tag).toLowerCase();
  return tagMap[key] ?? tag;
};

export const TemplateLibrary = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCloning, setIsCloning] = useState(false);
  const [customName, setCustomName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [showFeatured, setShowFeatured] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [templatesData, categoriesData] = await Promise.all([
          apiService.getTemplates(),
          apiService.getCategories()
        ]);
        setTemplates(templatesData);
        setCategories(categoriesData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({ title: UI.loadErrorTitle, description: UI.retryLater, status: 'error', duration: 5000, isClosable: true });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  const filteredTemplates = templates.filter((template) => {
    const localizedName = getLocalizedTemplateName(template.name).toLowerCase();
    const localizedDescription = getLocalizedTemplateDescription(template.description).toLowerCase();
    const localizedTags = template.tags.map(tag => getLocalizedTag(tag).toLowerCase());
    const searchValue = searchTerm.toLowerCase();

    const matchesSearch = !searchTerm
      || template.name.toLowerCase().includes(searchValue)
      || template.description.toLowerCase().includes(searchValue)
      || localizedName.includes(searchValue)
      || localizedDescription.includes(searchValue)
      || template.tags.some(tag => tag.toLowerCase().includes(searchValue))
      || localizedTags.some(tag => tag.includes(searchValue));
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'all' || template.difficulty === selectedDifficulty;
    const matchesFeatured = !showFeatured || template.featured;
    return matchesSearch && matchesCategory && matchesDifficulty && matchesFeatured;
  });

  const handleViewTemplate = async (template: Template) => {
    try {
      const fullTemplate = await apiService.getTemplate(template.id);
      setSelectedTemplate(fullTemplate);
      setCustomName(`${fullTemplate.name}${UI.copySuffix}`);
      onOpen();
    } catch (error) {
      console.error('Error fetching template details:', error);
      toast({ title: UI.previewErrorTitle, description: UI.retryLater, status: 'error', duration: 5000, isClosable: true });
    }
  };

  const handleCloneTemplate = async () => {
    if (!selectedTemplate) return;
    setIsCloning(true);
    try {
      const newList = await apiService.cloneTemplate(selectedTemplate.id, customName);
      toast({
        title: UI.cloneSuccessTitle,
        description: `"${newList.name}" ${UI.cloneSuccessDescriptionSuffix}`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      onClose();
      navigate(`/lists/${newList.id}`);
    } catch (error) {
      console.error('Error cloning template:', error);
      toast({ title: UI.cloneErrorTitle, description: UI.retryLater, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setIsCloning(false);
    }
  };

  if (isLoading) {
    return <Center h="calc(100vh - 64px)"><Spinner size="xl" color="blue.500" thickness="4px" /></Center>;
  }

  return (
    <Container maxW="container.xl" py={8} px={{ base: 4, md: 8 }}>
      <VStack spacing={8} align="stretch">
        <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} direction={{ base: 'column', md: 'row' }} gap={4}>
          <Box>
            <Heading as="h1" size="2xl" color="#1890FF" display="flex" alignItems="center" gap={3}>
              <Icon as={GiBookshelf} boxSize={10} color="#1890FF" style={{ animation: 'sparkle 3s ease infinite' }} />
              {UI.title}
            </Heading>
            <Text mt={2} color="gray.400" fontSize="lg">{UI.subtitle}</Text>
          </Box>
        </Flex>

        <Box bg="slate.800" p={6} borderRadius="xl" borderWidth="1px" borderColor="slate.700">
          <VStack spacing={4}>
            <Flex w="full" gap={4} direction={{ base: 'column', md: 'row' }} align="center">
              <Icon as={FaFilter} color="blue.400" />
              <InputGroup flex={1}>
                <InputLeftElement pointerEvents="none"><Icon as={FaSearch} color="gray.400" /></InputLeftElement>
                <Input placeholder={UI.searchPlaceholder} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} bg="slate.700" border="none" _focus={{ boxShadow: '0 0 0 2px rgba(66, 153, 225, 0.6)' }} />
              </InputGroup>
            </Flex>
            <Flex w="full" gap={4} direction={{ base: 'column', sm: 'row' }} align="center">
              <Select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} bg="slate.700" border="none" flex={1}>
                <option value="all">{UI.allCategories}</option>
                {categories.map(category => <option key={category} value={category}>{getCategoryIcon(category)} {getLocalizedCategory(category)}</option>)}
              </Select>
              <Select value={selectedDifficulty} onChange={(e) => setSelectedDifficulty(e.target.value)} bg="slate.700" border="none" flex={1}>
                <option value="all">{UI.allDifficulties}</option>
                <option value="beginner">{`\ud83c\udf31 ${UI.beginner}`}</option>
                <option value="intermediate">{`\ud83c\udf33 ${UI.intermediate}`}</option>
                <option value="advanced">{`\ud83e\udd85 ${UI.advanced}`}</option>
              </Select>
              <Button leftIcon={<Icon as={FaStar} />} colorScheme={showFeatured ? 'yellow' : 'gray'} variant={showFeatured ? 'solid' : 'outline'} onClick={() => setShowFeatured(!showFeatured)} size="md">{UI.featured}</Button>
            </Flex>
          </VStack>
        </Box>

        <Flex justify="space-between" align="center">
          <Text color="gray.400">{`${UI.foundPrefix}${filteredTemplates.length}${UI.templatesUnit}`}</Text>
          {filteredTemplates.length > 0 && <Text color="gray.500" fontSize="sm">{`${UI.totalWordsPrefix}${filteredTemplates.reduce((sum, t) => sum + (t.wordCount || 0), 0)}`}</Text>}
        </Flex>

        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6} as={motion.div} variants={container} initial="hidden" animate="show">
          {filteredTemplates.map((template) => (
            <MotionBox key={template.id} variants={item} whileHover={{ y: -5, transition: { duration: 0.2 } }}>
              <Box layerStyle="card" h="full" position="relative" overflow="hidden" borderWidth="1px" borderColor="slate.600" _hover={{ borderColor: 'slate.500', shadow: 'lg' }} transition="all 0.3s" p={5} borderRadius="xl" cursor="pointer" onClick={() => handleViewTemplate(template)} minH="320px">
                <VStack spacing={4} h="full" align="stretch">
                  <Box>
                    <Flex justify="space-between" align="flex-start" mb={3}>
                      <Flex align="center" gap={2} flex={1} pr={3}>
                        <Text fontSize="2xl">{getCategoryIcon(template.category)}</Text>
                        <VStack align="flex-start" spacing={1} flex={1}>
                          <Text fontWeight="bold" fontSize="lg" color="white" noOfLines={1} lineHeight="1.2">{getLocalizedTemplateName(template.name)}</Text>
                          <Badge bg="slate.600" color="gray.300" variant="solid" size="sm">{getLocalizedCategory(template.category)}</Badge>
                        </VStack>
                      </Flex>
                      <VStack spacing={1} align="flex-end" flexShrink={0} w="100px">
                        <Badge bg="slate.600" color="gray.300" variant="solid" fontSize="xs" px={2} py={1} w="full" textAlign="center">{`${template.wordCount} ${UI.wordsUnit}`}</Badge>
                        <Badge bg="slate.600" color="gray.300" variant="solid" fontSize="xs" px={2} py={1} w="full" textAlign="center">{getLocalizedDifficulty(template.difficulty)}</Badge>
                      </VStack>
                    </Flex>
                    <Text color="gray.400" fontSize="sm" noOfLines={3} lineHeight="1.4" mb={3}>{getLocalizedTemplateDescription(template.description)}</Text>
                  </Box>
                  <Box flex={1}>
                    {template.tags.length > 0 && <Wrap spacing={1}>{template.tags.slice(0, 4).map(tag => <WrapItem key={tag}><Badge size="sm" bg="slate.600" color="gray.300" variant="solid" fontSize="xs">{getLocalizedTag(tag)}</Badge></WrapItem>)}{template.tags.length > 4 && <WrapItem><Badge size="sm" bg="slate.600" color="gray.300" variant="solid" fontSize="xs">+{template.tags.length - 4}</Badge></WrapItem>}</Wrap>}
                  </Box>
                  <Box mt="auto" pt={2} borderTop="1px" borderColor="slate.700">
                    <Flex justify="space-between" align="center">
                      <Flex align="center" gap={1}><Icon as={FaClone} color="gray.500" boxSize={3} /><Text color="gray.500" fontSize="xs">{`${template.cloneCount} ${UI.clonesUnit}`}</Text></Flex>
                      <Text color="gray.500" fontSize="xs">{UI.clickPreview}</Text>
                    </Flex>
                  </Box>
                </VStack>
              </Box>
            </MotionBox>
          ))}
        </SimpleGrid>

        {filteredTemplates.length === 0 && (
          <Center py={12}>
            <VStack spacing={4}>
              <Icon as={GiFeather} boxSize={12} color="gray.400" />
              <Text color="gray.400" fontSize="lg" textAlign="center">{UI.noMatch}</Text>
              <Button colorScheme="blue" variant="outline" onClick={() => { setSearchTerm(''); setSelectedCategory('all'); setSelectedDifficulty('all'); setShowFeatured(false); }}>{UI.clearFilters}</Button>
            </VStack>
          </Center>
        )}
      </VStack>

      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent bg="slate.800" color="white">
          <ModalHeader>
            <Flex align="center" gap={3}>
              <Text fontSize="2xl">{selectedTemplate && getCategoryIcon(selectedTemplate.category)}</Text>
              <Box>
                <Text>{selectedTemplate ? getLocalizedTemplateName(selectedTemplate.name) : ''}</Text>
                <HStack spacing={2} mt={1}><Badge bg="slate.600" color="gray.300">{selectedTemplate ? getLocalizedDifficulty(selectedTemplate.difficulty) : ''}</Badge><Badge bg="slate.600" color="gray.300">{selectedTemplate ? getLocalizedCategory(selectedTemplate.category) : ''}</Badge></HStack>
              </Box>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Text color="gray.300">{selectedTemplate ? getLocalizedTemplateDescription(selectedTemplate.description) : ''}</Text>
              {selectedTemplate?.context && <Box><Text fontWeight="bold" mb={2}>{UI.context}</Text><Text color="gray.400" fontSize="sm">{selectedTemplate.context}</Text></Box>}
              <Divider />
              <Box>
                <Text fontWeight="bold" mb={2}><Icon as={FaTags} mr={2} />{UI.tags}</Text>
                <Wrap spacing={2}>{selectedTemplate?.tags.map(tag => <WrapItem key={tag}><Badge bg="slate.600" color="gray.300">{getLocalizedTag(tag)}</Badge></WrapItem>)}</Wrap>
              </Box>
              <Divider />
              <Box>
                <Text fontWeight="bold" mb={3}>{`${UI.wordsTitlePrefix}${selectedTemplate?.words?.length}${UI.wordsTitleSuffix}`}</Text>
                <Box maxH="200px" overflowY="auto"><VStack spacing={2} align="stretch">{selectedTemplate?.words?.map((word, index) => <Box key={index} p={3} bg="slate.700" borderRadius="md"><Text fontWeight="bold" color="blue.300">{word.value}</Text><Text color="gray.400" fontSize="sm">{word.meaning}</Text></Box>)}</VStack></Box>
              </Box>
              <Divider />
              <Box><Text fontWeight="bold" mb={2}>{UI.customListName}</Text><Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={UI.customListPlaceholder} bg="slate.700" border="none" /></Box>
            </VStack>
          </ModalBody>
          <ModalFooter><Button variant="ghost" mr={3} onClick={onClose}>{UI.cancel}</Button><Button colorScheme="blue" leftIcon={<Icon as={FaClone} />} onClick={handleCloneTemplate} isLoading={isCloning} loadingText={UI.cloning}>{UI.cloneTemplate}</Button></ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
};
