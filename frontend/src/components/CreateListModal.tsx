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
  Input,
  Textarea,
  VStack,
  useToast,
  Text,
  Box,
  Tooltip,
  Flex,
  Icon
} from '@chakra-ui/react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { InfoIcon } from '@chakra-ui/icons';
import { GiTreeBranch, GiTreeRoots } from 'react-icons/gi';
import { detectUiLocale } from '../i18n/ui';

const MotionBox = motion(Box);

interface CreateListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateList: (name: string, description: string, context: string) => Promise<void>;
}

export const CreateListModal = ({ isOpen, onClose, onCreateList }: CreateListModalProps) => {
  const isZh = detectUiLocale() === 'zh-CN';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: isZh ? '请输入词表名称' : 'Name is required',
        status: 'error',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    setIsLoading(true);
    try {
      await onCreateList(name, description, context);
      toast({
        title: isZh ? '词表创建成功' : 'List created successfully!',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      onClose();
      setName('');
      setDescription('');
      setContext('');
    } catch (error) {
      toast({
        title: isZh ? '创建词表失败' : 'Failed to create list',
        description: error instanceof Error ? error.message : (isZh ? '发生未知错误' : 'Unknown error occurred'),
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg="slate.800" borderWidth="1px" borderColor="slate.700">
        <MotionBox
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <ModalHeader color="white">
            <Flex align="center" gap={2}>
              <Icon as={GiTreeBranch} boxSize={6} color="green.400" />
              <Text
                bgGradient="linear(to-r, green.400, brand.400)"
                bgClip="text"
                fontSize="2xl"
              >
                {isZh ? '新建词树' : 'Plant New Word Tree'}
              </Text>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel color="gray.300">{isZh ? '词表名称' : 'Tree Name'}</FormLabel>
                <Input
                  placeholder={isZh ? '给你的词树起个名字…' : 'Name your word tree...'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  bg="slate.700"
                  borderColor="slate.600"
                  _hover={{ borderColor: 'slate.500' }}
                  _focus={{ borderColor: 'brand.400', boxShadow: 'none' }}
                  color="white"
                  size="lg"
                  autoFocus
                />
              </FormControl>
              <FormControl>
                <FormLabel color="gray.300">{isZh ? '说明' : 'Description'}</FormLabel>
                <Textarea
                  placeholder={isZh ? '这棵词树准备学习什么内容？' : 'What kind of words will grow on this tree?'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  bg="slate.700"
                  borderColor="slate.600"
                  _hover={{ borderColor: 'slate.500' }}
                  _focus={{ borderColor: 'brand.400', boxShadow: 'none' }}
                  color="white"
                  rows={2}
                />
              </FormControl>
              <FormControl>
                <FormLabel color="gray.300">
                  <Flex align="center" gap={2}>
                    <Text>{isZh ? '词树语境' : 'Tree Roots'}</Text>
                    <Tooltip
                      label={isZh ? '这棵词树的主题或语境是什么？例如：西语旅行、餐厅点餐、拉美日常口语。' : "What's the foundation of this word tree? (e.g., Medical Terms, Computer Science, Literature)"}
                      placement="top"
                      hasArrow
                    >
                      <InfoIcon color="gray.400" boxSize={4} />
                    </Tooltip>
                  </Flex>
                </FormLabel>
                <Textarea
                  placeholder={isZh ? '例如：西语旅行、餐厅点餐、拉美日常口语…' : 'e.g., Medical Terms, Computer Science, Harry Potter Series...'}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  bg="slate.700"
                  borderColor="slate.600"
                  _hover={{ borderColor: 'slate.500' }}
                  _focus={{ borderColor: 'brand.400', boxShadow: 'none' }}
                  color="white"
                  rows={2}
                />
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onClose} color="gray.300">
              {isZh ? '取消' : 'Cancel'}
            </Button>
            <Button
              variant="solid"
              colorScheme="green"
              onClick={handleSubmit}
              isLoading={isLoading}
              loadingText={isZh ? '正在创建…' : 'Planting tree'}
              leftIcon={<Icon as={GiTreeRoots} boxSize={5} />}
              _hover={{
                transform: 'translateY(-2px)',
                animation: 'sparkle 1s ease infinite'
              }}
              transition="all 0.2s"
            >
              {isZh ? '创建词树' : 'Plant Tree'}
            </Button>
          </ModalFooter>
        </MotionBox>
      </ModalContent>
    </Modal>
  );
};
