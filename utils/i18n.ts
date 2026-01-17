import * as Localization from 'expo-localization';

type TranslationVars = Record<string, string | number>;

const TRANSLATIONS: Record<string, Record<string, string>> = {
  ka: {
    'post.readTime': '{{minutes}} წთ წასაკითხად',
  },
  en: {
    'post.readTime': '{{minutes}} min read',
  },
};

function getLocale(): string {
  const locale = Localization.getLocales()[0]?.languageCode ?? 'ka';
  return TRANSLATIONS[locale] ? locale : 'ka';
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

export function t(key: string, vars?: TranslationVars): string {
  const locale = getLocale();
  const template = TRANSLATIONS[locale]?.[key] ?? TRANSLATIONS.ka?.[key] ?? key;
  return interpolate(template, vars);
}
