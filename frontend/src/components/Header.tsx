import { Box, Container, Flex, Button, Icon, Text } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { GiTreeBranch } from 'react-icons/gi';
import { FaFeatherAlt, FaCog, FaCamera, FaGraduationCap, FaRegBookmark, FaClock } from 'react-icons/fa';
import { detectUiLocale } from '../i18n/ui';

export const Header = () => {
  const isZh = detectUiLocale() === 'zh-CN';

  return (
    <Box as="nav" w="100%" bg="slate.800" boxShadow="lg" position="sticky" top={0} zIndex={10}>
      <Container maxW="container.xl">
        <Flex h="16" alignItems="center" justifyContent="space-between">
          <Flex gap={6} align="center">
            <Link to="/lists">
              <Button
                variant="ghost"
                leftIcon={<Icon as={GiTreeBranch} color="green.500" />}
                _hover={{
                  transform: 'translateY(-2px)',
                  color: 'green.500'
                }}
                transition="all 0.2s"
              >
                <Flex align="center" gap={1}>
                  <Text>{isZh ? '我的词树' : 'My Trees'}</Text>
                  <Icon
                    as={FaFeatherAlt}
                    color="#FA8C16"
                    transform="rotate(-45deg)"
                    boxSize={3}
                    ml={-1}
                    mt={-2}
                  />
                </Flex>
              </Button>
            </Link>
            <Link to="/reviews">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaClock} color="#F6AD55" />}
                _hover={{
                  transform: 'translateY(-2px)',
                  color: '#F6AD55'
                }}
                transition="all 0.2s"
              >
                {isZh ? '\u5f85\u590d\u4e60' : 'Due Review'}
              </Button>
            </Link>
            <Link to="/mistakes">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaRegBookmark} color="#F56565" />}
                _hover={{
                  transform: 'translateY(-2px)',
                  color: '#F56565'
                }}
                transition="all 0.2s"
              >
                {isZh ? '错题本' : 'Mistake Book'}
              </Button>
            </Link>
            <Link to="/describe">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaCamera} color="#FA8C16" />}
                _hover={{
                  transform: 'translateY(-2px)',
                  color: '#FA8C16'
                }}
                transition="all 0.2s"
              >
                {isZh ? '视觉花园' : 'Vision Garden'}
              </Button>
            </Link>
            <Link to="/learn-new-words">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaGraduationCap} color="#FA8C16" />}
                _hover={{
                  transform: 'translateY(-2px)',
                  color: '#FA8C16'
                }}
                transition="all 0.2s"
              >
                {isZh ? '发现新词' : 'Get New Words'}
              </Button>
            </Link>
            <Link to="/settings">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaCog} color="gray.400" />}
                _hover={{
                  transform: 'translateY(-2px)',
                  color: 'gray.300'
                }}
                transition="all 0.2s"
              >
                {isZh ? '设置' : 'Settings'}
              </Button>
            </Link>
          </Flex>
          <Box>
            <Text color="green.500" fontWeight="bold">
              {isZh ? 'WordPecker 词汇学习' : 'WordPecker App'}
            </Text>
          </Box>
        </Flex>
      </Container>
    </Box>
  );
};
