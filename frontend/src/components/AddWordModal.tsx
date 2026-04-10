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
  VStack,
  useToast,
  Text,
  Box,
  Flex,
  Icon
} from '@chakra-ui/react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { FaSearch } from 'react-icons/fa';

const MotionBox = motion(Box);

const UI = {
  required: '\u8bf7\u8f93\u5165\u8981\u6dfb\u52a0\u7684\u5355\u8bcd',
  found: '\u5df2\u627e\u5230\u5355\u8bcd',
  findingMeaning: '\u6b63\u5728\u4e3a\u8fd9\u4e2a\u8bcd\u751f\u6210\u5408\u9002\u7684\u91ca\u4e49\u2026\u2026',
  addFailed: '\u6dfb\u52a0\u5355\u8bcd\u5931\u8d25',
  unknownError: '\u53d1\u751f\u672a\u77e5\u9519\u8bef',
  title: '\u6dfb\u52a0\u65b0\u5355\u8bcd',
  fieldLabel: '\u8981\u67e5\u627e\u7684\u5355\u8bcd',
  placeholder: '\u8f93\u5165\u8981\u52a0\u5165\u8bcd\u8868\u7684\u5355\u8bcd\u2026\u2026',
  cancel: '\u53d6\u6d88',
  loading: '\u6b63\u5728\u67e5\u627e\u2026\u2026',
  submit: '\u6dfb\u52a0\u5355\u8bcd',
};

interface AddWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWord: (word: string) => Promise<void>;
  listName?: string;
}

export const AddWordModal = ({ isOpen, onClose, onAddWord }: AddWordModalProps) => {
  const [word, setWord] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handleSubmit = async () => {
    if (!word.trim()) {
      toast({
        title: UI.required,
        status: 'error',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    setIsLoading(true);
    try {
      await onAddWord(word.trim());
      toast({
        title: UI.found,
        description: UI.findingMeaning,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      setWord('');
      onClose();
    } catch (error) {
      toast({
        title: UI.addFailed,
        description: error instanceof Error ? error.message : UI.unknownError,
        status: 'error',
        duration: 2000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
              <Icon
                as={FaSearch}
                boxSize={6}
                color="orange.400"
                style={{ animation: 'sparkle 2s ease infinite' }}
              />
              <Text
                bgGradient="linear(to-r, orange.400, brand.400)"
                bgClip="text"
                fontSize="2xl"
              >
                {UI.title}
              </Text>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel color="gray.300">{UI.fieldLabel}</FormLabel>
                <Input
                  placeholder={UI.placeholder}
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
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
            </VStack>
          </ModalBody>

          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onClose} color="gray.300">
              {UI.cancel}
            </Button>
            <Button
              variant="solid"
              colorScheme="orange"
              onClick={handleSubmit}
              isLoading={isLoading}
              loadingText={UI.loading}
              leftIcon={<Icon as={FaSearch} boxSize={5} />}
              _hover={{
                transform: 'translateY(-2px)',
                animation: 'sparkle 1s ease infinite'
              }}
              transition="all 0.2s"
            >
              {UI.submit}
            </Button>
          </ModalFooter>
        </MotionBox>
      </ModalContent>
    </Modal>
  );
};
