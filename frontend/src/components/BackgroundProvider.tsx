import { ArrowForwardIcon, DeleteIcon, RepeatIcon } from '@chakra-ui/icons';
import { Box, Button, HStack, Spinner, Text, VStack, useToast } from '@chakra-ui/react';
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { apiService, resolveApiUrl } from '../services/api';
import { BackgroundAsset } from '../types';

const AUTO_ROTATE_MS = 60_000;
const CURRENT_BACKGROUND_STORAGE_KEY = 'wordpecker-current-background-id';

interface BackgroundContextValue {
  currentBackground: BackgroundAsset | null;
  totalBackgrounds: number;
  isReady: boolean;
  isSwitching: boolean;
  isDeleting: boolean;
  cycleBackground: (reason?: 'manual' | 'timer' | 'correct-answer') => void;
  deleteCurrentBackground: () => Promise<void>;
}

const BackgroundContext = createContext<BackgroundContextValue | undefined>(undefined);

const normalizeBackground = (background: BackgroundAsset | null) => (
  background
    ? {
        ...background,
        url: resolveApiUrl(background.url)
      }
    : null
);

export const BackgroundProvider = ({ children }: PropsWithChildren) => {
  const toast = useToast();
  const [currentBackground, setCurrentBackground] = useState<BackgroundAsset | null>(null);
  const [totalBackgrounds, setTotalBackgrounds] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const hasLoadedRef = useRef(false);
  const currentBackgroundRef = useRef<BackgroundAsset | null>(null);

  const persistCurrentBackground = useCallback((background: BackgroundAsset | null) => {
    if (background) {
      localStorage.setItem(CURRENT_BACKGROUND_STORAGE_KEY, background.id);
      return;
    }

    localStorage.removeItem(CURRENT_BACKGROUND_STORAGE_KEY);
  }, []);

  const applyBackground = useCallback((background: BackgroundAsset | null) => {
    setCurrentBackground(background);
    currentBackgroundRef.current = background;
    persistCurrentBackground(background);
  }, [persistCurrentBackground]);

  const requestBackground = useCallback(async (options?: {
    excludeId?: string;
    preferredId?: string;
    silent?: boolean;
  }) => {
    setIsSwitching(true);
    try {
      const response = await apiService.getRandomBackground({
        excludeId: options?.excludeId,
        preferredId: options?.preferredId
      });

      const nextBackground = normalizeBackground(response.background);
      setTotalBackgrounds(response.total);
      applyBackground(nextBackground);
      return nextBackground;
    } catch (error) {
      console.error('Failed to load background:', error);
      if (!options?.silent) {
        toast({
          title: '背景加载失败',
          description: '壁纸暂时不可用，页面会继续正常工作。',
          status: 'warning',
          duration: 2500,
          isClosable: true
        });
      }
      return null;
    } finally {
      setIsSwitching(false);
    }
  }, [applyBackground, toast]);

  const cycleBackground = useCallback((_: 'manual' | 'timer' | 'correct-answer' = 'manual') => {
    void requestBackground({
      excludeId: currentBackgroundRef.current?.id
    });
  }, [requestBackground]);

  const deleteCurrentBackground = useCallback(async () => {
    if (!currentBackgroundRef.current) {
      return;
    }

    const deletingBackground = currentBackgroundRef.current;

    setIsDeleting(true);
    try {
      await apiService.deleteBackground(deletingBackground.id);
      const nextBackground = await requestBackground({
        excludeId: deletingBackground.id,
        silent: true
      });

      toast({
        title: '壁纸已删除',
        description: nextBackground
          ? `已删除 ${deletingBackground.name}，并切换到下一张壁纸。`
          : `已删除 ${deletingBackground.name}，当前背景库已空。`,
        status: 'success',
        duration: 2500,
        isClosable: true
      });
    } catch (error) {
      console.error('Failed to delete background:', error);
      toast({
        title: '删除失败',
        description: '当前壁纸未能删除，请稍后重试。',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    } finally {
      setIsDeleting(false);
    }
  }, [requestBackground, toast]);

  useEffect(() => {
    if (hasLoadedRef.current) {
      return;
    }

    hasLoadedRef.current = true;

    const loadBackground = async () => {
      const savedBackgroundId = localStorage.getItem(CURRENT_BACKGROUND_STORAGE_KEY);
      await requestBackground({
        preferredId: savedBackgroundId ?? undefined,
        silent: true
      });
      setIsReady(true);
    };

    void loadBackground();
  }, [requestBackground]);

  useEffect(() => {
    if (totalBackgrounds <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      cycleBackground('timer');
    }, AUTO_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [cycleBackground, totalBackgrounds]);

  const value = useMemo<BackgroundContextValue>(() => ({
    currentBackground,
    totalBackgrounds,
    isReady,
    isSwitching,
    isDeleting,
    cycleBackground,
    deleteCurrentBackground
  }), [currentBackground, cycleBackground, deleteCurrentBackground, isDeleting, isReady, isSwitching, totalBackgrounds]);

  return (
    <BackgroundContext.Provider value={value}>
      <Box position="relative" minH="100vh" isolation="isolate">
        <Box
          position="fixed"
          inset={0}
          zIndex={0}
          bgImage={currentBackground ? `url("${currentBackground.url}")` : undefined}
          bgSize="cover"
          bgPosition="center"
          bgRepeat="no-repeat"
          pointerEvents="none"
        />
        <Box
          position="fixed"
          inset={0}
          zIndex={0}
          bg="linear-gradient(135deg, rgba(2,6,23,0.74) 0%, rgba(15,23,42,0.56) 42%, rgba(2,6,23,0.82) 100%)"
          pointerEvents="none"
        />

        <Box position="relative" zIndex={1}>
          {children}
        </Box>

        <VStack
          position="fixed"
          right={{ base: 3, md: 6 }}
          bottom={{ base: 3, md: 6 }}
          zIndex={20}
          align="stretch"
          spacing={3}
        >
          <Box
            px={4}
            py={3}
            borderRadius="2xl"
            bg="rgba(9, 14, 28, 0.78)"
            border="1px solid rgba(255, 255, 255, 0.14)"
            boxShadow="0 22px 50px rgba(0, 0, 0, 0.28)"
          >
            {!isReady ? (
              <HStack spacing={3}>
                <Spinner size="sm" color="green.300" />
                <Text fontSize="sm" color="whiteAlpha.900">正在装载背景库…</Text>
              </HStack>
            ) : currentBackground ? (
              <VStack spacing={3} align="stretch">
                <Box>
                  <Text fontSize="xs" color="whiteAlpha.700" textTransform="uppercase" letterSpacing="0.18em">
                    Background
                  </Text>
                  <Text fontSize="sm" color="white" fontWeight="semibold" noOfLines={1}>
                    {currentBackground.folder || currentBackground.name}
                  </Text>
                  <Text fontSize="xs" color="whiteAlpha.700" noOfLines={1}>
                    {currentBackground.name} · {totalBackgrounds} 张可用
                  </Text>
                </Box>
                <HStack spacing={2}>
                  <Button
                    leftIcon={<ArrowForwardIcon />}
                    size="sm"
                    variant="ghost"
                    color="white"
                    bg="whiteAlpha.180"
                    _hover={{ bg: 'whiteAlpha.260' }}
                    onClick={() => cycleBackground('manual')}
                    isDisabled={totalBackgrounds === 0}
                    isLoading={isSwitching}
                  >
                    Next
                  </Button>
                  <Button
                    leftIcon={<DeleteIcon />}
                    size="sm"
                    colorScheme="red"
                    variant="solid"
                    onClick={() => void deleteCurrentBackground()}
                    isLoading={isDeleting}
                  >
                    Delete
                  </Button>
                </HStack>
              </VStack>
            ) : (
              <VStack align="stretch" spacing={3}>
                <Text fontSize="sm" color="whiteAlpha.900">当前没有可用壁纸。</Text>
                <Button
                  leftIcon={<RepeatIcon />}
                  size="sm"
                  variant="ghost"
                  color="white"
                  bg="whiteAlpha.180"
                  _hover={{ bg: 'whiteAlpha.260' }}
                  onClick={() => void requestBackground({ silent: true })}
                  isLoading={isSwitching}
                >
                  刷新背景库
                </Button>
              </VStack>
            )}
          </Box>
        </VStack>
      </Box>
    </BackgroundContext.Provider>
  );
};

export const useBackgrounds = () => {
  const context = useContext(BackgroundContext);

  if (!context) {
    throw new Error('useBackgrounds must be used inside BackgroundProvider');
  }

  return context;
};
