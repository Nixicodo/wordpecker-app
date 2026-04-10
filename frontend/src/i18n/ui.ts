export type UiLocale = 'zh-CN' | 'en';

const UI_LOCALE_KEY = 'wordpecker-ui-locale';

export const isChineseLanguage = (value?: string): boolean => {
  if (!value) return false;
  return /zh|chinese|中文|简体/i.test(value);
};

export const detectUiLocale = (baseLanguage?: string): UiLocale => {
  if (isChineseLanguage(baseLanguage)) {
    return 'zh-CN';
  }

  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(UI_LOCALE_KEY);
    if (stored === 'zh-CN' || stored === 'en') {
      return stored;
    }

    if (window.navigator.language.toLowerCase().startsWith('zh')) {
      return 'zh-CN';
    }
  }

  return 'en';
};

export const setUiLocaleFromBaseLanguage = (baseLanguage?: string): UiLocale => {
  const locale = detectUiLocale(baseLanguage);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(UI_LOCALE_KEY, locale);
  }

  return locale;
};
