import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeTheme } from './theme';

describe('initializeTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-iam-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('始终应用浅色主题，不访问门户主题缓存', () => {
    document.documentElement.dataset.theme = 'dark';
    localStorage.setItem('simple-iam-theme', 'blue');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    initializeTheme();

    expect(document.documentElement.dataset.iamTheme).toBe('light');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
