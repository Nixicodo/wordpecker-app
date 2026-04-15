import { Center, Spinner, Text, VStack } from '@chakra-ui/react';
import { Navigate } from 'react-router-dom';
import { useDisciplineStatus } from '../hooks/useDisciplineStatus';

export const DisciplineEntryRedirect = () => {
  const { status, isLoading, error } = useDisciplineStatus();

  if (isLoading) {
    return (
      <Center h="calc(100vh - 64px)">
        <Spinner size="xl" color="orange.400" thickness="4px" />
      </Center>
    );
  }

  if (error || !status) {
    return (
      <Center h="calc(100vh - 64px)">
        <VStack spacing={3}>
          <Text color="white">默认入口加载失败，正在回到词树首页。</Text>
          <Navigate to="/lists" replace />
        </VStack>
      </Center>
    );
  }

  if (status.dueCount > 0) {
    return <Navigate to="/reviews" replace />;
  }

  return <Navigate to="/lists" replace />;
};
