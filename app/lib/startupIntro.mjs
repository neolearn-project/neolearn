export const STARTUP_INTRO_KEY = 'neolearnStartupIntroV1';
export function createStartupIntroGate() {
  let claimed = false;
  return storage => {
    if (claimed) return false;
    claimed = true;
    try {
      if (storage?.getItem(STARTUP_INTRO_KEY) === 'seen') return false;
      storage?.setItem(STARTUP_INTRO_KEY, 'seen');
    } catch { /* Memory fallback when browser storage is unavailable. */ }
    return true;
  };
}
export const claimStartupIntro = createStartupIntroGate();
