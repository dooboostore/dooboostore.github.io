import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace VoiceService {
  export const SYMBOL = Symbol.for('VoiceService');
}

export interface VoiceServiceType {
  speakWord(word: string, onEnd?: () => void): void;
  speakScript(text: string, onStart?: () => void, onEnd?: () => void, onError?: () => void): void;
  stopSpeech(): void;
}

// 팩토리: Accommodation 패턴
export default (container: symbol): ConstructorType<VoiceServiceType> => {
  @Sim({ symbol: VoiceService.SYMBOL, container: container })
  class VoiceServiceImpl implements VoiceServiceType {
    private selectedVoice: SpeechSynthesisVoice | null = null;
    private isPlayingWord = false;
    private isPlayingScript = false;

    constructor() {
      if (typeof window !== 'undefined') this.initVoices();
    }
    private isValidVoice(voice: SpeechSynthesisVoice | null): boolean {
      if (!voice) return false;
      try {
        return typeof voice.name === 'string' && typeof voice.lang === 'string';
      } catch { return false; }
    }
    private selectBestEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
      const priorities = ['Samantha', 'Alex', 'Victoria', 'Google US English', 'Google UK English Female', 'Microsoft Zira Desktop', 'Microsoft David Desktop'];
      for (const name of priorities) {
        const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
        if (v && this.isValidVoice(v)) return v;
      }
      return voices.find(v => v.lang.startsWith('en') && v.localService) || voices.find(v => v.lang.startsWith('en')) || null;
    }
    private initVoices() {
      if (!('speechSynthesis' in window)) return;
      const load = () => {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) this.selectedVoice = this.selectBestEnglishVoice(voices);
      };
      load();
      speechSynthesis.onvoiceschanged = load;
    }
    public speakWord(word: string, onEnd?: () => void): void {
      if (!('speechSynthesis' in window)) return;
      if (this.isPlayingWord && !this.isPlayingScript) {
        speechSynthesis.cancel();
        this.isPlayingWord = false;
      }
      const clean = word.replace(/[,.":!?;]/g, '').trim();
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'en-US'; u.rate = 0.9; u.pitch = 1.0; u.volume = 0.9;
      if (this.selectedVoice && this.isValidVoice(this.selectedVoice)) {
        try { u.voice = this.selectedVoice; } catch {}
      }
      this.isPlayingWord = true;
      u.onend = () => { this.isPlayingWord = false; if (onEnd) onEnd(); };
      u.onerror = () => { this.isPlayingWord = false; };
      speechSynthesis.speak(u);
    }
    public speakScript(text: string, onStart?: () => void, onEnd?: () => void, onError?: () => void): void {
      if (!('speechSynthesis' in window)) return;
      this.stopSpeech();
      const clean = text.replace(/[""]/g, '"').trim();
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'en-US'; u.rate = 0.85; u.pitch = 1.0; u.volume = 0.9;
      if (this.selectedVoice && this.isValidVoice(this.selectedVoice)) {
        try { u.voice = this.selectedVoice; } catch {}
      }
      this.isPlayingScript = true;
      u.onstart = () => { this.isPlayingScript = true; if (onStart) onStart(); };
      u.onend = () => { this.isPlayingScript = false; if (onEnd) onEnd(); };
      u.onerror = () => { this.isPlayingScript = false; if (onError) onError(); };
      speechSynthesis.speak(u);
    }
    public stopSpeech(): void {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      this.isPlayingScript = false;
      this.isPlayingWord = false;
    }
  }
  return VoiceServiceImpl;
};
