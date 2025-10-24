import { Sim } from "@dooboostore/simple-boot/decorators/SimDecorator";
import { ValidUtils } from "@dooboostore/core-web/valid/ValidUtils";

@Sim
export class VoiceService {
  private isPlayingWord = false;
  private isPlayingScript = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.initializeVoices();
  }

  private initializeVoices(): void {
    if (!ValidUtils.isBrowser() || !('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not available');
      return;
    }

    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        this.selectedVoice = this.selectBestEnglishVoice(voices);
        
        const englishVoices = voices.filter(v => v.lang.startsWith('en'));
        console.log('Available English voices:');
        englishVoices.forEach(voice => {
          console.log(`- ${voice.name} (${voice.lang}) ${voice.localService ? '[Local]' : '[Remote]'}`);
        });

        if (this.selectedVoice) {
          console.log(`🎤 Selected voice: ${this.selectedVoice.name}`);
        }
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  private isValidVoice(voice: SpeechSynthesisVoice | null): boolean {
    if (!voice) return false;
    
    // Safari 호환성: voice 객체가 유효한지 확인
    try {
      // voice 객체의 필수 속성들이 있는지 확인
      return typeof voice.name === 'string' && 
             typeof voice.lang === 'string' &&
             voice instanceof SpeechSynthesisVoice;
    } catch (error) {
      console.warn('Invalid voice object:', error);
      return false;
    }
  }

  private selectBestEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (!voices || voices.length === 0) return null;

    const voicePriorities = [
      'Samantha', 'Alex', 'Victoria', 'Daniel',
      'Google US English', 'Google UK English Female', 'Google UK English Male',
      'Microsoft Zira Desktop', 'Microsoft David Desktop', 'Microsoft Mark', 'Microsoft Hazel Desktop',
      'Chrome OS US English', 'Microsoft Edge',
      'English'
    ];

    for (const voiceName of voicePriorities) {
      const voice = voices.find(v => v.name.includes(voiceName) && v.lang.startsWith('en'));
      if (voice && this.isValidVoice(voice)) {
        console.log('Selected voice:', voice.name);
        return voice;
      }
    }

    const localEnglishVoice = voices.find(v => v.lang.startsWith('en') && v.localService);
    if (localEnglishVoice && this.isValidVoice(localEnglishVoice)) {
      console.log('Selected local voice:', localEnglishVoice.name);
      return localEnglishVoice;
    }

    const anyEnglishVoice = voices.find(v => v.lang.startsWith('en'));
    if (anyEnglishVoice && this.isValidVoice(anyEnglishVoice)) {
      console.log('Selected fallback voice:', anyEnglishVoice.name);
      return anyEnglishVoice;
    }

    return null;
  }

  speakWord(word: string, onEnd?: () => void): void {
    if (!ValidUtils.isBrowser() || !('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not supported');
      return;
    }

    // Only cancel if we're playing individual words, not scripts
    if (this.isPlayingWord && !this.isPlayingScript) {
      speechSynthesis.cancel();
      this.isPlayingWord = false;
    }

    const cleanWord = word.replace(/[,.":!?;]/g, '').trim();
    if (!cleanWord) return;

    const utterance = new SpeechSynthesisUtterance(cleanWord);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;

    // Safari 호환성: voice가 유효한 SpeechSynthesisVoice 인스턴스인지 확인
    if (this.selectedVoice && this.isValidVoice(this.selectedVoice)) {
      try {
        utterance.voice = this.selectedVoice;
      } catch (error) {
        console.warn('Failed to set voice, using default:', error);
      }
    }

    this.isPlayingWord = true;

    utterance.onstart = () => {
      this.isPlayingWord = true;
    };

    utterance.onend = () => {
      this.isPlayingWord = false;
      console.log(`🔊 Word TTS completed: ${cleanWord}`);
      if (onEnd) onEnd();
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      this.isPlayingWord = false;
    };

    speechSynthesis.speak(utterance);
  }

  speakScript(text: string, onStart?: () => void, onEnd?: () => void, onError?: () => void): void {
    if (!ValidUtils.isBrowser() || !('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not supported');
      return;
    }

    this.stopSpeech();

    const cleanText = text.replace(/[""]/g, '"').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;

    // Safari 호환성: voice가 유효한 SpeechSynthesisVoice 인스턴스인지 확인
    if (this.selectedVoice && this.isValidVoice(this.selectedVoice)) {
      try {
        utterance.voice = this.selectedVoice;
      } catch (error) {
        console.warn('Failed to set voice, using default:', error);
      }
    }

    this.isPlayingScript = true;

    utterance.onstart = () => {
      this.isPlayingScript = true;
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.isPlayingScript = false;
      if (onEnd) onEnd();
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      this.isPlayingScript = false;
      if (onError) onError();
    };

    speechSynthesis.speak(utterance);
  }

  stopSpeech(): { wasPlayingScript: boolean; wasPlayingWord: boolean } {
    if (ValidUtils.isBrowser() && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }

    const wasPlayingScript = this.isPlayingScript;
    const wasPlayingWord = this.isPlayingWord;

    this.isPlayingScript = false;
    this.isPlayingWord = false;

    return { wasPlayingScript, wasPlayingWord };
  }

  isPlaying(): { script: boolean; word: boolean } {
    return {
      script: this.isPlayingScript,
      word: this.isPlayingWord
    };
  }
}
