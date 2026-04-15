import { Center, Spinner, useToast } from '@chakra-ui/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const MistakeBook = () => {
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    toast({
      title: '错题本入口已并入待复习',
      description: '后续错词修复统一走 Due Review 主线，不再保留独立错题本入口。',
      status: 'info',
      duration: 4000,
      isClosable: true
    });
    navigate('/reviews', { replace: true });
  }, [navigate, toast]);

  return (
    <Center h="calc(100vh - 64px)">
      <Spinner size="xl" color="orange.400" thickness="4px" />
    </Center>
  );
};
