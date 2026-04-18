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
import { FaArrowRight } from 'react-icons/fa';

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
              这里会按固定词树链逆序向上出词。系统永远先检查更旧的来源词树，只要旧来源里还有未进入你学习流程的新词，就不会上移到更新一级。
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
                    熟悉度评分规则
                  </Text>
                  <VStack align="start" spacing={2} color="gray.300">
                    <Text>1. 非常熟练：直接归为完成学习，不占用今日新词额度，也不会再进入复习。</Text>
                    <Text>2. 比较熟练：按较长的首次复习间隔进入 FSRS。</Text>
                    <Text>3. 不太熟悉：按中等首次复习间隔进入 FSRS。</Text>
                    <Text>4. 完全陌生：按最短首次复习间隔进入 FSRS。</Text>
                    <Text>5. 每日最高新词数已提升为 15。</Text>
                  </VStack>
                </Box>

                <Divider />

                <Box textAlign="center">
                  <Button
                    rightIcon={<FaArrowRight />}
                    colorScheme="blue"
                    size="lg"
                    borderRadius="xl"
                    px={10}
                    onClick={() => navigate('/learn-new-words/session')}
                  >
                    开始评分式学新词
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
