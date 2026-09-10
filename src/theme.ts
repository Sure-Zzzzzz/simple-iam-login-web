import { applyTheme, createLightThemePreference } from '@sure-zzzzzz/simple-iam-theme-contract';

export function initializeTheme() {
  applyTheme(document.documentElement, createLightThemePreference());
}
