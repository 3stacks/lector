// Browser Text-to-Speech wrapper for Afrikaans

// Default speech rate (1.0 is normal speed)
const DEFAULT_RATE = 0.9;

// Afrikaans language code
const AFRIKAANS_LANG = "af-ZA";

// Fallback languages if Afrikaans is not available
const FALLBACK_LANGS = ["af", "nl-NL", "nl"]; // Dutch is somewhat similar

// Preferred voice name patterns (higher quality voices)
const PREFERRED_VOICE_PATTERNS = [
  /google/i,
  /premium/i,
  /enhanced/i,
  /natural/i,
  /neural/i,
];

// Voice names to avoid (often robotic sounding)
const AVOID_VOICE_PATTERNS = [
  /espeak/i,
  /mbrola/i,
];

// Cached voice selection
let cachedVoice: SpeechSynthesisVoice | undefined;
let voiceInitialized = false;

// LocalStorage key for user's preferred voice
const VOICE_PREF_KEY = 'afrikaans-reader-tts-voice';

/**
 * Check if the browser supports the Web Speech API
 * @returns true if TTS is available
 */
export function isTTSAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Score a voice based on quality indicators
 * Higher score = better quality
 */
function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;

  // Prefer local/offline voices (usually higher quality)
  if (voice.localService) score += 5;

  // Prefer voices with preferred name patterns
  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    if (pattern.test(voice.name)) {
      score += 10;
      break;
    }
  }

  // Avoid certain voice types
  for (const pattern of AVOID_VOICE_PATTERNS) {
    if (pattern.test(voice.name)) {
      score -= 20;
      break;
    }
  }

  // Prefer exact language match
  if (voice.lang === AFRIKAANS_LANG) score += 3;
  if (voice.lang.startsWith("af")) score += 2;

  return score;
}

/**
 * Get the best available voice for Afrikaans
 * Caches the result for consistent voice selection
 * @returns The voice to use, or undefined if none found
 */
function getAfrikaansVoice(): SpeechSynthesisVoice | undefined {
  if (!isTTSAvailable()) {
    return undefined;
  }

  // Return cached voice if already selected
  if (voiceInitialized && cachedVoice) {
    return cachedVoice;
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    return undefined;
  }

  // Check for user's saved preference
  const savedVoiceName = localStorage.getItem(VOICE_PREF_KEY);
  if (savedVoiceName) {
    const savedVoice = voices.find(v => v.name === savedVoiceName);
    if (savedVoice) {
      cachedVoice = savedVoice;
      voiceInitialized = true;
      return cachedVoice;
    }
  }

  // Find all candidate voices (Afrikaans or Dutch)
  const allLangs = [AFRIKAANS_LANG, "af", ...FALLBACK_LANGS];
  const candidateVoices = voices.filter(v =>
    allLangs.some(lang => v.lang === lang || v.lang.startsWith(lang.split("-")[0]))
  );

  if (candidateVoices.length === 0) {
    voiceInitialized = true;
    return undefined;
  }

  // Sort by score and pick the best one
  candidateVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a));
  cachedVoice = candidateVoices[0];
  voiceInitialized = true;

  // Save the selection for next time
  if (cachedVoice) {
    localStorage.setItem(VOICE_PREF_KEY, cachedVoice.name);
  }

  return cachedVoice;
}

/**
 * Set a specific voice by name
 * @param voiceName - The name of the voice to use
 */
export function setPreferredVoice(voiceName: string): void {
  if (!isTTSAvailable()) return;

  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.name === voiceName);

  if (voice) {
    cachedVoice = voice;
    voiceInitialized = true;
    localStorage.setItem(VOICE_PREF_KEY, voiceName);
  }
}

/**
 * Get the currently selected voice name
 */
export function getCurrentVoiceName(): string | undefined {
  return cachedVoice?.name || localStorage.getItem(VOICE_PREF_KEY) || undefined;
}

/**
 * Speak text in Afrikaans using the browser's speech synthesis
 * @param text - The text to speak
 * @param rate - Speech rate (0.1 to 10, default 0.9 for clearer learning)
 */
export function speak(text: string, rate: number = DEFAULT_RATE): void {
  if (!isTTSAvailable()) {
    console.warn("Text-to-speech is not available in this browser");
    return;
  }

  // Stop any current speech
  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);

  // Set the voice (try Afrikaans, fall back to Dutch)
  const voice = getAfrikaansVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    // Set language even without a specific voice
    utterance.lang = AFRIKAANS_LANG;
  }

  // Set speech parameters
  utterance.rate = Math.max(0.1, Math.min(10, rate));
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Speak
  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any current speech
 */
export function stopSpeaking(): void {
  if (!isTTSAvailable()) {
    return;
  }

  window.speechSynthesis.cancel();
}

/**
 * Get available voices for Afrikaans or Dutch
 * Useful for debugging or letting users choose a voice
 * @returns Array of available voices
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isTTSAvailable()) {
    return [];
  }

  const voices = window.speechSynthesis.getVoices();
  const relevantLangs = [AFRIKAANS_LANG, ...FALLBACK_LANGS];

  return voices.filter((v) =>
    relevantLangs.some(
      (lang) => v.lang === lang || v.lang.startsWith(lang.split("-")[0])
    )
  );
}

/**
 * Wait for voices to be loaded and initialize the cache
 * Some browsers load voices asynchronously
 * @returns Promise that resolves when voices are available
 */
export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isTTSAvailable()) {
      resolve([]);
      return;
    }

    const initializeAndResolve = () => {
      const voices = window.speechSynthesis.getVoices();
      // Pre-initialize the voice cache
      if (voices.length > 0 && !voiceInitialized) {
        getAfrikaansVoice();
      }
      resolve(voices);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      initializeAndResolve();
      return;
    }

    // Wait for voiceschanged event
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      initializeAndResolve,
      { once: true }
    );

    // Timeout after 3 seconds
    setTimeout(initializeAndResolve, 3000);
  });
}

/**
 * Reset voice cache (useful if user wants to re-select)
 */
export function resetVoiceCache(): void {
  cachedVoice = undefined;
  voiceInitialized = false;
  localStorage.removeItem(VOICE_PREF_KEY);
}
