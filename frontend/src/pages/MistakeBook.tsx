import { Center, Spinner, useToast } from '@chakra-ui/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';

export const MistakeBook = () => {
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const openMistakeBook = async () => {
      try {
        const list = await apiService.getMistakeBook();
        navigate(`/lists/${list.id}`, { replace: true });
      } catch (error) {
        console.error('加载错题本失败:', error);
        toast({
          title: '加载错题本失败',
          description: '请稍后重试',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        navigate('/lists', { replace: true });
      }
    };

    openMistakeBook();
  }, [navigate, toast]);

  return (
    <Center h="calc(100vh - 64px)">
      <Spinner size="xl" color="red.400" thickness="4px" />
    </Center>
  );
};
