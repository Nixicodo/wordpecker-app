import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Textarea,
  VStack,
  Text,
  Box,
  Flex,
  Icon,
  List,
  ListItem,
  Badge
} from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { FaFileImport } from 'react-icons/fa';

interface BulkImportWordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (words: Array<{ word: string; meaning?: string }>) => Promise<void>;
}

const parseLines = (rawText: string) => {
  const lines = rawText.split(/\r?\n/);
  const words: Array<{ word: string; meaning?: string }> = [];
  const invalidLines: number[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const matched = trimmed.match(/^(.+?)(?:\s*[,|:：\t]\s*)(.+)$/);
    if (matched) {
      const word = matched[1].trim();
      const meaning = matched[2].trim();
      if (!word) {
        invalidLines.push(index + 1);
        return;
      }
      words.push({ word, ...(meaning ? { meaning } : {}) });
      return;
    }

    if (!trimmed) {
      invalidLines.push(index + 1);
      return;
    }
    words.push({ word: trimmed });
  });

  return { words, invalidLines };
};

export const BulkImportWordsModal = ({ isOpen, onClose, onImport }: BulkImportWordsModalProps) => {
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsed = useMemo(() => parseLines(inputText), [inputText]);

  const handleClose = () => {
    setInputText('');
    onClose();
  };

  const handleImport = async () => {
    if (parsed.words.length === 0 || parsed.invalidLines.length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onImport(parsed.words);
      setInputText('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg="slate.800" borderWidth="1px" borderColor="slate.700">
        <ModalHeader>
          <Flex align="center" gap={2}>
            <Icon as={FaFileImport} color="green.300" />
            <Text>批量导入单词</Text>
          </Flex>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Box p={3} borderRadius="md" bg="slate.700">
              <Text fontSize="sm" color="gray.200" mb={2}>
                每行一个单词，支持以下格式：
              </Text>
              <List spacing={1} fontSize="sm" color="gray.300">
                <ListItem>`word`（只填单词，释义自动生成）</ListItem>
                <ListItem>`word, 中文释义`</ListItem>
                <ListItem>`word: 中文释义` 或 `word|中文释义`</ListItem>
              </List>
            </Box>

            <FormControl>
              <FormLabel color="gray.200">导入内容</FormLabel>
              <Textarea
                minH="220px"
                placeholder={'apple, 苹果\nbanana: 香蕉\nwatermelon'}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                bg="slate.700"
                borderColor="slate.600"
                _hover={{ borderColor: 'slate.500' }}
                _focus={{ borderColor: 'brand.400', boxShadow: 'none' }}
              />
            </FormControl>

            <Flex align="center" gap={2} flexWrap="wrap">
              <Badge colorScheme="green">可导入 {parsed.words.length} 条</Badge>
              {parsed.invalidLines.length > 0 && (
                <Badge colorScheme="red">
                  第 {parsed.invalidLines.join('、')} 行格式无效
                </Badge>
              )}
            </Flex>
          </VStack>
        </ModalBody>

        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button
            variant="solid"
            colorScheme="green"
            leftIcon={<FaFileImport />}
            onClick={handleImport}
            isLoading={isSubmitting}
            loadingText="正在导入"
            isDisabled={parsed.words.length === 0 || parsed.invalidLines.length > 0}
          >
            开始导入
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
