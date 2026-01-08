'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const TRIGGER_KEY = 'pwa_nudge_trigger';
const DISMISS_KEY = 'pwa_nudge_dismissed_until';
const DISMISS_DAYS = 14;
const DISMISS_DAYS_AFTER_CANCEL = 7;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // @ts-expect-error - iOS Safari standalone flag
  window.navigator.standalone === true;

const isIosSafari = () => {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isWebkit = /webkit/.test(ua);
  const isChrome = /crios/.test(ua);
  return isIos && isWebkit && !isChrome;
};

export function PwaNudge() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setShow(false);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return;
    const trigger = sessionStorage.getItem(TRIGGER_KEY);
    if (trigger === '1') {
      sessionStorage.removeItem(TRIGGER_KEY);
      setTriggered(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!triggered) return;
    if (isStandalone()) return;
    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || '0');
    if (Date.now() < dismissedUntil) return;

    if (isIosSafari()) {
      setPlatform('ios');
      setShow(true);
      return;
    }
    if (installPrompt) {
      setPlatform('android');
      setShow(true);
    }
  }, [triggered, installPrompt]);

  const handleDismiss = (days = DISMISS_DAYS) => {
    if (typeof window !== 'undefined') {
      const until = Date.now() + days * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(until));
    }
    setShow(false);
    setShowHow(false);
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'dismissed') {
      handleDismiss(DISMISS_DAYS_AFTER_CANCEL);
    } else {
      setShow(false);
    }
  };

  if (!show || !platform) return null;

  return (
    <>
      <div className="pwa-nudge">
        <div className="pwa-nudge-text">
          {platform === 'ios'
            ? 'Add YapMap to your Home Screen for 1-tap access.'
            : 'Install YapMap for 1-tap access before your call.'}
        </div>
        <div className="pwa-nudge-actions">
          {platform === 'ios' ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowHow(true)}>
              How
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={handleInstall}>
              Install
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => handleDismiss()}>
            Not now
          </button>
        </div>
      </div>

      {showHow && (
        <div className="pwa-sheet" onClick={() => setShowHow(false)}>
          <div className="pwa-sheet-card" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-sheet-title">Add YapMap to Home Screen</div>
            <ol className="pwa-sheet-steps">
              <li>Tap the Share button (square with arrow)</li>
              <li>Tap “Add to Home Screen”</li>
            </ol>
            <button className="btn btn-primary btn-sm" onClick={() => handleDismiss()}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
