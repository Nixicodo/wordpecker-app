import {
  ArrowForwardIcon,
  DeleteIcon,
  RepeatIcon
} from '@chakra-ui/icons';
import {
  Box,
  Button,
  HStack,
  Spinner,
  Text,
  VStack,
  useToast
} from '@chakra-ui/react';
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
import { apiService } from '../services/api';
import { BackgroundAsset } from '../types';

const AUTO_ROTATE_MS = 60_000;
const CURRENT_BACKGROUND_STORAGE_KEY = 'wordpecker-current-background-id';

interface BackgroundContextValue {
  currentBackground: BackgroundAsset | null;
  totalBackgrounds: number;
  isReady: boolean;
  isDeleting: boolean;
  cycleBackground: (reason?: 'manual' | 'timer' | 'correct-answer') => void;
  deleteCurrentBackground: () => Promise<void>;
}

const BackgroundContext = createContext<BackgroundContextValue | undefined>(undefined);

const pickRandomBackground = (
  backgrounds: BackgroundAsset[],
  currentBackgroundId?: string | null
) => {
  if (backgrounds.length === 0) {
    return null;
  }

  if (backgrounds.length === 1) {
    return backgrounds[0];
  }

  const candidates = currentBackgroundId
    ? backgrounds.filter((background) => background.id !== currentBackgroundId)
    : backgrounds;

  return candidates[Math.floor(Math.random() * candidates.length)] ?? backgrounds[0];
};

export const BackgroundProvider = ({ children }: PropsWithChildren) => {
  const toast = useToast();
  const [backgrounds, setBackgrounds] = useState<BackgroundAsset[]>([]);
  const [currentBackground, setCurrentBackground] = useState<BackgroundAsset | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const hasLoadedRef = useRef(false);

  const persistCurrentBackground = useCallback((background: BackgroundAsset | null) => {
    if (background) {
      localStorage.setItem(CURRENT_BACKGROUND_STORAGE_KEY, background.id);
      return;
    }

    localStorage.removeItem(CURRENT_BACKGROUND_STORAGE_KEY);
  }, []);

  const applyBackground = useCallback((background: BackgroundAsset | null) => {
    setCurrentBackground(background);
    persistCurrentBackground(background);
  }, [persistCurrentBackground]);

  const cycleBackground = useCallback((_: 'manual' | 'timer' | 'correct-answer' = 'manual') => {
    setCurrentBackground((previousBackground) => {
      const nextBackground = pickRandomBackground(backgrounds, previousBackground?.id);
      persistCurrentBackground(nextBackground);
      return nextBackground;
    });
  }, [backgrounds, persistCurrentBackground]);

  const deleteCurrentBackground = useCallback(async () => {
    if (!currentBackground) {
      return;
    }

    setIsDeleting(true);
    try {
      await apiService.deleteBackground(currentBackground.id);
      const nextBackgrounds = backgrounds.filter((background) => background.id !== currentBackground.id);
      const nextBackground = pickRandomBackground(nextBackgrounds, currentBackground.id);

      setBackgrounds(nextBackgrounds);
      applyBackground(nextBackground);

      toast({
        title: '壁纸已删除',
        description: `已从仓库中永久删除 ${currentBackground.name}`,
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
  }, [applyBackground, backgrounds, currentBackground, toast]);

  useEffect(() => {
    if (hasLoadedRef.current) {
      return;
    }

    hasLoadedRef.current = true;

    const loadBackgrounds = async () => {
      try {
        const response = await apiService.getBackgrounds();
        const nextBackgrounds = response.backgrounds;
        const savedBackgroundId = localStorage.getItem(CURRENT_BACKGROUND_STORAGE_KEY);
        const restoredBackground = nextBackgrounds.find((background) => background.id === savedBackgroundId) ?? null;

        setBackgrounds(nextBackgrounds);
        applyBackground(restoredBackground ?? pickRandomBackground(nextBackgrounds));
      } catch (error) {
        console.error('Failed to load backgrounds:', error);
        toast({
          title: '背景加载失败',
          description: '壁纸库暂时不可用，页面会继续正常工作。',
          status: 'warning',
          duration: 3000,
          isClosable: true
        });
      } finally {
        setIsReady(true);
      }
    };

    void loadBackgrounds();
  }, [applyBackground, toast]);

  useEffect(() => {
    if (backgrounds.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      cycleBackground('timer');
    }, AUTO_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [backgrounds.length, cycleBackground]);

  const value = useMemo<BackgroundContextValue>(() => ({
    currentBackground,
    totalBackgrounds: backgrounds.length,
    isReady,
    isDeleting,
    cycleBackground,
    deleteCurrentBackground
  }), [backgrounds.length, currentBackground, cycleBackground, deleteCurrentBackground, isDeleting, isReady]);

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
          transition="background-image 400ms ease, transform 600ms ease"
          transform={currentBackground ? 'scale(1.02)' : undefined}
        />
        <Box
          position="fixed"
          inset={0}
          zIndex={0}
          bg="linear-gradient(135deg, rgba(2,6,23,0.72) 0%, rgba(15,23,42,0.58) 45%, rgba(2,6,23,0.82) 100%)"
          backdropFilter="blur(4px)"
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
            backdropFilter="blur(14px)"
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
                    {currentBackground.name} · {backgrounds.length} 张可用
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
                    isDisabled={backgrounds.length === 0}
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
                  onClick={() => void window.location.reload()}
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
