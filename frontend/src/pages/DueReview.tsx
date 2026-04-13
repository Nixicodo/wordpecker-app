import { Center, Spinner, useToast } from '@chakra-ui/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';

export const DueReview = () => {
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const openDueReview = async () => {
      try {
        const list = await apiService.getDueReview();
        navigate(`/lists/${list.id}`, { replace: true });
      } catch (error) {
        console.error('Failed to open due review list:', error);
        toast({
          title: '\u52a0\u8f7d\u5f85\u590d\u4e60\u5931\u8d25',
          description: '\u8bf7\u7a0d\u540e\u91cd\u8bd5',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        navigate('/lists', { replace: true });
      }
    };

    openDueReview();
  }, [navigate, toast]);

  return (
    <Center h="calc(100vh - 64px)">
      <Spinner size="xl" color="orange.300" thickness="4px" />
    </Center>
  );
};
