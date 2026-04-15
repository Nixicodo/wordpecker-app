import { useEffect, useState } from 'react';
import { DisciplineStatus } from '../types';
import { apiService } from '../services/api';

type UseDisciplineStatusResult = {
  status: DisciplineStatus | null;
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

export const useDisciplineStatus = (): UseDisciplineStatusResult => {
  const [status, setStatus] = useState<DisciplineStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      setError('');
      const nextStatus = await apiService.getDisciplineStatus();
      setStatus(nextStatus);
    } catch (fetchError) {
      console.error('Failed to load discipline status:', fetchError);
      setError('无法加载复习纪律状态');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    status,
    isLoading,
    error,
    refresh
  };
};
