import { Badge, Box, Button, Container, Flex, HStack, Icon, Text } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { GiTreeBranch } from 'react-icons/gi';
import { FaCamera, FaClock, FaCog, FaFeatherAlt, FaGraduationCap } from 'react-icons/fa';
import { detectUiLocale } from '../i18n/ui';
import { useDisciplineStatus } from '../hooks/useDisciplineStatus';

const EntryBadge = ({ label, colorScheme }: { label: string; colorScheme: string }) => (
  <Badge colorScheme={colorScheme} variant="subtle" borderRadius="full" px={2} py={0.5}>
    {label}
  </Badge>
);

export const Header = () => {
  const isZh = detectUiLocale() === 'zh-CN';
  const { status } = useDisciplineStatus();

  return (
    <Box as="nav" w="100%" bg="slate.800" boxShadow="lg" position="sticky" top={0} zIndex={10}>
      <Container maxW="container.xl">
        <Flex h="16" alignItems="center" justifyContent="space-between" gap={6}>
          <Flex gap={4} align="center" flexWrap="wrap">
            <Link to="/reviews">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaClock} color="#F6AD55" />}
                _hover={{ transform: 'translateY(-2px)', color: '#F6AD55' }}
                transition="all 0.2s"
              >
                <HStack spacing={2}>
                  <Text>{isZh ? '待复习' : 'Due Review'}</Text>
                  {status && status.dueCount > 0 && (
                    <EntryBadge label={`${status.dueCount}`} colorScheme="orange" />
                  )}
                </HStack>
              </Button>
            </Link>

            <Link to="/lists">
              <Button
                variant="ghost"
                leftIcon={<Icon as={GiTreeBranch} color="green.500" />}
                _hover={{ transform: 'translateY(-2px)', color: 'green.500' }}
                transition="all 0.2s"
              >
                <Flex align="center" gap={1}>
                  <Text>{isZh ? '我的词树' : 'My Trees'}</Text>
                  <Icon as={FaFeatherAlt} color="#FA8C16" transform="rotate(-45deg)" boxSize={3} ml={-1} mt={-2} />
                </Flex>
              </Button>
            </Link>

            <Link to="/describe">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaCamera} color="#FA8C16" />}
                _hover={{ transform: 'translateY(-2px)', color: '#FA8C16' }}
                transition="all 0.2s"
              >
                <HStack spacing={2}>
                  <Text>{isZh ? '视觉花园' : 'Vision Garden'}</Text>
                  {status?.entryState === 'soft_locked' && <EntryBadge label="先复习" colorScheme="yellow" />}
                  {status?.entryState === 'hard_locked' && <EntryBadge label="硬锁" colorScheme="red" />}
                  {status?.entryState === 'quota_reached' && <EntryBadge label="额度满" colorScheme="purple" />}
                </HStack>
              </Button>
            </Link>

            <Link to="/learn-new-words">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaGraduationCap} color="#FA8C16" />}
                _hover={{ transform: 'translateY(-2px)', color: '#FA8C16' }}
                transition="all 0.2s"
              >
                <HStack spacing={2}>
                  <Text>{isZh ? '发现新词' : 'Get New Words'}</Text>
                  {status && (
                    <EntryBadge
                      label={status.entryState === 'open' ? `余 ${status.remainingNewWordQuota}` : '受限'}
                      colorScheme={status.entryState === 'open' ? 'green' : 'orange'}
                    />
                  )}
                </HStack>
              </Button>
            </Link>

            <Link to="/settings">
              <Button
                variant="ghost"
                leftIcon={<Icon as={FaCog} color="gray.400" />}
                _hover={{ transform: 'translateY(-2px)', color: 'gray.300' }}
                transition="all 0.2s"
              >
                {isZh ? '设置' : 'Settings'}
              </Button>
            </Link>
          </Flex>

          <Box>
            <Text color="green.500" fontWeight="bold">
              {isZh ? 'WordPecker 纪律复习' : 'WordPecker Review'}
            </Text>
          </Box>
        </Flex>
      </Container>
    </Box>
  );
};
