import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Heading,
  VStack,
  FormControl,
  FormLabel,
  Switch,
  useToast,
  Card,
  CardHeader,
  CardBody,
  Text,
  Button,
  HStack,
  useColorModeValue,
  Alert,
  AlertIcon,
  Spinner,
  Center,
  Input,
  FormHelperText,
  Badge
} from '@chakra-ui/react';
import { apiService } from '../services/api';
import { ExerciseTypePreferences, UserPreferences } from '../types';
import { setUiLocaleFromBaseLanguage } from '../i18n/ui';

const exerciseTypeLabels = {
  multiple_choice: '选择题',
  fill_blank: '填空题',
  matching: '配对题',
  true_false: '判断题',
  sentence_completion: '句子补全'
};

const exerciseTypeDescriptions = {
  multiple_choice: '从多个选项中选出正确释义',
  fill_blank: '在句子中填入缺失单词',
  matching: '将单词与释义正确配对',
  true_false: '判断关于单词的陈述是否正确',
  sentence_completion: '用正确单词补完整个句子'
};

type LanguageValidationState = {
  isValid: boolean;
  languageCode: string | null;
  standardizedName: string | null;
  parameters: Array<{
    type: 'script' | 'dialect' | 'formality' | 'region' | 'learning_focus';
    value: string;
    description: string;
  }> | null;
  explanation: string | null;
};

export const Settings: React.FC = () => {
  const [preferences, setPreferences] = useState<UserPreferences>({
    exerciseTypes: {
      multiple_choice: true,
      fill_blank: true,
      matching: true,
      true_false: true,
      sentence_completion: true
    },
    baseLanguage: 'Simplified Chinese',
    targetLanguage: 'Latin American Spanish'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseLanguageInput, setBaseLanguageInput] = useState('Simplified Chinese');
  const [targetLanguageInput, setTargetLanguageInput] = useState('Latin American Spanish');
  const [baseLanguageValidation, setBaseLanguageValidation] = useState<LanguageValidationState | null>(null);
  const [targetLanguageValidation, setTargetLanguageValidation] = useState<LanguageValidationState | null>(null);
  const [validatingBaseLanguage, setValidatingBaseLanguage] = useState(false);
  const [validatingTargetLanguage, setValidatingTargetLanguage] = useState(false);
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  useEffect(() => {
    void loadPreferences();
  }, []);

  const getLanguageDisplayName = (value: string): string => {
    const normalized = value.trim().toLowerCase();
    const commonLanguages: Record<string, string> = {
      en: '英语',
      tr: '土耳其语',
      es: '西班牙语',
      de: '德语',
      fr: '法语',
      it: '意大利语',
      pt: '葡萄牙语',
      ru: '俄语',
      ja: '日语',
      ko: '韩语',
      zh: '中文',
      chinese: '中文',
      spanish: '西班牙语',
      'simplified chinese': '简体中文',
      'latin american spanish': '拉丁美洲西班牙语'
    };

    if (commonLanguages[normalized]) {
      return commonLanguages[normalized];
    }

    if (value.length <= 5 && /^[a-z-]+$/i.test(value)) {
      return value.toUpperCase();
    }

    return value;
  };

  const formatStoredLanguageName = (validation: LanguageValidationState): string => {
    if (!validation.standardizedName) {
      return validation.languageCode || '';
    }

    const parameters = validation.parameters || [];

    if (
      validation.standardizedName === 'Chinese' &&
      parameters.some((param) => param.value === 'simplified')
    ) {
      return 'Simplified Chinese';
    }

    if (
      validation.standardizedName === 'Spanish' &&
      parameters.some((param) => param.value === 'latin_america')
    ) {
      return 'Latin American Spanish';
    }

    return validation.standardizedName;
  };

  const loadPreferences = async () => {
    try {
      const data = await apiService.getPreferences();
      setPreferences(data);

      const baseLangName = getLanguageDisplayName(data.baseLanguage);
      const targetLangName = getLanguageDisplayName(data.targetLanguage);
      setBaseLanguageInput(baseLangName);
      setTargetLanguageInput(targetLangName);

      setBaseLanguageValidation({
        isValid: true,
        languageCode: data.baseLanguage,
        standardizedName: baseLangName,
        parameters: null,
        explanation: null
      });
      setTargetLanguageValidation({
        isValid: true,
        languageCode: data.targetLanguage,
        standardizedName: targetLangName,
        parameters: null,
        explanation: null
      });

      setUiLocaleFromBaseLanguage(data.baseLanguage);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      toast({
        title: '加载失败',
        description: '读取偏好失败，已使用默认设置。',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const validateLanguage = async (language: string, type: 'base' | 'target') => {
    if (!language.trim()) return;

    const setValidating = type === 'base' ? setValidatingBaseLanguage : setValidatingTargetLanguage;
    const setValidation = type === 'base' ? setBaseLanguageValidation : setTargetLanguageValidation;

    setValidating(true);
    try {
      const result = await apiService.validateLanguage(language.trim());
      setValidation(result);

      if (result.isValid) {
        const storedLanguage = formatStoredLanguageName(result);
        if (type === 'base') {
          setPreferences((prev) => ({ ...prev, baseLanguage: storedLanguage }));
        } else {
          setPreferences((prev) => ({ ...prev, targetLanguage: storedLanguage }));
        }
      }
    } catch (error) {
      console.error('Failed to validate language:', error);
      setValidation({
        isValid: false,
        languageCode: null,
        standardizedName: null,
        parameters: null,
        explanation: '语言校验失败，请稍后重试。'
      });
    } finally {
      setValidating(false);
    }
  };

  const handleBaseLanguageChange = (value: string) => {
    setBaseLanguageInput(value);
    setBaseLanguageValidation(null);
  };

  const handleTargetLanguageChange = (value: string) => {
    setTargetLanguageInput(value);
    setTargetLanguageValidation(null);
  };

  const handleToggle = (type: keyof ExerciseTypePreferences) => {
    const newExerciseTypes = { ...preferences.exerciseTypes, [type]: !preferences.exerciseTypes[type] };
    const enabledCount = Object.values(newExerciseTypes).filter(Boolean).length;

    if (enabledCount === 0) {
      toast({
        title: '提示',
        description: '至少需要启用一种练习类型。',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setPreferences({ ...preferences, exerciseTypes: newExerciseTypes });
  };

  const savePreferences = async () => {
    let latestBaseValidation = baseLanguageValidation;
    let latestTargetValidation = targetLanguageValidation;

    if (!latestBaseValidation && baseLanguageInput.trim()) {
      const result = await apiService.validateLanguage(baseLanguageInput.trim());
      setBaseLanguageValidation(result);
      latestBaseValidation = result;
      if (result.isValid) {
        setPreferences((prev) => ({ ...prev, baseLanguage: formatStoredLanguageName(result) }));
      }
    }

    if (!latestTargetValidation && targetLanguageInput.trim()) {
      const result = await apiService.validateLanguage(targetLanguageInput.trim());
      setTargetLanguageValidation(result);
      latestTargetValidation = result;
      if (result.isValid) {
        setPreferences((prev) => ({ ...prev, targetLanguage: formatStoredLanguageName(result) }));
      }
    }

    if (!latestBaseValidation?.isValid || !latestTargetValidation?.isValid) {
      toast({
        title: '语言无效',
        description: '请先确认母语和目标语言都校验通过。',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setSaving(true);
    try {
      const nextPreferences = {
        ...preferences,
        baseLanguage: formatStoredLanguageName(latestBaseValidation),
        targetLanguage: formatStoredLanguageName(latestTargetValidation)
      };
      setPreferences(nextPreferences);
      await apiService.updatePreferences(nextPreferences);
      setUiLocaleFromBaseLanguage(nextPreferences.baseLanguage);

      toast({
        title: '保存成功',
        description: '偏好设置已保存。',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Failed to save preferences:', error);
      toast({
        title: '保存失败',
        description: '保存偏好失败，请稍后重试。',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = Object.values(preferences.exerciseTypes).filter(Boolean).length;

  if (loading) {
    return (
      <Container maxW="container.md" py={8}>
        <Center>
          <Spinner size="lg" color="blue.500" />
        </Center>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8} px={{ base: 4, md: 8 }}>
      <VStack spacing={8} align="stretch">
        <Box mb={6}>
          <HStack spacing={3} mb={2}>
            <Text fontSize="2xl">⚙️</Text>
            <Heading size="xl" color="blue.500">
              设置
            </Heading>
          </HStack>
          <Text color="gray.600" fontSize="lg">
            自定义你的学习体验
          </Text>
        </Box>

        <Card bg={cardBg} borderColor={borderColor} borderWidth="1px" shadow="2xl">
          <CardHeader pb={4}>
            <VStack align="start" spacing={3}>
              <HStack spacing={3}>
                <Text fontSize="2xl">🌐</Text>
                <Heading size="md" color="blue.500">语言设置</Heading>
              </HStack>
              <Text color={useColorModeValue('gray.700', 'gray.300')} fontSize="md" lineHeight="1.6">
                设置你的母语和目标语言。它会影响词义解释、例句说明以及 AI 生成内容的展示语言。
              </Text>
              <Alert status="info" borderRadius="md" py={3}>
                <AlertIcon />
                <VStack align="start" spacing={2}>
                  <Text fontSize="sm" fontWeight="medium" color={useColorModeValue('blue.800', 'blue.200')}>
                    修改后会立即应用到新生成的单词、例句和练习中。
                  </Text>
                  <Text fontSize="sm" color={useColorModeValue('gray.700', 'gray.300')}>
                    你可以填写带变体的语言，例如 “Simplified Chinese”“Latin American Spanish”“Brazilian Portuguese”。
                  </Text>
                </VStack>
              </Alert>
            </VStack>
          </CardHeader>
          <CardBody pt={2} px={{ base: 4, md: 8 }} py={6}>
            <VStack spacing={6} align="stretch">
              <Box p={4} bg={useColorModeValue('blue.50', 'blue.900')} borderRadius="lg" borderWidth="1px" borderColor={useColorModeValue('blue.200', 'blue.700')}>
                <FormControl isInvalid={baseLanguageValidation?.isValid === false}>
                  <FormLabel fontWeight="semibold" fontSize="md" color={useColorModeValue('blue.700', 'blue.200')}>
                    你的母语（解释语言）
                  </FormLabel>
                  <HStack spacing={3}>
                    <Input
                      value={baseLanguageInput}
                      onChange={(e) => handleBaseLanguageChange(e.target.value)}
                      placeholder="例如：Simplified Chinese"
                      bg={useColorModeValue('white', 'gray.800')}
                      flex={1}
                      borderColor={useColorModeValue('blue.300', 'blue.600')}
                      _hover={{ borderColor: useColorModeValue('blue.400', 'blue.500') }}
                      _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 1px blue.500' }}
                    />
                    <Button
                      onClick={() => void validateLanguage(baseLanguageInput, 'base')}
                      isLoading={validatingBaseLanguage}
                      loadingText="校验中"
                      colorScheme="cyan"
                      variant="solid"
                      size="md"
                      isDisabled={!baseLanguageInput.trim()}
                      minW="100px"
                    >
                      校验
                    </Button>
                  </HStack>
                  {baseLanguageValidation?.isValid && (
                    <Box mt={3} p={3} bg={useColorModeValue('blue.100', 'blue.800')} borderRadius="md" borderWidth="1px" borderColor={useColorModeValue('blue.300', 'blue.600')}>
                      <HStack spacing={2}>
                        <Text color={useColorModeValue('blue.800', 'blue.100')} fontWeight="semibold" fontSize="sm">
                          ✓ {getLanguageDisplayName(formatStoredLanguageName(baseLanguageValidation))}
                        </Text>
                      </HStack>
                      {baseLanguageValidation.parameters && baseLanguageValidation.parameters.length > 0 && (
                        <HStack wrap="wrap" spacing={1} mt={2}>
                          {baseLanguageValidation.parameters.map((param, index) => (
                            <Badge key={index} colorScheme="blue" variant="subtle" fontSize="xs">
                              {param.description}
                            </Badge>
                          ))}
                        </HStack>
                      )}
                    </Box>
                  )}
                  {baseLanguageValidation?.isValid === false && (
                    <Box mt={3} p={3} bg={useColorModeValue('red.50', 'red.900')} borderRadius="md" borderWidth="1px" borderColor={useColorModeValue('red.200', 'red.700')}>
                      <Text color={useColorModeValue('red.700', 'red.200')} fontSize="sm">
                        {baseLanguageValidation.explanation}
                      </Text>
                    </Box>
                  )}
                  <FormHelperText mt={3} color={useColorModeValue('gray.600', 'gray.400')}>
                    单词释义与解释会优先用这个语言展示
                  </FormHelperText>
                </FormControl>
              </Box>

              <Box p={4} bg={useColorModeValue('green.50', 'green.900')} borderRadius="lg" borderWidth="1px" borderColor={useColorModeValue('green.200', 'green.700')}>
                <FormControl isInvalid={targetLanguageValidation?.isValid === false}>
                  <FormLabel fontWeight="semibold" fontSize="md" color={useColorModeValue('green.700', 'green.200')}>
                    你正在学习的语言（目标语言）
                  </FormLabel>
                  <HStack spacing={3}>
                    <Input
                      value={targetLanguageInput}
                      onChange={(e) => handleTargetLanguageChange(e.target.value)}
                      placeholder="例如：Latin American Spanish"
                      bg={useColorModeValue('white', 'gray.800')}
                      flex={1}
                      borderColor={useColorModeValue('green.300', 'green.600')}
                      _hover={{ borderColor: useColorModeValue('green.400', 'green.500') }}
                      _focus={{ borderColor: 'green.500', boxShadow: '0 0 0 1px green.500' }}
                    />
                    <Button
                      onClick={() => void validateLanguage(targetLanguageInput, 'target')}
                      isLoading={validatingTargetLanguage}
                      loadingText="校验中"
                      colorScheme="green"
                      variant="solid"
                      size="md"
                      isDisabled={!targetLanguageInput.trim()}
                      minW="100px"
                    >
                      校验
                    </Button>
                  </HStack>
                  {targetLanguageValidation?.isValid && (
                    <Box mt={3} p={3} bg={useColorModeValue('green.100', 'green.800')} borderRadius="md" borderWidth="1px" borderColor={useColorModeValue('green.300', 'green.600')}>
                      <HStack spacing={2}>
                        <Text color={useColorModeValue('green.800', 'green.100')} fontWeight="semibold" fontSize="sm">
                          ✓ {getLanguageDisplayName(formatStoredLanguageName(targetLanguageValidation))}
                        </Text>
                      </HStack>
                      {targetLanguageValidation.parameters && targetLanguageValidation.parameters.length > 0 && (
                        <HStack wrap="wrap" spacing={1} mt={2}>
                          {targetLanguageValidation.parameters.map((param, index) => (
                            <Badge key={index} colorScheme="green" variant="subtle" fontSize="xs">
                              {param.description}
                            </Badge>
                          ))}
                        </HStack>
                      )}
                    </Box>
                  )}
                  {targetLanguageValidation?.isValid === false && (
                    <Box mt={3} p={3} bg={useColorModeValue('red.50', 'red.900')} borderRadius="md" borderWidth="1px" borderColor={useColorModeValue('red.200', 'red.700')}>
                      <Text color={useColorModeValue('red.700', 'red.200')} fontSize="sm">
                        {targetLanguageValidation.explanation}
                      </Text>
                    </Box>
                  )}
                  <FormHelperText mt={3} color={useColorModeValue('gray.600', 'gray.400')}>
                    单词本体、例句与练习会以这个语言为目标语言生成
                  </FormHelperText>
                </FormControl>
              </Box>

              {preferences.baseLanguage === preferences.targetLanguage && (
                <Alert status="warning" borderRadius="md" py={3}>
                  <AlertIcon />
                  <Text fontSize="sm">
                    你把母语和目标语言设成了同一种语言，这更适合做单语练习。
                  </Text>
                </Alert>
              )}
            </VStack>
          </CardBody>
        </Card>

        <Card bg={cardBg} borderColor={borderColor} borderWidth="1px" shadow="2xl">
          <CardHeader pb={4}>
            <VStack align="start" spacing={3}>
              <HStack spacing={3}>
                <Text fontSize="2xl">🎯</Text>
                <Heading size="md" color="blue.500">练习类型</Heading>
              </HStack>
              <Text color={useColorModeValue('gray.700', 'gray.300')} fontSize="md" lineHeight="1.6">
                选择你希望启用的练习题型。你可以按自己的偏好开启或关闭特定题型。
              </Text>
              <Alert status="info" borderRadius="md" py={3}>
                <AlertIcon />
                <Text fontSize="sm" fontWeight="medium" color={useColorModeValue('blue.800', 'blue.200')}>
                  修改后会应用到新的学习会话和测验中。
                </Text>
              </Alert>
            </VStack>
          </CardHeader>
          <CardBody pt={2} px={{ base: 4, md: 8 }} py={6}>
            <VStack spacing={4} align="stretch">
              {Object.entries(exerciseTypeLabels).map(([type, label]) => (
                <Box
                  key={type}
                  p={4}
                  borderWidth="1px"
                  borderRadius="lg"
                  borderColor={borderColor}
                  bg={preferences.exerciseTypes[type as keyof ExerciseTypePreferences]
                    ? useColorModeValue('purple.50', 'purple.900')
                    : useColorModeValue('gray.50', 'gray.800')}
                  transition="all 0.2s"
                  _hover={{
                    borderColor: useColorModeValue('purple.300', 'purple.600'),
                    transform: 'translateY(-2px)',
                    shadow: 'md'
                  }}
                >
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={2} flex={1}>
                      <HStack spacing={2}>
                        <Text fontSize="lg">
                          {type === 'multiple_choice' && '🧠'}
                          {type === 'fill_blank' && '📝'}
                          {type === 'matching' && '🔗'}
                          {type === 'true_false' && '✅'}
                          {type === 'sentence_completion' && '💬'}
                        </Text>
                        <Text fontWeight="semibold" fontSize="md">{label}</Text>
                      </HStack>
                      <Text fontSize="sm" color={useColorModeValue('gray.600', 'gray.400')} lineHeight="1.5">
                        {exerciseTypeDescriptions[type as keyof typeof exerciseTypeDescriptions]}
                      </Text>
                    </VStack>
                    <FormControl display="flex" alignItems="center" width="auto">
                      <Switch
                        id={type}
                        isChecked={preferences.exerciseTypes[type as keyof ExerciseTypePreferences]}
                        onChange={() => handleToggle(type as keyof ExerciseTypePreferences)}
                        colorScheme="purple"
                        size="lg"
                      />
                    </FormControl>
                  </HStack>
                </Box>
              ))}

              <Box
                mt={6}
                p={4}
                bg={useColorModeValue('gray.50', 'gray.700')}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={useColorModeValue('gray.200', 'gray.600')}
              >
                <HStack justify="space-between" align="center">
                  <VStack align="start" spacing={1}>
                    <Text fontSize="sm" fontWeight="semibold" color={useColorModeValue('gray.700', 'gray.200')}>
                      当前启用题型
                    </Text>
                    <Text fontSize="xs" color={useColorModeValue('gray.600', 'gray.400')}>
                      已启用 {enabledCount} / {Object.keys(exerciseTypeLabels).length} 种题型
                    </Text>
                  </VStack>
                  <Box>
                    <Text fontSize="2xl" fontWeight="bold" color="purple.500">
                      {enabledCount}/{Object.keys(exerciseTypeLabels).length}
                    </Text>
                  </Box>
                </HStack>
              </Box>

              <Button
                colorScheme="blue"
                onClick={() => void savePreferences()}
                isLoading={saving}
                loadingText="保存中…"
                size="lg"
                w="full"
                py={6}
                fontSize="md"
                fontWeight="semibold"
                _hover={{
                  transform: 'translateY(-2px)',
                  shadow: 'lg'
                }}
                transition="all 0.2s"
              >
                保存设置
              </Button>
            </VStack>
          </CardBody>
        </Card>
      </VStack>
    </Container>
  );
};
