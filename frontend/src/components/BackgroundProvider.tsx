import {
  ArrowForwardIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  DeleteIcon,
  RepeatIcon
} from '@chakra-ui/icons';
import {
  Box,
  Button,
  HStack,
  IconButton,
  Select,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
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
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { apiService, resolveApiUrl } from '../services/api';
import { BackgroundAsset } from '../types';

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BACKGROUND_OPACITY = 72;
const DEFAULT_MASK_OPACITY = 48;
const DEFAULT_CARD_OPACITY = 88;
const BACKGROUND_CROSSFADE_DURATION_SECONDS = 1.5;
const CURRENT_BACKGROUND_STORAGE_KEY = 'wordpecker-current-background-id';
const BACKGROUND_OPACITY_STORAGE_KEY = 'wordpecker-background-opacity';
const BACKGROUND_MASK_OPACITY_STORAGE_KEY = 'wordpecker-background-mask-opacity';
const BACKGROUND_CARD_OPACITY_STORAGE_KEY = 'wordpecker-background-card-opacity';
const BACKGROUND_INTERVAL_STORAGE_KEY = 'wordpecker-background-interval-ms';

const INTERVAL_OPTIONS = [
  { label: '30 秒', value: 30_000 },
  { label: '1 分钟', value: 60_000 },
  { label: '2 分钟', value: 120_000 },
  { label: '5 分钟', value: 300_000 },
  { label: '10 分钟', value: 600_000 }
] as const;

interface BackgroundContextValue {
  currentBackground: BackgroundAsset | null;
  totalBackgrounds: number;
  isReady: boolean;
  isSwitching: boolean;
  isDeleting: boolean;
  cardOpacity: number;
  cycleBackground: (reason?: 'manual' | 'timer' | 'correct-answer' | 'next-question') => void;
  deleteCurrentBackground: () => Promise<void>;
}

const BackgroundContext = createContext<BackgroundContextValue | undefined>(undefined);
const MotionBox = motion(Box);

const normalizeBackground = (background: BackgroundAsset | null) => (
  background
    ? {
        ...background,
        url: resolveApiUrl(background.url)
      }
    : null
);

const readStoredNumber = (key: string, fallbackValue: number) => {
  const storedValue = localStorage.getItem(key);
  if (!storedValue) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(storedValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
};

const shouldPauseAutoRotation = (pathname: string) => /^\/(?:learn|quiz)\/[^/]+\/?$/.test(pathname);

export const BackgroundProvider = ({ children }: PropsWithChildren) => {
  const location = useLocation();
  const toast = useToast();
  const [currentBackground, setCurrentBackground] = useState<BackgroundAsset | null>(null);
  const [totalBackgrounds, setTotalBackgrounds] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [backgroundOpacity, setBackgroundOpacity] = useState(DEFAULT_BACKGROUND_OPACITY);
  const [maskOpacity, setMaskOpacity] = useState(DEFAULT_MASK_OPACITY);
  const [cardOpacity, setCardOpacity] = useState(DEFAULT_CARD_OPACITY);
  const [rotationIntervalMs, setRotationIntervalMs] = useState(DEFAULT_INTERVAL_MS);
  const [isControlTrayExpanded, setIsControlTrayExpanded] = useState(false);
  const hasLoadedRef = useRef(false);
  const currentBackgroundRef = useRef<BackgroundAsset | null>(null);
  const isAutoRotationPaused = shouldPauseAutoRotation(location.pathname);

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

  const cycleBackground = useCallback((reason: 'manual' | 'timer' | 'correct-answer' | 'next-question' = 'manual') => {
    if (reason === 'timer' && isAutoRotationPaused) {
      return;
    }

    void requestBackground({
      excludeId: currentBackgroundRef.current?.id
    });
  }, [isAutoRotationPaused, requestBackground]);

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
          ? `已删除 ${deletingBackground.folder || deletingBackground.name}，并切换到下一张壁纸。`
          : `已删除 ${deletingBackground.folder || deletingBackground.name}，当前背景库已空。`,
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

  const handleCopyPath = useCallback(async () => {
    if (!currentBackground) {
      return;
    }

    const folderPath = currentBackground.folder
      ? `backgrounds/${currentBackground.folder}`
      : 'backgrounds';

    try {
      await navigator.clipboard.writeText(folderPath);
      toast({
        title: '路径已复制',
        description: folderPath,
        status: 'success',
        duration: 1800,
        isClosable: true
      });
    } catch (error) {
      console.error('Failed to copy background path:', error);
      toast({
        title: '复制失败',
        description: '浏览器未能复制路径，请稍后重试。',
        status: 'error',
        duration: 2500,
        isClosable: true
      });
    }
  }, [currentBackground, toast]);

  const handleBackgroundOpacityChange = useCallback((value: number) => {
    setBackgroundOpacity(value);
    localStorage.setItem(BACKGROUND_OPACITY_STORAGE_KEY, String(value));
  }, []);

  const handleMaskOpacityChange = useCallback((value: number) => {
    setMaskOpacity(value);
    localStorage.setItem(BACKGROUND_MASK_OPACITY_STORAGE_KEY, String(value));
  }, []);

  const handleCardOpacityChange = useCallback((value: number) => {
    setCardOpacity(value);
    localStorage.setItem(BACKGROUND_CARD_OPACITY_STORAGE_KEY, String(value));
  }, []);

  const handleIntervalChange = useCallback((value: string) => {
    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    setRotationIntervalMs(parsedValue);
    localStorage.setItem(BACKGROUND_INTERVAL_STORAGE_KEY, String(parsedValue));
  }, []);

  const toggleControlTray = useCallback(() => {
    setIsControlTrayExpanded((previousValue) => !previousValue);
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) {
      return;
    }

    hasLoadedRef.current = true;
    setBackgroundOpacity(readStoredNumber(BACKGROUND_OPACITY_STORAGE_KEY, DEFAULT_BACKGROUND_OPACITY));
    setMaskOpacity(readStoredNumber(BACKGROUND_MASK_OPACITY_STORAGE_KEY, DEFAULT_MASK_OPACITY));
    setCardOpacity(readStoredNumber(BACKGROUND_CARD_OPACITY_STORAGE_KEY, DEFAULT_CARD_OPACITY));
    setRotationIntervalMs(readStoredNumber(BACKGROUND_INTERVAL_STORAGE_KEY, DEFAULT_INTERVAL_MS));

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
    if (isAutoRotationPaused || totalBackgrounds <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      cycleBackground('timer');
    }, rotationIntervalMs);

    return () => window.clearInterval(timer);
  }, [cycleBackground, isAutoRotationPaused, rotationIntervalMs, totalBackgrounds]);

  const overlayOpacity = Math.max(0, Math.min(maskOpacity / 100, 1));
  const traySurfaceStyles = {
    borderRadius: '2xl',
    bg: 'rgba(9, 14, 28, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    boxShadow: '0 22px 50px rgba(0, 0, 0, 0.28)'
  } as const;
  const trayGhostActionStyles = {
    color: 'white',
    bg: 'whiteAlpha.180',
    _hover: { bg: 'whiteAlpha.260' },
    _active: { bg: 'whiteAlpha.300' }
  } as const;

  const value = useMemo<BackgroundContextValue>(() => ({
    currentBackground,
    totalBackgrounds,
    isReady,
    isSwitching,
    isDeleting,
    cardOpacity,
    cycleBackground,
    deleteCurrentBackground
  }), [cardOpacity, currentBackground, cycleBackground, deleteCurrentBackground, isDeleting, isReady, isSwitching, totalBackgrounds]);

  return (
    <BackgroundContext.Provider value={value}>
      <Box position="relative" minH="100vh" isolation="isolate">
        <Box
          position="fixed"
          inset={0}
          zIndex={0}
          pointerEvents="none"
          overflow="hidden"
        >
          <AnimatePresence initial={false}>
            {currentBackground ? (
              <MotionBox
                key={currentBackground.id}
                position="absolute"
                inset={0}
                bgImage={`url("${currentBackground.url}")`}
                bgSize="cover"
                bgPosition="center"
                bgRepeat="no-repeat"
                initial={{ opacity: 0 }}
                animate={{ opacity: backgroundOpacity / 100 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: BACKGROUND_CROSSFADE_DURATION_SECONDS,
                  ease: 'easeInOut'
                }}
              />
            ) : null}
          </AnimatePresence>
        </Box>
        <Box
          position="fixed"
          inset={0}
          zIndex={0}
          bg={`linear-gradient(135deg, rgba(2,6,23,${Math.min(overlayOpacity * 0.95, 1).toFixed(2)}) 0%, rgba(15,23,42,${Math.min(overlayOpacity * 0.58, 1).toFixed(2)}) 42%, rgba(2,6,23,${Math.min(overlayOpacity * 1.15, 1).toFixed(2)}) 100%)`}
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
          <AnimatePresence initial={false} mode="wait">
            {isControlTrayExpanded ? (
              <MotionBox
                key="background-control-tray-expanded"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <Box
                  px={4}
                  py={3}
                  minW={{ base: '280px', md: '320px' }}
                  {...traySurfaceStyles}
                >
                  {!isReady ? (
                    <HStack spacing={3} justify="space-between">
                      <HStack spacing={3}>
                        <Spinner size="sm" color="green.300" />
                        <Text fontSize="sm" color="whiteAlpha.900">正在装载背景库…</Text>
                      </HStack>
                      <IconButton
                        aria-label="收起背景控制托盘"
                        icon={<ChevronDownIcon />}
                        size="sm"
                        variant="ghost"
                        {...trayGhostActionStyles}
                        onClick={toggleControlTray}
                      />
                    </HStack>
                  ) : currentBackground ? (
                    <VStack spacing={3} align="stretch">
                      <Box>
                        <Text fontSize="xs" color="whiteAlpha.700" textTransform="uppercase" letterSpacing="0.18em">
                          Background
                        </Text>
                        <HStack spacing={2} align="center">
                          <Text fontSize="sm" color="white" fontWeight="semibold" noOfLines={1} flex="1">
                            {currentBackground.folder || 'backgrounds'}
                          </Text>
                          <IconButton
                            aria-label="复制来源路径"
                            icon={<CopyIcon />}
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.900"
                            _hover={{ bg: 'whiteAlpha.200' }}
                            onClick={() => void handleCopyPath()}
                          />
                        </HStack>
                        <Text fontSize="xs" color="whiteAlpha.700">
                          {`${totalBackgrounds} 张可用`}
                        </Text>
                      </Box>

                      <VStack spacing={2} align="stretch">
                        <Box>
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="xs" color="whiteAlpha.800">壁纸不透明度</Text>
                            <Text fontSize="xs" color="green.200">{backgroundOpacity}%</Text>
                          </HStack>
                          <Slider
                            aria-label="壁纸不透明度"
                            value={backgroundOpacity}
                            min={15}
                            max={100}
                            step={5}
                            onChange={handleBackgroundOpacityChange}
                          >
                            <SliderTrack bg="whiteAlpha.200">
                              <SliderFilledTrack bg="green.300" />
                            </SliderTrack>
                            <SliderThumb boxSize={3} />
                          </Slider>
                        </Box>

                        <Box>
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="xs" color="whiteAlpha.800">蒙版不透明度</Text>
                            <Text fontSize="xs" color="green.200">{maskOpacity}%</Text>
                          </HStack>
                          <Slider
                            aria-label="蒙版不透明度"
                            value={maskOpacity}
                            min={0}
                            max={100}
                            step={5}
                            onChange={handleMaskOpacityChange}
                          >
                            <SliderTrack bg="whiteAlpha.200">
                              <SliderFilledTrack bg="cyan.300" />
                            </SliderTrack>
                            <SliderThumb boxSize={3} />
                          </Slider>
                        </Box>

                        <Box>
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="xs" color="whiteAlpha.800">卡片透明度</Text>
                            <Text fontSize="xs" color="green.200">{cardOpacity}%</Text>
                          </HStack>
                          <Slider
                            aria-label="卡片透明度"
                            value={cardOpacity}
                            min={15}
                            max={100}
                            step={5}
                            onChange={handleCardOpacityChange}
                          >
                            <SliderTrack bg="whiteAlpha.200">
                              <SliderFilledTrack bg="purple.300" />
                            </SliderTrack>
                            <SliderThumb boxSize={3} />
                          </Slider>
                        </Box>

                        <Box>
                          <Text fontSize="xs" color="whiteAlpha.800" mb={1}>随机切换间隔</Text>
                          <Select
                            size="sm"
                            value={rotationIntervalMs}
                            onChange={(event) => handleIntervalChange(event.target.value)}
                            bg="whiteAlpha.120"
                            borderColor="whiteAlpha.220"
                            _hover={{ borderColor: 'whiteAlpha.300' }}
                            _focus={{ borderColor: 'green.300', boxShadow: '0 0 0 1px #86efac' }}
                          >
                            {INTERVAL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value} style={{ color: '#111827' }}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </Box>
                      </VStack>

                      <HStack spacing={2}>
                        <Button
                          leftIcon={<ArrowForwardIcon />}
                          size="sm"
                          variant="ghost"
                          onClick={() => cycleBackground('manual')}
                          isDisabled={totalBackgrounds === 0}
                          isLoading={isSwitching}
                          flex="1"
                          {...trayGhostActionStyles}
                        >
                          Next
                        </Button>
                        <IconButton
                          aria-label="删除当前壁纸"
                          icon={<DeleteIcon />}
                          size="sm"
                          colorScheme="red"
                          variant="solid"
                          onClick={() => void deleteCurrentBackground()}
                          isDisabled={!currentBackground}
                          isLoading={isDeleting}
                        />
                        <IconButton
                          aria-label="收起背景控制托盘"
                          icon={<ChevronDownIcon />}
                          size="sm"
                          variant="ghost"
                          {...trayGhostActionStyles}
                          onClick={toggleControlTray}
                        />
                      </HStack>
                    </VStack>
                  ) : (
                    <VStack align="stretch" spacing={3}>
                      <Text fontSize="sm" color="whiteAlpha.900">当前没有可用壁纸。</Text>
                      <HStack spacing={2}>
                        <Button
                          leftIcon={<RepeatIcon />}
                          size="sm"
                          variant="ghost"
                          onClick={() => void requestBackground({ silent: true })}
                          isLoading={isSwitching}
                          flex="1"
                          {...trayGhostActionStyles}
                        >
                          刷新背景库
                        </Button>
                        <IconButton
                          aria-label="收起背景控制托盘"
                          icon={<ChevronDownIcon />}
                          size="sm"
                          variant="ghost"
                          {...trayGhostActionStyles}
                          onClick={toggleControlTray}
                        />
                      </HStack>
                    </VStack>
                  )}
                </Box>
              </MotionBox>
            ) : (
              <MotionBox
                key="background-control-tray-compact"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <Box px={3} py={3} {...traySurfaceStyles}>
                  <HStack spacing={2}>
                    <IconButton
                      aria-label="下一张背景"
                      icon={<ArrowForwardIcon />}
                      size="sm"
                      variant="ghost"
                      onClick={() => cycleBackground('manual')}
                      isDisabled={totalBackgrounds === 0}
                      isLoading={isSwitching}
                      {...trayGhostActionStyles}
                    />
                    <IconButton
                      aria-label="删除当前壁纸"
                      icon={<DeleteIcon />}
                      size="sm"
                      colorScheme="red"
                      variant="solid"
                      onClick={() => void deleteCurrentBackground()}
                      isDisabled={!currentBackground}
                      isLoading={isDeleting}
                    />
                    <IconButton
                      aria-label="展开背景控制托盘"
                      icon={<ChevronUpIcon />}
                      size="sm"
                      variant="ghost"
                      {...trayGhostActionStyles}
                      onClick={toggleControlTray}
                    />
                  </HStack>
                </Box>
              </MotionBox>
            )}
          </AnimatePresence>
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
