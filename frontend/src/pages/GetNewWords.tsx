import React from 'react';
import {
  Box,
  Button,
  Card,
  CardBody,
  Container,
  Divider,
  Heading,
  ListItem,
  OrderedList,
  Text,
  VStack,
  useColorModeValue
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaLink } from 'react-icons/fa';

const fixedChainPreview = [
  '私教学习自用',
  '西语3k词-Level0-Pre-A1',
  '西语3k词-Level1-A1',
  '西语3k词-Level2-A1',
  '...一直到西语3k词-Level10-B1'
];

export const GetNewWords: React.FC = () => {
  const navigate = useNavigate();
  const cardBg = useColorModeValue('white', '#1E293B');
  const borderColor = useColorModeValue('gray.200', '#334155');
  const pageBg = useColorModeValue('gray.50', '#0F172A');

  return (
    <Box minH="100vh" bg={pageBg}>
      <Container maxW="container.lg" py={8} px={{ base: 4, md: 8 }}>
        <VStack spacing={8} align="stretch">
          <Box>
            <Heading as="h1" size="2xl" color="green.500">
              发现新词
            </Heading>
            <Text mt={3} color="gray.400" fontSize="lg">
              这里不再按场景随机生词，而是按照固定词树链逆序向上学习。系统会永远先检查更旧的来源词树，只要旧词树里还有你没纳入私教词树的新词，就不会跳去更新一级。
            </Text>
          </Box>

          <Card bg={cardBg} borderColor={borderColor} borderWidth="2px" borderRadius="xl" shadow="lg">
            <CardBody>
              <VStack spacing={6} align="stretch">
                <Box>
                  <Text fontSize="lg" fontWeight="bold" color="blue.400" mb={3}>
                    固定学习链
                  </Text>
                  <OrderedList spacing={2} pl={5} color="gray.300">
                    {fixedChainPreview.map((item) => (
                      <ListItem key={item}>{item}</ListItem>
                    ))}
                  </OrderedList>
                </Box>

                <Divider />

                <Box>
                  <Text fontSize="lg" fontWeight="bold" color="green.400" mb={3}>
                    当前规则
                  </Text>
                  <VStack align="start" spacing={2} color="gray.300">
                    <Text>1. 永远先从更旧的来源词树取词。</Text>
                    <Text>2. 只有当前旧来源已经没有可引入的新词时，才会上移到下一层来源词树。</Text>
                    <Text>3. 如果旧来源词树之后又新增了词，会重新回到旧来源优先。</Text>
                    <Text>4. 你在会话里点“我认识”，该词会直接纳入私教学习词树，避免下次重复出现。</Text>
                  </VStack>
                </Box>

                <Divider />

                <Box textAlign="center">
                  <Button
                    leftIcon={<FaLink />}
                    rightIcon={<FaArrowRight />}
                    colorScheme="blue"
                    size="lg"
                    borderRadius="xl"
                    px={10}
                    onClick={() => navigate('/learn-new-words/session')}
                  >
                    开始固定链学习
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
