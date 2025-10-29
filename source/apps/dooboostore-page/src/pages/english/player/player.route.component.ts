import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './player.route.component.html';
import styles from './player.route.component.css';
import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { ApiService } from '@dooboostore/simple-boot/fetch/ApiService';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { OnRawSetRenderedOtherData } from '@dooboostore/dom-render/lifecycle/OnRawSetRendered';
import { OnCreateRender } from '@dooboostore/dom-render/lifecycle/OnCreateRender';

import { RouterAction } from '@dooboostore/simple-boot/route/RouterAction';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import {
  ComponentBase,
  query
} from '@dooboostore/dom-render/components/ComponentBase';



export type Script = { t: string; e: string; k?: string };
export type PhoneticSign = {
  type: string;
  sign: string;
};

export type ExampleItem = {
  text: string;
  translatedText: string;
};

export type Meaning = {
  meaning: string;
  examples: ExampleItem[];
  originalMeaning: string;
};

export type Pos = {
  type: string;
  meanings: Meaning[];
};

export type ConjugationItem = {
  type: string;
  value: string;
};

export type Item = {
  entry: string;
  subEntry?: string;
  matchType: string;
  hanjaEntry?: string;
  phoneticSigns: PhoneticSign[];
  pos: Pos[];
  source: string;
  url: string;
  mUrl: string;
  expDicTypeForm: string;
  locale: string;
  conjugationList?: ConjugationItem[];
  aliasConjugation?: string;
  aliasConjugationPos?: string;
  gdid: string;
  expEntrySuperscript?: string;
};

export type Example = {
  source: string;
  matchType: string;
  translatedText: string;
  text: string;
};

export type Dictionary = {
  items: Item[];
  examples: Example[];
  isWordType: boolean;
  originalWord?: string; // Add original word from filename
};

export type ItemData = {
  name: string;
  type?: string;
  img: string;
  link?: string;
};

@Sim
@Component({
  template,
  styles
})
export class PlayerRouteComponent extends ComponentBase implements RouterAction.OnRouting, OnCreateRender {
  private name?: string | undefined;
  scripts?: Script[];
  dictionaries?: Dictionary[];
  items?: ItemData[];
  currentItem?: ItemData;

  // Favorite functions passed from parent router
  addToFavorites?: (word: string, meaning: string) => boolean;
  removeFavorite?: (word: string) => void;
  isWordFavorite?: (word: string) => boolean;

  currentWordIndex1 = 0;
  // currentWordIndex2=0;
  showTranslation = false;
  soundEnabled = true;
  isPlayingScript = false;
  isPlayingWord = false;
  isLoadingScripts = true;
  isLoadingDictionaries = false;
  private scrollTimeout?: number;
  private dictionaryCache = new Map<string, Dictionary>();
  isSwapped = false;
  private wordHighlightInterval?: number;
  private youtubePlayer?: any;
  private youtubePlayerReady = false;
  private userManuallySelected = false;
  private lastManualSelectionTime = 0;

  constructor(private apiService: ApiService) {
    super();
  }

  onCreateRender(param: any): void {
    console.log('PlayerRouteComponent onCreateRender called with params:', param);
    // Get favorite functions from parent router
    console.log('onInitRender param:', param);
    if (param && param) {
      this.addToFavorites = param.addToFavorites;
      this.removeFavorite = param.removeFavorite;
      this.isWordFavorite = param.isWordFavorite;
      console.log('Received favorite functions from parent router');
    } else {
      console.warn('No createArguments found in param');
    }

  }

  async onRawSetRendered(rawSet: RawSet, otherData: OnRawSetRenderedOtherData): Promise<void> {
    await super.onRawSetRendered(rawSet, otherData);
  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    this.name = r.routerModule.pathData?.name;
  }

  async onInitRender(param: any, rawSet: RawSet): Promise<void> {
    await super.onInitRender(param, rawSet);


    if (ValidUtils.isBrowser() && this.name) {
      try {
        this.isLoadingScripts = true;

        // Load both scripts and items data in parallel
        const [scriptsData, itemsData] = await Promise.all([
          this.apiService.get<Script[]>({ target: `/datas/english/scripts/${this.name}.json` }),
          this.apiService.get<ItemData[]>({ target: '/datas/english/items.json' })
        ]);

        this.scripts = scriptsData;
        this.items = itemsData;

        // Extract current item from items array using this.name
        this.currentItem = this.items.find(item => item.name === this.name);

        this.isLoadingScripts = false;

        console.log(`📚 Loaded ${this.scripts.length} scripts and ${this.items.length} items`);
        console.log(`🎯 Current item:`, this.currentItem);

        // Initialize YouTube player if current item is YouTube
        if (this.currentItem?.type === 'youtube') {
          setTimeout(() => {
            this.createYouTubeEmbed();
          }, 300); // Wait for DOM to be ready
        }

        // Initialize speech synthesis voices
        this.initializeSpeechSynthesis();

        // Auto-select first script if available
        if (this.scripts && this.scripts.length > 0) {
          // Set first radio as checked and initialize everything
          setTimeout(() => {
            const firstRadio = document.querySelector('input[name="selectedScript"][value="0"]') as HTMLInputElement;
            if (firstRadio && !firstRadio.checked) {
              firstRadio.checked = true;
              this.updateSliderRange(0);
              this.updateTranslationVisibility();

              // Initialize the first script completely
              this.setCurrentSelectedIndex(0);
              console.log('🎯 Auto-selected first script');
            }
          }, 200);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
        this.isLoadingScripts = false;
      }
    }
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

  async setCurrentSelectedIndex(index: number) {

    const startTime = performance.now();
    console.log(`🎯 setCurrentSelectedIndex(${index}) started`);

    // No need to manage state variables - form handles it

    const immediateTime = performance.now();
    console.log(`⚡ Immediate state update: ${(immediateTime - startTime).toFixed(2)}ms`);

    if (this.scripts && this.scripts[index]) {
      const script = this.scripts[index];

      // Immediate UI update without heavy processing
      requestAnimationFrame(() => {
        this.updateScriptDisplay();
      });

      // Scroll immediately for better UX
      setTimeout(() => {
        this.scrollToSelectedScript(index);
      }, 16);

      // Load dictionaries in background with minimal processing
      setTimeout(async () => {
        const dictStartTime = performance.now();

        // Process words locally when needed for dictionary
        const currentWords = script.e.split(/\s+/) ?? [];
        // Update slider max directly
        const maxIndex = Math.max(0, currentWords.length - 1);
        const slider = document.querySelector('.word-slider') as HTMLInputElement;
        if (slider) {
          slider.max = maxIndex.toString();
        }

        await this.setScript(script.e);
        const dictEndTime = performance.now();
        console.log(`📚 Background dictionary loading: ${(dictEndTime - dictStartTime).toFixed(2)}ms`);
      }, 100); // Increased delay for smoother UX
    }

    const totalTime = performance.now();
    console.log(`🚀 Ultra-fast response: ${(totalTime - startTime).toFixed(2)}ms`);
  }

  private scrollToSelectedScript(index: number) {
    if (!ValidUtils.isBrowser()) {
      return;
    }

    // Clear previous timeout to debounce rapid calls
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // Use setTimeout to ensure DOM is updated and debounce
    this.scrollTimeout = setTimeout(() => {
      const scriptItems = document.querySelectorAll('.script-item');

      if (scriptItems[index]) {
        const targetElement = scriptItems[index] as HTMLElement;

        // Use scrollIntoView only - CSS scroll-margin-top will handle the offset
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });

        console.log(`📍 Scrolling to script ${index} using scrollIntoView with CSS margin`);
      }
    }, 200) as any; // Increased timeout for mobile
  }

  private scrollSectionsToTop() {
    if (!ValidUtils.isBrowser()) {
      return;
    }

    // Scroll both dictionary and scripts sections to top
    setTimeout(() => {
      const dictionarySection = document.querySelector('.dictionary-section');
      const scriptsSection = document.querySelector('.scripts-section');

      if (dictionarySection) {
        dictionarySection.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }

      if (scriptsSection) {
        scriptsSection.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    }, 100);
  }



  setWordIndex(index: number) {
    const currentSelectedScript = this.getCurrentSelectedIndex();
    console.log(`🎚️ setWordIndex(${index}) - current script: ${currentSelectedScript}`);

    // Mark as manual interaction to prevent auto-selection interference
    this.userManuallySelected = true;
    this.lastManualSelectionTime = Date.now();

    // Stop any ongoing script speech when user interacts with words
    // But allow individual word TTS to continue
    if (this.isPlayingScript) {
      this.stopSpeech();
    }

    // Update slider value directly
    const slider = document.querySelector('.word-slider') as HTMLInputElement;
    if (slider) {
      slider.value = index.toString();
    }

    // Update word highlighting in the selected script
    this.updateWordHighlighting();

    // Only process if index is valid (>= 0)
    if (index >= 0) {
      this.scrollToDictionaryWord();

      // Play TTS if sound is enabled
      if (this.soundEnabled) {
        const currentWords = this.getCurrentWords();
        if (currentWords && currentWords[index]) {
          this.speakWord(currentWords[index]);
        }
      }
    }

    // Reset manual selection flag after a shorter delay for word interactions
    setTimeout(() => {
      this.userManuallySelected = false;
      console.log('✅ Word interaction protection expired - auto-selection re-enabled');
    }, 1500); // 1.5초 후 자동 선택 다시 허용 (스크립트 선택보다 짧게)
  }

  private updateWordHighlighting() {
    const currentSelectedIndex = this.getCurrentSelectedIndex();
    const currentWordIndex = this.getCurrentWordIndex();

    if (!ValidUtils.isBrowser() || currentSelectedIndex < 0) return;

    // Find the selected script item
    const selectedScriptItem = document.querySelector(`input[name="selectedScript"][value="${currentSelectedIndex}"]:checked`)?.closest('.script-item');
    const wordElements = selectedScriptItem?.querySelectorAll('.clickable-word');

    if (wordElements) {
      wordElements.forEach((wordElement, index) => {
        if (index === currentWordIndex) {
          wordElement.classList.add('highlighted');
        } else {
          wordElement.classList.remove('highlighted');
        }
      });
    }
  }

  private clearAllWordHighlights() {
    if (!ValidUtils.isBrowser()) return;

    // Remove highlights from all script items
    const allScriptItems = document.querySelectorAll('.script-item');
    allScriptItems.forEach(scriptItem => {
      const wordElements = scriptItem.querySelectorAll('.clickable-word');
      wordElements.forEach(wordElement => {
        wordElement.classList.remove('highlighted');
      });
    });

    // Also reset all scripts to original text to remove clickable functionality
    this.resetAllScriptsToOriginalText();

    console.log('🧹 Cleared all word highlights and reset scripts to non-clickable state');
  }

  private resetAllScriptsToOriginalText() {
    if (!ValidUtils.isBrowser() || !this.scripts) return;

    // Reset all script items to their original text (non-clickable)
    const allScriptItems = document.querySelectorAll('.script-item');
    allScriptItems.forEach((scriptItem, index) => {
      const englishText = scriptItem.querySelector('.english-text');
      if (englishText && this.scripts && this.scripts[index]) {
        // Remove all event listeners and spans, restore original text
        englishText.innerHTML = this.scripts[index].e;
        console.log(`🔄 Reset script ${index} to original non-clickable text`);
      }
    });
  }

  onWordClick(index: number, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.setWordIndex(index);
  }

  onScriptSelectionChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target && target.type === 'radio' && target.name === 'selectedScript') {
      // Mark as manually selected to prevent auto-selection interference
      this.userManuallySelected = true;
      this.lastManualSelectionTime = Date.now();

      const selectedIndex = parseInt(target.value);
      console.log('👆 User manually selected script:', selectedIndex);

      // Stop any ongoing speech when changing scripts
      if (this.isPlayingScript) {
        this.stopSpeech();
      }

      // Clear all word highlights from previous scripts before switching
      this.clearAllWordHighlights();

      // Update slider range FIRST to prepare UI
      this.updateSliderRange(selectedIndex);

      // Update translation visibility for new selection
      this.updateTranslationVisibility();

      // If YouTube type, move to script time position
      if (this.currentItem?.type === 'youtube') {
        console.log('🎥 Moving YouTube to script time for manual selection');
        this.seekYouTubeToScriptTime(selectedIndex);
      }

      // Call script selection to load dictionaries
      this.setCurrentSelectedIndex(selectedIndex);

      // Scroll to selected script (after a small delay to ensure DOM is updated)
      setTimeout(() => {
        const scriptItem = target.closest('.script-item') as HTMLElement;
        if (scriptItem) {
          scriptItem.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
          });
        }
      }, 50);

      // Reset manual selection flag after a delay
      setTimeout(() => {
        this.userManuallySelected = false;
        console.log('✅ Manual selection protection expired - auto-selection re-enabled');
      }, 3000); // 3초 후 자동 선택 다시 허용
    }
  }

  // Get current selected script index from form state
  private getCurrentSelectedIndex(): number {
    if (!ValidUtils.isBrowser()) return -1;

    const checkedRadio = document.querySelector('input[name="selectedScript"]:checked') as HTMLInputElement;
    return checkedRadio ? parseInt(checkedRadio.value) : -1;
  }

  // Get current word index from slider
  private getCurrentWordIndex(): number {
    if (!ValidUtils.isBrowser()) return -1;

    const slider = document.querySelector('.word-slider') as HTMLInputElement;
    return slider ? parseInt(slider.value) : -1;
  }

  // Get current words from selected script
  private getCurrentWords(): string[] | null {
    const currentIndex = this.getCurrentSelectedIndex();
    if (currentIndex < 0 || !this.scripts || !this.scripts[currentIndex]) return null;

    return this.scripts[currentIndex].e.split(/\s+/);
  }

  private updateSliderRange(scriptIndex: number) {

    if (!ValidUtils.isBrowser() || !this.scripts || !this.scripts[scriptIndex]) return;

    const script = this.scripts[scriptIndex];
    const wordCount = script.e.split(/\s+/).length;
    const maxIndex = Math.max(0, wordCount - 1);

    // Direct DOM manipulation for instant update
    const controller = document.querySelector('.floating-controller') as HTMLElement;
    const slider = document.querySelector('.word-slider') as HTMLInputElement;

    if (controller && slider) {
      // Show controller
      controller.style.display = 'block';

      // Update slider
      slider.max = maxIndex.toString();
      slider.value = '-1'; // Reset to no selection

      // Clear word highlights when resetting slider
      this.updateWordHighlighting(); // This will clear highlights since slider value is -1

      // Update button states
      this.updateControllerButtons();
    }

    // Update component state
    // this.maxWordIndex = maxIndex;
    // const start = Date.now();
    // this.currentWordIndex1 = Math.random();
    // // this.currentWordIndex2 = Math.random();
    // console.log('set', Date.now() - start);
    // DOM now manages all state - no component state needed
  }

  private test() {
    const start = Date.now();
    this.currentWordIndex1 = Math.random();
    // this.currentWordIndex2 = Math.random();
    console.log('set', Date.now() - start);
  }
  private updateControllerButtons() {
    if (!ValidUtils.isBrowser()) return;

    // Update translation button
    const translationBtn = document.querySelector('.translation-btn');
    if (translationBtn) {
      translationBtn.className = `control-btn translation-btn${this.showTranslation ? ' active' : ''}`;
    }

    // Update sound button
    const soundBtn = document.querySelector('.sound-btn');
    const soundIcon = soundBtn?.querySelector('i');
    if (soundBtn && soundIcon) {
      soundBtn.className = `control-btn sound-btn${this.soundEnabled ? ' active' : ''}`;
      soundIcon.className = this.soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    }

    // Update play button
    const playBtn = document.querySelector('.play-btn') as HTMLElement;
    const playIcon = playBtn?.querySelector('i');
    if (playBtn && playIcon) {
      playBtn.className = `control-btn play-btn${this.isPlayingScript ? ' playing' : ''}`;
      playBtn.style.display = this.soundEnabled ? 'flex' : 'none';
      playIcon.className = this.isPlayingScript ? 'fas fa-pause' : 'fas fa-play';
    }
  }

  private updateScriptDisplay() {
    if (!ValidUtils.isBrowser()) return;

    // Update selected script with word-by-word breakdown
    this.updateSelectedScriptWords();

    // Update translation visibility for current script only
    this.updateTranslationVisibility();
  }

  private updateTranslationVisibility() {
    if (!ValidUtils.isBrowser()) return;

    const allKoreanTexts = document.querySelectorAll('.korean-text') as NodeListOf<HTMLElement>;

    if (this.showTranslation) {
      // Show all korean texts when translation is enabled
      allKoreanTexts.forEach(element => {
        element.classList.add('show-translation');
        element.style.display = 'block';
      });
      console.log('🌐 Translation enabled - showing Korean text');
    } else {
      // Hide all korean texts when translation is disabled
      allKoreanTexts.forEach(element => {
        element.classList.remove('show-translation');
        element.style.display = 'none';
      });
      console.log('🌐 Translation disabled - hiding Korean text');
    }
  }

  private updateSelectedScriptWords() {
    const currentSelectedIndex = this.getCurrentSelectedIndex();
    if (!ValidUtils.isBrowser()) return;

    // Reset ALL script items to original text first
    this.resetAllScriptsToOriginalText();

    // Only process if we have a valid selection
    if (currentSelectedIndex < 0) return;

    // Find the selected script item
    const selectedScriptItem = document.querySelector(`input[name="selectedScript"][value="${currentSelectedIndex}"]:checked`)?.closest('.script-item');
    const selectedEnglishText = selectedScriptItem?.querySelector('.english-text');

    if (selectedEnglishText) {
      const currentWords = this.getCurrentWords();
      if (currentWords) {
        // Replace with word-by-word breakdown ONLY for selected script
        const htmlContent = currentWords
          .map((word, index) => {
            return `<span class="word clickable-word" data-word-index="${index}">${word}</span>`;
          })
          .join('');

        selectedEnglishText.innerHTML = htmlContent;

        // Add click event listeners to words ONLY for selected script
        selectedEnglishText.querySelectorAll('.clickable-word').forEach((wordElement, index) => {
          wordElement.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.setWordIndex(index);
          });
        });

        console.log(`✅ Made script ${currentSelectedIndex} interactive with clickable words`);
      }
    }
  }

  onEntryTitleClick(element: HTMLElement, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.soundEnabled && element) {
      const text = element.innerText || element.textContent;
      if (text) {
        this.speakWord(text);
      }
    }
  }

  onExampleClick(element: HTMLElement, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.soundEnabled && element) {
      const text = element.innerText || element.textContent;
      if (text) {
        this.speakWord(text);
      }
    }
  }

  onDictionaryItemClick(dictionary: Dictionary, event: Event) {
    event.preventDefault();
    event.stopPropagation();

    // Get the first word entry from the dictionary
    if (this.soundEnabled && dictionary.items && dictionary.items.length > 0) {
      const firstItem = dictionary.items[0];
      if (firstItem && firstItem.entry) {
        this.speakWord(firstItem.entry);
      }
    }
  }

  private scrollToDictionaryWord() {
    const currentWordIndex = this.getCurrentWordIndex();
    const currentWords = this.getCurrentWords();

    if (!ValidUtils.isBrowser() || currentWordIndex < 0 || !currentWords || !this.dictionaries) {
      return;
    }

    // Get the current word and clean it the same way as in setScript
    const currentWord = currentWords[currentWordIndex]?.replace(/[,.":!?;[\]\-]/g, '').toLowerCase();
    if (!currentWord) return;

    // Find the dictionary item for this word using originalWord (filename)
    const dictionaryIndex = this.dictionaries.findIndex(dict =>
      dict.originalWord === currentWord
    );

    if (dictionaryIndex >= 0) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        const dictionaryItems = document.querySelectorAll('.dictionary-item');

        if (dictionaryItems[dictionaryIndex]) {
          const targetElement = dictionaryItems[dictionaryIndex] as HTMLElement;

          // Check if mobile (screen width <= 768px)
          const isMobile = window.innerWidth <= 768;

          // Use scrollIntoView for more reliable scrolling
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: isMobile ? 'start' : 'center',
            inline: 'nearest'
          });

          // Add highlight effect
          targetElement.classList.add('highlighted-dictionary');
          setTimeout(() => {
            targetElement.classList.remove('highlighted-dictionary');
          }, 2000);
        }
      }, 100);
    }
  }

  previousScript() {
    // Mark as manual selection
    this.userManuallySelected = true;
    this.lastManualSelectionTime = Date.now();

    // Stop any ongoing speech when navigating
    if (this.isPlayingScript) {
      this.stopSpeech();
    }

    // Clear all word highlights before switching
    this.clearAllWordHighlights();

    const currentIndex = this.getCurrentSelectedIndex();
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;

      // Update radio selection first
      this.updateRadioSelection(newIndex);

      // Update slider range
      this.updateSliderRange(newIndex);

      // Update translation visibility
      this.updateTranslationVisibility();

      // If YouTube type, move to script time position
      if (this.currentItem?.type === 'youtube') {
        this.seekYouTubeToScriptTime(newIndex);
      }

      // Load dictionaries and update UI
      this.setCurrentSelectedIndex(newIndex);

      // Scroll to selected script
      this.scrollToSelectedScript(newIndex);
    }

    // Reset manual selection flag after delay
    setTimeout(() => {
      this.userManuallySelected = false;
    }, 3000);
  }

  nextScript() {
    // Mark as manual selection
    this.userManuallySelected = true;
    this.lastManualSelectionTime = Date.now();

    // Stop any ongoing speech when navigating
    if (this.isPlayingScript) {
      this.stopSpeech();
    }

    // Clear all word highlights before switching
    this.clearAllWordHighlights();

    const currentIndex = this.getCurrentSelectedIndex();
    if (this.scripts && currentIndex < this.scripts.length - 1) {
      const newIndex = currentIndex + 1;

      // Update radio selection first
      this.updateRadioSelection(newIndex);

      // Update slider range
      this.updateSliderRange(newIndex);

      // Update translation visibility
      this.updateTranslationVisibility();

      // If YouTube type, move to script time position
      if (this.currentItem?.type === 'youtube') {
        this.seekYouTubeToScriptTime(newIndex);
      }

      // Load dictionaries and update UI
      this.setCurrentSelectedIndex(newIndex);

      // Scroll to selected script
      this.scrollToSelectedScript(newIndex);
    }

    // Reset manual selection flag after delay
    setTimeout(() => {
      this.userManuallySelected = false;
    }, 3000);
  }

  private updateRadioSelection(index: number) {
    if (!ValidUtils.isBrowser()) return;

    // Clear all radio selections first
    const allRadios = document.querySelectorAll('input[name="selectedScript"]') as NodeListOf<HTMLInputElement>;
    allRadios.forEach(radio => {
      radio.checked = false;
    });

    // Update radio button selection using value attribute
    const radioInput = document.querySelector(`input[name="selectedScript"][value="${index}"]`) as HTMLInputElement;
    if (radioInput) {
      radioInput.checked = true;
      console.log(`✅ Updated radio selection to index ${index}`);
    } else {
      console.warn(`❌ Could not find radio input for index ${index}`);
    }
  }

  toggleTranslation() {
    this.showTranslation = !this.showTranslation;
    this.updateTranslationVisibility();
    this.updateControllerButtons();
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    this.updateControllerButtons();

    // Stop any ongoing speech when disabling sound
    if (!this.soundEnabled && ValidUtils.isBrowser()) {
      this.stopSpeech();
    }
  }

  swapSections() {
    this.isSwapped = !this.isSwapped;
  }

  playCurrentScript() {
    const currentSelectedIndex = this.getCurrentSelectedIndex();
    if (!this.soundEnabled || currentSelectedIndex < 0 || !this.scripts) {
      return;
    }

    if (this.isPlayingScript) {
      // Stop current playback
      this.stopSpeech();
      return;
    }

    const currentScript = this.scripts[currentSelectedIndex];
    if (currentScript && currentScript.e) {
      this.speakScript(currentScript.e);
    }
  }



  private startYouTubeTimeMonitoring() {
    if (!this.youtubePlayer || !this.youtubePlayerReady) {
      return;
    }

    // Monitor YouTube playback time every 1 second (reduced frequency)
    setInterval(() => {
      if (this.youtubePlayer && this.youtubePlayerReady && this.scripts) {
        try {
          // Only check time if YouTube is actually playing
          const playerState = this.youtubePlayer.getPlayerState();
          if (playerState === 1) { // Only when playing
            const currentTime = this.youtubePlayer.getCurrentTime();
            this.updateScriptSelectionByTime(currentTime);
          }
        } catch (error) {
          // Ignore errors when player is not ready
        }
      }
    }, 1000); // Increased to 1 second to reduce CPU usage
  }

  private updateScriptSelectionByTime(currentTime: number) {
    if (!this.scripts) return;

    // Don't auto-select if user manually selected recently
    if (this.userManuallySelected) {
      return;
    }

    // Don't auto-select if time is very early or if YouTube is not playing
    if (currentTime < 1) return;

    // Check if YouTube is actually playing to avoid unnecessary processing
    try {
      const playerState = this.youtubePlayer?.getPlayerState();
      // Only process if YouTube is playing (state 1) or paused (state 2)
      // Don't process if unstarted (-1), ended (0), buffering (3), or cued (5)
      if (playerState !== 1 && playerState !== 2) {
        return;
      }
    } catch (error) {
      // If we can't get player state, skip auto-selection
      return;
    }

    // Find the script that matches the current time
    let matchingScriptIndex = -1;

    for (let i = 0; i < this.scripts.length; i++) {
      const script = this.scripts[i];
      if (!script.t) continue;

      const scriptTime = this.parseTimeString(script.t);
      if (scriptTime === null) continue;

      // Check if current time is within this script's range
      const nextScriptTime = i < this.scripts.length - 1 && this.scripts[i + 1].t
        ? this.parseTimeString(this.scripts[i + 1].t)
        : scriptTime + 10; // Default 10 seconds for last script

      if (currentTime >= scriptTime && (nextScriptTime === null || currentTime < nextScriptTime)) {
        matchingScriptIndex = i;
        break;
      }
    }

    // Update script selection if different from current
    const currentSelectedIndex = this.getCurrentSelectedIndex();
    if (matchingScriptIndex !== -1 && matchingScriptIndex !== currentSelectedIndex) {
      this.selectScriptByIndex(matchingScriptIndex);
      console.log(`🎥 Auto-selected script ${matchingScriptIndex} at time ${currentTime.toFixed(1)}s`);
    }
  }

  private selectScriptByIndex(index: number, isAutoSelection = true) {
    if (!ValidUtils.isBrowser()) return;

    console.log(`🔄 selectScriptByIndex(${index}, isAutoSelection: ${isAutoSelection})`);

    // If this is an auto-selection and user manually selected recently, skip
    if (isAutoSelection && this.userManuallySelected) {
      console.log('🚫 Skipping auto-selection - user manually selected recently');
      return;
    }

    // Update radio button selection
    const radioInput = document.querySelector(`input[name="selectedScript"][value="${index}"]`) as HTMLInputElement;
    if (radioInput) {
      console.log(`✅ Changing script selection from ${this.getCurrentSelectedIndex()} to ${index}`);
      radioInput.checked = true;

      // Clear all word highlights before switching
      this.clearAllWordHighlights();

      // Update slider range and other UI elements
      this.updateSliderRange(index);
      this.updateTranslationVisibility();
      this.setCurrentSelectedIndex(index);

      // Scroll to selected script
      this.scrollToSelectedScript(index);
    } else {
      console.warn(`❌ Could not find radio input for script index ${index}`);
    }
  }

  private parseTimeString(timeStr: string): number | null {
    // Remove any whitespace
    timeStr = timeStr.trim();

    // Handle MM:SS or H:MM:SS format (e.g., "8:52", "1:23:45")
    const colonMatch = timeStr.match(/^(\d+):(\d+)(?::(\d+))?$/);
    if (colonMatch) {
      const hours = colonMatch[3] ? parseInt(colonMatch[1]) : 0;
      const minutes = colonMatch[3] ? parseInt(colonMatch[2]) : parseInt(colonMatch[1]);
      const seconds = colonMatch[3] ? parseInt(colonMatch[3]) : parseInt(colonMatch[2]);

      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      return totalSeconds;
    }

    // Handle formats like "10s", "1m30s", "2m", "1h30m", etc.
    let totalSeconds = 0;
    let hasValidTime = false;

    // Extract hours
    const hourMatch = timeStr.match(/(\d+)h/);
    if (hourMatch) {
      totalSeconds += parseInt(hourMatch[1]) * 3600;
      hasValidTime = true;
    }

    // Extract minutes
    const minuteMatch = timeStr.match(/(\d+)m/);
    if (minuteMatch) {
      totalSeconds += parseInt(minuteMatch[1]) * 60;
      hasValidTime = true;
    }

    // Extract seconds
    const secondMatch = timeStr.match(/(\d+)s/);
    if (secondMatch) {
      totalSeconds += parseInt(secondMatch[1]);
      hasValidTime = true;
    }

    // If no units found, try to parse as plain number (assume seconds)
    if (!hasValidTime) {
      const plainNumber = parseInt(timeStr);
      if (!isNaN(plainNumber)) {
        totalSeconds = plainNumber;
        hasValidTime = true;
      }
    }

    // Return totalSeconds if we found valid time (including 0), otherwise null
    return hasValidTime ? totalSeconds : null;
  }

  private speakWord(word: string) {
    if (!ValidUtils.isBrowser() || !this.soundEnabled) {
      return;
    }

    // Check if browser supports Speech Synthesis
    if (!('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not supported in this browser');
      return;
    }

    // Only stop ongoing speech if it's another word TTS, not script playback
    if (ValidUtils.isBrowser() && 'speechSynthesis' in window) {
      // Only cancel if we're playing individual words, not scripts
      if (this.isPlayingWord && !this.isPlayingScript) {
        speechSynthesis.cancel();
        this.isPlayingWord = false;
      }
    }

    // Clean the word (remove punctuation)
    const cleanWord = word.replace(/[,.":!?;]/g, '').trim();
    if (!cleanWord) return;

    // Create speech utterance
    const utterance = new SpeechSynthesisUtterance(cleanWord);

    // Configure speech settings for natural sound
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // Natural speaking rate
    utterance.pitch = 1.0; // Natural pitch
    utterance.volume = 0.9; // Clear volume

    // Select the best available English voice
    const voices = speechSynthesis.getVoices();
    const bestVoice = this.selectBestEnglishVoice(voices);

    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    // Set word playing state
    this.isPlayingWord = true;

    // Handle speech events
    utterance.onstart = () => {
      this.isPlayingWord = true;
    };

    utterance.onend = () => {
      this.isPlayingWord = false;
      console.log(`🔊 Word TTS completed: ${cleanWord} - position maintained`);
      // Explicitly do NOT reset slider position for individual word TTS
      // The slider should stay exactly where the user clicked
    };

    // Error handling
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      this.isPlayingWord = false;
    };

    // Speak the word
    speechSynthesis.speak(utterance);
  }





  private selectBestEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (!voices || voices.length === 0) return null;

    // Priority order for natural-sounding English voices
    const voicePriorities = [
      // macOS voices (very natural)
      'Samantha',
      'Alex',
      'Victoria',
      'Daniel',

      // Google voices (high quality)
      'Google US English',
      'Google UK English Female',
      'Google UK English Male',

      // Microsoft voices (good quality)
      'Microsoft Zira Desktop',
      'Microsoft David Desktop',
      'Microsoft Mark',
      'Microsoft Hazel Desktop',

      // Chrome/Edge voices
      'Chrome OS US English',
      'Microsoft Edge',

      // Fallback to any English voice
      'English'
    ];

    // First, try to find voices by exact name match
    for (const voiceName of voicePriorities) {
      const voice = voices.find(v =>
        v.name.includes(voiceName) && v.lang.startsWith('en')
      );
      if (voice) {
        console.log('Selected voice:', voice.name);
        return voice;
      }
    }

    // If no priority voice found, select the first local English voice
    const localEnglishVoice = voices.find(v =>
      v.lang.startsWith('en') && v.localService
    );
    if (localEnglishVoice) {
      console.log('Selected local voice:', localEnglishVoice.name);
      return localEnglishVoice;
    }

    // Fallback to any English voice
    const anyEnglishVoice = voices.find(v => v.lang.startsWith('en'));
    if (anyEnglishVoice) {
      console.log('Selected fallback voice:', anyEnglishVoice.name);
      return anyEnglishVoice;
    }

    return null;
  }

  private stopSpeech() {
    if (ValidUtils.isBrowser() && 'speechSynthesis' in window) {
      speechSynthesis.cancel();

      // Store previous states
      const wasPlayingScript = this.isPlayingScript;
      const wasPlayingWord = this.isPlayingWord;

      // Reset both playing states
      this.isPlayingScript = false;
      this.isPlayingWord = false;
      this.updateControllerButtons(); // Update button when stopping

      // Only stop range animation if it was a script playback, NOT for individual word TTS
      if (wasPlayingScript) {
        this.stopRangeAnimation();
      }

      // If user manually stopped script playback, reset to initial position
      // But NOT if it was just individual word TTS
      if (wasPlayingScript && !wasPlayingWord) {
        setTimeout(() => {
          const slider = document.querySelector('.word-slider') as HTMLInputElement;
          if (slider && !this.isPlayingScript && !this.isPlayingWord) {
            slider.value = '-1';
            this.updateWordHighlighting();
            console.log(`🔄 Manual script stop - reset to initial state`);
          }
        }, 100);
      }
    }
  }

  private startRangeSliderAnimation(text: string, speechRate: number) {
    const currentWords = this.getCurrentWords();
    if (!currentWords || currentWords.length === 0) return;

    // Calculate total speech duration
    const baseWPM = 200;
    const adjustedWPM = baseWPM * speechRate;
    const totalWords = currentWords.length;
    const totalDurationMs = (totalWords / adjustedWPM) * 60 * 1000;
    const maxWordIndex = Math.max(0, totalWords - 1);

    console.log(`🎤 Speech animation:`);
    console.log(`📝 Total words: ${totalWords}`);
    console.log(`⏱️ Estimated duration: ${Math.round(totalDurationMs)}ms`);
    console.log(`🎚️ Range: 0 to ${maxWordIndex}`);

    // Animation starts from index 1 since we already showed index 0
    let currentAnimationIndex = 1;

    // Animate range slider smoothly over the duration
    const startTime = Date.now();

    this.wordHighlightInterval = setInterval(() => {
      if (!this.isPlayingScript) {
        this.stopRangeAnimation();
        return;
      }
      const slider = document.querySelector('.word-slider') as HTMLInputElement;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDurationMs, 1);
      // Start from index 1 and go to maxWordIndex
      const targetIndex = Math.min(currentAnimationIndex + Math.floor(progress * (maxWordIndex - 1)), maxWordIndex);
      const currentSliderValue = parseInt(slider?.value || '0');

      if (targetIndex !== currentSliderValue && targetIndex <= maxWordIndex && slider) {
        slider.value = targetIndex.toString();
        // Update word highlighting during playback
        this.updateWordHighlighting();
        console.log(`🎚️ Range: ${targetIndex}/${maxWordIndex} (${Math.round(progress * 100)}%)`);
      }

      // Stop when complete and highlight last word
      if (progress >= 1) {
        if (slider) {
          slider.value = maxWordIndex.toString();
          this.updateWordHighlighting(); // Highlight the last word
        }
        console.log(`🏁 Range animation completed - highlighted last word`);
        this.stopRangeAnimation();
      }
    }, 50) as any; // Update every 50ms for smooth animation
  }

  private stopRangeAnimation() {
    if (this.wordHighlightInterval) {
      clearInterval(this.wordHighlightInterval);
      this.wordHighlightInterval = undefined;
    }

    // Only reset position if script playback just completed (not word TTS)
    if (this.isPlayingScript === false && this.isPlayingWord === false) {
      setTimeout(() => {
        const slider = document.querySelector('.word-slider') as HTMLInputElement;
        // Triple check: no script playing, no word playing, and this was a script completion
        if (slider && !this.isPlayingScript && !this.isPlayingWord) {
          slider.value = '-1'; // Reset to no selection
          this.updateWordHighlighting(); // Clear highlighting
          console.log(`🏁 Script completed - reset to initial state after delay`);
        }
      }, 800); // 800ms delay to show last word
    }
  }

  private stopWordHighlighting() {
    // Legacy method - now handled by stopRangeAnimation
    this.stopRangeAnimation();
  }

  private speakScript(scriptText: string) {
    if (!ValidUtils.isBrowser() || !this.soundEnabled) {
      return;
    }

    // Check if browser supports Speech Synthesis
    if (!('speechSynthesis' in window)) {
      console.warn('Speech Synthesis not supported in this browser');
      return;
    }

    // Stop any ongoing speech
    this.stopSpeech();

    // Clean the script text
    const cleanText = scriptText.replace(/[""]/g, '"').trim();
    if (!cleanText) return;

    // Create speech utterance
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Configure speech settings for script reading
    utterance.lang = 'en-US';
    utterance.rate = 0.85; // Slightly slower for sentence comprehension
    utterance.pitch = 1.0;
    utterance.volume = 0.9;

    // Select the best available English voice
    const voices = speechSynthesis.getVoices();
    const bestVoice = this.selectBestEnglishVoice(voices);

    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    // Set playing state
    this.isPlayingScript = true;
    this.updateControllerButtons(); // Update button immediately

    // Show first word immediately and hold briefly
    const slider = document.querySelector('.word-slider') as HTMLInputElement;
    if (slider) {
      slider.value = '0';
      this.updateWordHighlighting();
    }

    // Start animation after a brief delay to show first word
    setTimeout(() => {
      this.startRangeSliderAnimation(cleanText, utterance.rate);
    }, 300); // 300ms delay to show first word

    // Handle speech events
    utterance.onstart = () => {
      this.isPlayingScript = true;
      this.updateControllerButtons(); // Update button when speech starts
    };

    utterance.onend = () => {
      this.isPlayingScript = false;
      this.updateControllerButtons(); // Update button when speech ends

      // Show the last word highlighted before reset
      const currentWords = this.getCurrentWords();
      if (currentWords) {
        const maxIndex = Math.max(0, currentWords.length - 1);
        const slider = document.querySelector('.word-slider') as HTMLInputElement;
        if (slider) {
          slider.value = maxIndex.toString();
          this.updateWordHighlighting(); // Highlight last word
          console.log(`🏁 Speech completed - showing last word: ${maxIndex}`);

          // Reset after a brief delay
          setTimeout(() => {
            if (!this.isPlayingScript) { // Only reset if not playing again
              slider.value = '-1'; // Reset to no selection
              this.updateWordHighlighting(); // Clear highlighting
              console.log(`🔄 Reset to initial state after delay`);
            }
          }, 1000); // 1 second delay to show last word
        }
      }

      this.stopRangeAnimation();
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      this.isPlayingScript = false;
      this.updateControllerButtons(); // Update button on error
      this.stopRangeAnimation();
    };

    // Speak the script
    speechSynthesis.speak(utterance);
  }



  async setScript(script: string) {
    const startTime = performance.now();
    console.log('📚 setScript started');

    try {
      this.isLoadingDictionaries = true;

      // Ultra-optimized word cleaning with single pass
      const rawWords = script.split(/\s+/);
      const cleanWords: string[] = [];
      const punctuationRegex = /[,.":!?;[\]\-]/g;

      for (let i = 0; i < rawWords.length; i++) {
        const word = rawWords[i];
        if (word) {
          const cleanWord = word.replace(punctuationRegex, '').toLowerCase();
          if (cleanWord) {
            cleanWords.push(cleanWord);
          }
        }
      }

      const cleaningTime = performance.now();
      console.log(`🧹 Word cleaning time: ${(cleaningTime - startTime).toFixed(2)}ms (${cleanWords.length} words)`);

      // Get dictionary data for each word with caching
      const dictionaries: Dictionary[] = [];
      const wordsToFetch: string[] = [];

      // Check cache first
      for (const word of cleanWords) {
        if (this.dictionaryCache.has(word)) {
          dictionaries.push(this.dictionaryCache.get(word)!);
        } else {
          wordsToFetch.push(word);
        }
      }

      const cacheTime = performance.now();
      console.log(`💾 Cache check time: ${(cacheTime - cleaningTime).toFixed(2)}ms (${wordsToFetch.length} to fetch, ${dictionaries.length} cached)`);

      // Fetch only uncached words
      if (wordsToFetch.length > 0) {
        const fetchStartTime = performance.now();

        const promises = wordsToFetch.map((word: string) =>
          this.apiService.get<Dictionary>({ target: `/datas/english/dictionary/${word}.json` })
            .then(dict => {
              // Check if dictionary has meaningful content
              if (!dict.items || dict.items.length === 0) {
                // Create placeholder for empty dictionaries
                const placeholder = {
                  items: [{
                    entry: word,
                    matchType: 'original',
                    phoneticSigns: [],
                    pos: [{
                      type: 'word',
                      meanings: [{
                        meaning: `Original word: ${word}`,
                        examples: [],
                        originalMeaning: word
                      }]
                    }],
                    source: 'original',
                    url: '',
                    mUrl: '',
                    expDicTypeForm: '',
                    locale: 'en',
                    gdid: ''
                  }],
                  examples: [],
                  isWordType: true,
                  originalWord: word
                } as Dictionary;

                // Cache the placeholder
                this.dictionaryCache.set(word, placeholder);
                return placeholder;
              } else {
                const dictWithOriginal = { ...dict, originalWord: word };
                // Cache the result
                this.dictionaryCache.set(word, dictWithOriginal);
                return dictWithOriginal;
              }
            })
            .catch(() => {
              // Create placeholder for failed requests
              const placeholder = {
                items: [{
                  entry: word,
                  matchType: 'original',
                  phoneticSigns: [],
                  pos: [{
                    type: 'word',
                    meanings: [{
                      meaning: `Original word: ${word}`,
                      examples: [],
                      originalMeaning: word
                    }]
                  }],
                  source: 'original',
                  url: '',
                  mUrl: '',
                  expDicTypeForm: '',
                  locale: 'en',
                  gdid: ''
                }],
                examples: [],
                isWordType: true,
                originalWord: word
              } as Dictionary;

              // Cache the placeholder
              this.dictionaryCache.set(word, placeholder);
              return placeholder;
            })
        );

        const results = await Promise.allSettled(promises);
        const newDictionaries = results
          .filter((result: any) => result.status === 'fulfilled')
          .map((result: any) => result.value);

        dictionaries.push(...newDictionaries);

        const fetchTime = performance.now();
        console.log(`🌐 API fetch time: ${(fetchTime - fetchStartTime).toFixed(2)}ms (${wordsToFetch.length} requests)`);
      }

      // Create dictionaries for all words, showing original word if dictionary not found
      // Use batch processing for better performance
      const batchSize = 10;
      const resultDictionaries: Dictionary[] = [];

      for (let i = 0; i < cleanWords.length; i += batchSize) {
        const batch = cleanWords.slice(i, i + batchSize);
        const batchResults = batch.map(word => {
          const cachedDict = this.dictionaryCache.get(word);
          if (cachedDict) {
            return cachedDict;
          } else {
            // Create a placeholder dictionary with original word
            return {
              items: [{
                entry: word,
                matchType: 'original',
                phoneticSigns: [],
                pos: [{
                  type: 'word',
                  meanings: [{
                    meaning: `Original word: ${word}`,
                    examples: [],
                    originalMeaning: word
                  }]
                }],
                source: 'original',
                url: '',
                mUrl: '',
                expDicTypeForm: '',
                locale: 'en',
                gdid: ''
              }],
              examples: [],
              isWordType: true,
              originalWord: word
            } as Dictionary;
          }
        });
        resultDictionaries.push(...batchResults);

        // Yield control to prevent blocking
        if (i + batchSize < cleanWords.length) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      this.dictionaries = resultDictionaries;

      const mappingTime = performance.now();
      console.log(`🗺️ Dictionary mapping time: ${(mappingTime - cacheTime).toFixed(2)}ms`);

      // No need to store words - they're retrieved from DOM when needed

      const finalTime = performance.now();
      console.log(`🏁 Total setScript time: ${(finalTime - startTime).toFixed(2)}ms`);

    } catch (error) {
      console.error('Failed to load dictionaries:', error);
    } finally {
      this.isLoadingDictionaries = false;
    }
  }



  async add() {
  }

  private seekYouTubeToScriptTime(scriptIndex: number) {
    if (!this.youtubePlayer || !this.youtubePlayerReady || !this.scripts) {
      return;
    }

    const currentScript = this.scripts[scriptIndex];
    if (!currentScript || !currentScript.t) {
      return;
    }

    // Parse time string
    const timeInSeconds = this.parseTimeString(currentScript.t);
    if (timeInSeconds === null) {
      return;
    }

    console.log(`🎥 Seeking YouTube to ${timeInSeconds}s (${currentScript.t})`);

    try {
      // Check if player is ready for seeking
      const playerState = this.youtubePlayer.getPlayerState();

      // Seek to the time without playing - just move to position
      this.youtubePlayer.seekTo(timeInSeconds, true);

      // Only pause if the video was not already paused/stopped
      if (playerState === 1) { // Only pause if currently playing
        this.youtubePlayer.pauseVideo();
      }
    } catch (error) {
      console.error('🎥 Error seeking YouTube player:', error);
    }
  }

  // Toggle favorite status for a word
  toggleFavorite(word: string, meaning: string) {
    if (!word || !this.addToFavorites || !this.removeFavorite || !this.isWordFavorite) {
      console.warn('Favorite functions not available or word is empty');
      return;
    }

    const isFavorite = this.isWordFavorite(word);

    if (isFavorite) {
      this.removeFavorite(word);
    } else {
      this.addToFavorites(word, meaning);
    }
  }

  // Check if word is favorite (public method for template)
  checkWordFavorite(word: string): boolean {
    if (!word || !this.isWordFavorite) {
      return false;
    }
    return this.isWordFavorite(word);
  }

  // Get current item info
  getCurrentItem(): ItemData | undefined {
    if (!this.items || !this.name) return undefined;
    return this.items.find(item => item.name === this.name);
  }

  private createYouTubeEmbed() {
    if (!ValidUtils.isBrowser() || !this.currentItem?.link) {
      console.warn('🎥 Cannot create YouTube embed: browser check or link missing');
      return;
    }

    const container = document.getElementById('youtube-player-container');
    if (!container) {
      console.warn('🎥 YouTube container not found, retrying...');
      setTimeout(() => this.createYouTubeEmbed(), 200);
      return;
    }

    // Extract video ID from YouTube URL
    const videoId = this.extractYouTubeVideoId(this.currentItem.link);
    if (!videoId) {
      console.error('🎥 Could not extract YouTube video ID from:', this.currentItem.link);
      return;
    }

    console.log('🎥 Creating YouTube player for video:', videoId);

    // Wait for YouTube API to be ready
    const initPlayer = () => {
      if (typeof (window as any).YT !== 'undefined' && (window as any).YT.Player) {
        this.createYouTubePlayer(videoId);
      } else {
        console.log('🎥 YouTube API not ready, waiting...');
        setTimeout(initPlayer, 200);
      }
    };

    // Check if YouTube API is already loaded
    if (typeof (window as any).YT !== 'undefined') {
      if ((window as any).YT.loaded === 1) {
        console.log('🎥 YouTube API already loaded');
        this.createYouTubePlayer(videoId);
      } else {
        console.log('🎥 YouTube API loading, setting callback...');
        (window as any).onYouTubeIframeAPIReady = () => {
          console.log('🎥 YouTube API ready callback triggered');
          this.createYouTubePlayer(videoId);
        };
      }
    } else {
      console.log('🎥 YouTube API not found, waiting for it to load...');
      initPlayer();
    }
  }

  private createYouTubePlayer(videoId: string) {
    const container = document.getElementById('youtube-player-container');
    if (!container) {
      console.error('🎥 YouTube player container not found during creation');
      return;
    }

    // Clear existing content and create player div
    container.innerHTML = '';
    const playerDiv = document.createElement('div');
    playerDiv.id = 'youtube-player-' + Date.now();
    container.appendChild(playerDiv);

    try {
      this.youtubePlayer = new (window as any).YT.Player(playerDiv.id, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          disablekb: 0,
          enablejsapi: 1,
          fs: 1,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0
        },
        events: {
          onReady: (event: any) => {
            console.log('🎥 YouTube player ready successfully!');
            this.youtubePlayerReady = true;
            // Start monitoring playback time
            this.startYouTubeTimeMonitoring();
          },
          onStateChange: (event: any) => {
            console.log('🎥 YouTube player state changed:', event.data);
          },
          onError: (event: any) => {
            console.error('🎥 YouTube player error:', event.data);
          }
        }
      });

      console.log('🎥 YouTube player instance created:', this.youtubePlayer);
    } catch (error) {
      console.error('🎥 Failed to create YouTube player:', error);
    }
  }

  private extractYouTubeVideoId(url: string): string | null {
    console.log('🎥 Extracting video ID from URL:', url);

    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const videoId = match[1];
        console.log('🎥 Extracted video ID:', videoId);
        return videoId;
      }
    }

    console.error('🎥 Could not extract video ID from URL:', url);
    return null;
  }

  // Get item by name
  getItemByName(name: string): ItemData | undefined {
    if (!this.items) return undefined;
    return this.items.find(item => item.name === name);
  }

  // Get all items of specific type
  getItemsByType(type: string): ItemData[] {
    if (!this.items) return [];
    return this.items.filter(item => item.type === type);
  }

  onDestroy() {
    // Stop any ongoing speech and word highlighting
    this.stopSpeech();
    this.stopWordHighlighting();

    // Reset states
    this.isPlayingScript = false;
    this.isPlayingWord = false;

    // Clear timeouts
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    super.onDestroy();
  }
}
