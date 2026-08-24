'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import styles from './dashboard.module.css';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const currentTheme =
      document.documentElement.getAttribute('data-theme') ||
      localStorage.getItem('zedarchive-theme') ||
      'dark';
    setTheme(currentTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    try {
      localStorage.setItem('zedarchive-theme', nextTheme);
    } catch (e) {}
  };

  if (!mounted) {
    return (
      <button
        type="button"
        className={styles.themeToggleBtn}
        aria-label="Toggle light and dark mode"
        disabled
      >
        <span className={styles.themeToggleIconWrapper}>
          <Moon size={18} strokeWidth={1.75} />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.themeToggleBtn}
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      <span className={styles.themeToggleIconWrapper}>
        {theme === 'dark' ? (
          <Sun size={18} strokeWidth={1.75} className={styles.sunIcon} />
        ) : (
          <Moon size={18} strokeWidth={1.75} className={styles.moonIcon} />
        )}
      </span>
    </button>
  );
}
