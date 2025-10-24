import { Router } from '@dooboostore/simple-boot/decorators/route/Router';
import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './english.router.component.html';
import styles from './english.router.component.css';
import { ComponentRouterBase } from '@dooboostore/simple-boot-front/component/ComponentRouterBase';
import { EnglishRouteComponent } from './english.route.component';
import { ChildrenSet, query } from '@dooboostore/dom-render/components/ComponentBase';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { OnCreateRenderDataParams } from '@dooboostore/dom-render/lifecycle/OnCreateRenderData';
import { OnCreatedOutletDebounce } from '@dooboostore/dom-render/components/ComponentRouterBase';
import { ValidUtils } from "@dooboostore/core-web/valid/ValidUtils";
import { SimFrontOption } from "@dooboostore/simple-boot-front/option/SimFrontOption";
import { ApiService } from "@dooboostore/simple-boot/fetch/ApiService";
import { PlayerRouteComponent } from '@src/pages/english/player/player.route.component';

export type FavoriteWord = {
  text: string;
  meaning: string;
  addedAt: number;
};

export type Item = { name: string; type?: string; img: string; link?: string };

@Sim
@Router({
  path: '/english',
  route: {
    '': '/',
    '/': EnglishRouteComponent,
    '/{name}': PlayerRouteComponent,
    '/{name}/': PlayerRouteComponent,

  },
  routers: []
})
@Component({
  template,
  styles
})
export class EnglishRouterComponent extends ComponentRouterBase implements OnCreatedOutletDebounce {
  favoriteWords: FavoriteWord[] = [];
  showFavorites = false;

  // Current item info
  currentItemName?: string;
  currentItem?: Item;
  items?: Item[];
  isInSubRoute = false; // Track if we're in a sub-route

  constructor(private config: SimFrontOption, private apiService: ApiService) {
    super({ sameRouteNoApply: true });
  }

  onCreateRenderData(data: OnCreateRenderDataParams): void {

  }

  async onInitRender(param: any, rawSet: RawSet) {
    await super.onInitRender(param, rawSet);

    console.log('-------')
    // Load favorite words from localStorage
    this.loadFavoriteWords();

    // Initialize speech synthesis voices
    this.initializeSpeechSynthesis();

    // Load items data
    if (ValidUtils.isBrowser()) {
      try {
        this.items = await this.apiService.get<Item[]>({ target: '/datas/english/items.json' });
        console.log('Loaded items:', this.items.length);
      } catch (error) {
        console.error('Failed to load items:', error);
      }
    }
  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    await super.onRouting(r);


    // Get current item name from route
    this.currentItemName = r.routerModule.pathData?.name;
    console.log('------->', r, this.currentItemName)
    // Check if we're in a sub-route (has name parameter)
    this.isInSubRoute = !!this.currentItemName;

    // Find current item info
    if (this.currentItemName && this.items) {
      this.currentItem = this.items.find(item => item.name === this.currentItemName);
      console.log('Current item:', this.currentItem);
    } else {
      this.currentItem = undefined;
    }
  }

  onCreatedThisChild(child: any, data: OnCreateRenderDataParams) {
    super.onCreatedThisChild(child, data);
  }

  onCreatedThisChildDebounce(childrenSet: ChildrenSet[]) {
    super.onCreatedThisChildDebounce(childrenSet);
  }

  onDrThisUnBind() {
    super.onDrThisUnBind();
    this.onDestroyRender();
  }

  onDestroyRender(data?: any) {
    super.onDestroyRender(data);
  }

  onCreatedOutletDebounce(a: any) {
    // Prism.highlightAll() 전체 하이라이트 제거
  }

  // Load favorite words from localStorage
  private loadFavoriteWords() {
    if (!ValidUtils.isBrowser()) return;

    try {
      const stored = localStorage.getItem('english-favorite-words');
      if (stored) {
        this.favoriteWords = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load favorite words:', error);
      this.favoriteWords = [];
    }
  }

  // Save favorite words to localStorage
  private saveFavoriteWords() {
    if (!ValidUtils.isBrowser()) return;

    try {
      localStorage.setItem('english-favorite-words', JSON.stringify(this.favoriteWords));
    } catch (error) {
      console.error('Failed to save favorite words:', error);
    }
  }

  // Add word to favorites
  addToFavorites = (word: string, meaning: string) => {
    
    // Check if word already exists
    const exists = this.favoriteWords.some(fav => fav.text.toLowerCase() === word.toLowerCase());
    if (exists) {
      console.log('Word already in favorites:', word);
      return false;
    }

    // Add new favorite word
    const newFavorite: FavoriteWord = {
      text: word,
      meaning: meaning,
      addedAt: Date.now()
    };

    this.favoriteWords.unshift(newFavorite); // Add to beginning
    this.saveFavoriteWords();

    console.log('Added to favorites:', word);
    return true;
  }

  // Remove word from favorites
  removeFavorite(word: string) {
    this.favoriteWords = this.favoriteWords.filter(fav => fav.text.toLowerCase() !== word.toLowerCase());
    this.saveFavoriteWords();
    console.log('Removed from favorites:', word);
  }

  // Check if word is in favorites
  isWordFavorite = (word: string): boolean => {
    return this.favoriteWords.some(fav => fav.text.toLowerCase() === word.toLowerCase());
  }

  // Toggle favorites panel
  toggleFavorites() {
    this.showFavorites = !this.showFavorites;
  }

  private initializeSpeechSynthesis() {
    if (!ValidUtils.isBrowser() || !('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not available');
      return;
    }

    // Load voices (some browsers need this)
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        const englishVoices = voices.filter(v => v.lang.startsWith('en'));
        console.log('Available English voices:');
        englishVoices.forEach(voice => {
          console.log(`- ${voice.name} (${voice.lang}) ${voice.localService ? '[Local]' : '[Remote]'}`);
        });

        // Show which voice will be selected
        const selectedVoice = this.selectBestEnglishVoice(voices);
        if (selectedVoice) {
          console.log(`🎤 Selected voice: ${selectedVoice.name}`);
        }
      }
    };

    // Load voices immediately
    loadVoices();

    // Also load when voices change (for Chrome)
    speechSynthesis.onvoiceschanged = loadVoices;
  }



  // Navigate to home (english main page)
  goToHome() {
    if (ValidUtils.isBrowser()) {
      window.location.href = '/english/';
    }
  }

  // Speak word using TTS
  speakWord(word: string) {
    if (!ValidUtils.isBrowser()) {
      return;
    }

    // Check if browser supports Speech Synthesis
    if (!('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not supported in this browser');
      return;
    }

    // Stop any ongoing speech
    speechSynthesis.cancel();

    // Clean the word (remove punctuation)
    const cleanWord = word.replace(/[,.":!?;]/g, '').trim();
    if (!cleanWord) return;

    // Ensure voices are loaded before speaking
    const speakWithVoices = () => {
      const voices = speechSynthesis.getVoices();
      
      if (voices.length === 0) {
        // If no voices loaded yet, try again after a short delay
        setTimeout(speakWithVoices, 100);
        return;
      }

      // Create speech utterance
      const utterance = new SpeechSynthesisUtterance(cleanWord);

      // Configure speech settings for most natural sound
      utterance.lang = 'en-US';
      utterance.rate = 0.85; // Slightly slower for better clarity and naturalness
      utterance.pitch = 0.95; // Slightly lower pitch for more natural sound
      utterance.volume = 0.8; // Comfortable volume level

      // Select the best available English voice
      const bestVoice = this.selectBestEnglishVoice(voices);

      if (bestVoice) {
        utterance.voice = bestVoice;
        console.log(`🎤 Using voice: ${bestVoice.name} for word: ${cleanWord}`);
      } else {
        console.warn('No suitable English voice found, using default');
      }

      // Handle speech events
      utterance.onstart = () => {
        console.log(`🔊 Speaking word: ${cleanWord}`);
      };

      utterance.onend = () => {
        console.log(`🔊 Word TTS completed: ${cleanWord}`);
      };

      // Error handling
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error);
      };

      // Speak the word
      speechSynthesis.speak(utterance);
    };

    // Start speaking (will wait for voices if needed)
    speakWithVoices();
  }

  private selectBestEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (!voices || voices.length === 0) return null;

    // Enhanced priority order for the most natural-sounding English voices
    const voicePriorities = [
      // macOS voices (extremely natural, human-like)
      { name: 'Samantha', priority: 10 },
      { name: 'Alex', priority: 9 },
      { name: 'Victoria', priority: 8 },
      { name: 'Daniel', priority: 7 },
      { name: 'Karen', priority: 6 },

      // Google voices (high quality neural voices)
      { name: 'Google US English', priority: 8 },
      { name: 'Google UK English Female', priority: 7 },
      { name: 'Google UK English Male', priority: 6 },

      // Microsoft Edge voices (newer, more natural)
      { name: 'Microsoft Aria Online', priority: 8 },
      { name: 'Microsoft Jenny Online', priority: 7 },
      { name: 'Microsoft Guy Online', priority: 6 },

      // Microsoft Desktop voices (good quality)
      { name: 'Microsoft Zira Desktop', priority: 5 },
      { name: 'Microsoft David Desktop', priority: 4 },
      { name: 'Microsoft Mark', priority: 4 },
      { name: 'Microsoft Hazel Desktop', priority: 3 },

      // Chrome OS voices
      { name: 'Chrome OS US English', priority: 5 },
    ];

    // Find the best matching voice with highest priority
    let bestVoice: SpeechSynthesisVoice | null = null;
    let highestPriority = 0;

    for (const voicePriority of voicePriorities) {
      const voice = voices.find(v => 
        v.name.includes(voicePriority.name) && 
        v.lang.startsWith('en')
      );
      
      if (voice && voicePriority.priority > highestPriority) {
        bestVoice = voice;
        highestPriority = voicePriority.priority;
      }
    }

    if (bestVoice) {
      console.log(`🎤 Selected high-priority voice: ${bestVoice.name} (Priority: ${highestPriority})`);
      return bestVoice;
    }

    // If no priority voice found, prefer local voices over remote ones
    const localEnglishVoices = voices.filter(v => 
      v.lang.startsWith('en') && v.localService
    );
    
    if (localEnglishVoices.length > 0) {
      // Prefer female voices as they tend to sound more natural
      const femaleVoice = localEnglishVoices.find(v => 
        v.name.toLowerCase().includes('female') || 
        v.name.toLowerCase().includes('woman') ||
        v.name.toLowerCase().includes('samantha') ||
        v.name.toLowerCase().includes('victoria') ||
        v.name.toLowerCase().includes('karen')
      );
      
      if (femaleVoice) {
        console.log(`🎤 Selected local female voice: ${femaleVoice.name}`);
        return femaleVoice;
      }
      
      console.log(`🎤 Selected local voice: ${localEnglishVoices[0].name}`);
      return localEnglishVoices[0];
    }

    // Fallback to any English voice, preferring US English
    const usEnglishVoice = voices.find(v => 
      v.lang === 'en-US' || v.lang.startsWith('en-US')
    );
    if (usEnglishVoice) {
      console.log(`🎤 Selected US English voice: ${usEnglishVoice.name}`);
      return usEnglishVoice;
    }

    // Final fallback to any English voice
    const anyEnglishVoice = voices.find(v => v.lang.startsWith('en'));
    if (anyEnglishVoice) {
      console.log(`🎤 Selected fallback voice: ${anyEnglishVoice.name}`);
      return anyEnglishVoice;
    }

    return null;
  }

  // Handle word click in favorites
  onFavoriteWordClick(word: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.speakWord(word);
  }

  // Get arguments to pass to child components
  getChildArguments() {
    return {
      addToFavorites: this.addToFavorites,
      removeFavorite: this.removeFavorite.bind(this),
      isWordFavorite: this.isWordFavorite
    };
  }
}
