/**
 * Internationalization (i18n) setup — bilingual PT-BR / EN.
 *
 * Uses i18next with browser language detection. The detected/selected language
 * is also persisted to the user's settings when authenticated.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ptBR from './locales/pt-BR.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['pt', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: ptBR },
      en: { translation: en },
    },
    fallbackLng: 'pt',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'gerador3d_lang',
      caches: ['localStorage'],
    },
  })

export default i18n
