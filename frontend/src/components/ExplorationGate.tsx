import { Center, Spinner, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { DisciplineLockScreen } from './DisciplineLockScreen';
import { useDisciplineStatus } from '../hooks/useDisciplineStatus';

export const ExplorationGate = ({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) => {
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
        <Text color="white">纪律状态加载失败，请稍后重试。</Text>
      </Center>
    );
  }

  if (!status.canAccessExploration) {
    return <DisciplineLockScreen status={status} title={title} />;
  }

  return <>{children}</>;
};
