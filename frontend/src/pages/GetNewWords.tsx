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
  VStack
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';
import { useBackgrounds } from '../components/BackgroundProvider';

const fixedChainPreview = [
  '私教学习自用',
  '西语3k词-Level0-Pre-A1',
  '西语3k词-Level1-A1',
  '西语3k词-Level2-A1',
  '一直逆序向上到西语3k词-Level10-B1'
];

const buildAlpha = (value: number) => (value / 100).toFixed(2);

export const GetNewWords: React.FC = () => {
  const navigate = useNavigate();
  const { cardOpacity } = useBackgrounds();

  const cardBg = `rgba(15, 23, 42, ${buildAlpha(cardOpacity)})`;
  const sectionBg = `rgba(15, 23, 42, ${buildAlpha(Math.max(cardOpacity - 12, 28))})`;
  const borderColor = `rgba(148, 163, 184, ${Math.min(cardOpacity / 180, 0.45).toFixed(2)})`;

  return (
    <Box minH="100vh" bg="transparent">
      <Container maxW="container.lg" py={8} px={{ base: 4, md: 8 }}>
        <VStack spacing={8} align="stretch">
          <Box>
            <Heading as="h1" size="2xl" color="green.300">
              发现新词
            </Heading>
            <Text mt={3} color="whiteAlpha.800" fontSize="lg" maxW="4xl">
              这里会按固定词树链逆序向上出词。系统会一直优先检查更旧的来源词树，只要旧词树里还有未进入你学习流程的新词，就不会切到更高一级。
            </Text>
          </Box>

          <Card
            bg={cardBg}
            borderColor={borderColor}
            borderWidth="1px"
            borderRadius="2xl"
            shadow="2xl"
            backdropFilter="blur(18px)"
          >
            <CardBody>
              <VStack spacing={6} align="stretch">
                <Box p={5} bg={sectionBg} borderRadius="xl">
                  <Text fontSize="lg" fontWeight="bold" color="blue.200" mb={3}>
                    固定学习链
                  </Text>
                  <OrderedList spacing={2} pl={5} color="whiteAlpha.800">
                    {fixedChainPreview.map((item) => (
                      <ListItem key={item}>{item}</ListItem>
                    ))}
                  </OrderedList>
                </Box>

                <Divider borderColor="whiteAlpha.200" />

                <Box p={5} bg={sectionBg} borderRadius="xl">
                  <Text fontSize="lg" fontWeight="bold" color="green.200" mb={3}>
                    熟悉度评分规则
                  </Text>
                  <VStack align="start" spacing={2} color="whiteAlpha.800">
                    <Text>1. 非常熟练：直接归为完成学习，不占用今日新词额度，也不会再进入复习。</Text>
                    <Text>2. 比较熟练：按较长的首次复习间隔进入 FSRS。</Text>
                    <Text>3. 不太熟悉：按中等的首次复习间隔进入 FSRS。</Text>
                    <Text>4. 完全陌生：按最短的首次复习间隔进入 FSRS。</Text>
                    <Text>5. 每日最高新词数已提升为 15。</Text>
                  </VStack>
                </Box>

                <Divider borderColor="whiteAlpha.200" />

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
