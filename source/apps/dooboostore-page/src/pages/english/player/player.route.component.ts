import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './player.route.component.html';
import styles from './player.route.component.css';
import { Lifecycle, Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { ApiService } from '@dooboostore/simple-boot/fetch/ApiService';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { OnRawSetRenderedOtherData } from '@dooboostore/dom-render/lifecycle/OnRawSetRendered';
import { OnCreateRender } from '@dooboostore/dom-render/lifecycle/OnCreateRender';
import { RouterAction } from '@dooboostore/simple-boot/route/RouterAction';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import { ComponentBase } from '@dooboostore/dom-render/components/ComponentBase';
import { VideoItem, VideoItemService } from '@src/service/english/VideoItemService';
import { VoiceService } from '@src/service/VoiceService';
import { AutoTranslationService, TranslationItemSet } from '@src/service/english/AutoTranslationService';
import { Dictionary, DictionaryService } from '@src/service/english/DictionaryService';
import { isDefined } from "@dooboostore/core/types";

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


@Sim({
  scope: Lifecycle.Transient
})
@Component({
  template,
  styles
})
export class PlayerRouteComponent extends ComponentBase implements RouterAction.OnRouting, OnCreateRender {
  private name?: string | undefined;
  dictionaries?: Dictionary[];
  currentItem?: VideoItem;
  translations?: TranslationItemSet[];
  private allTranslations?: TranslationItemSet[]; // 전체 자막 (영어 + 한글)
  currentActiveIndex = -1;

  // Favorite functions passed from parent router
  addToFavorites?: (word: string, meaning: string) => boolean;
  removeFavorite?: (word: string) => void;
  isWordFavorite?: (word: string) => boolean;

  showTranslation = false;
  autoPlayEnabled = false;
  hideWordsEnabled = false;
  soundEnabled = true;
  showKoreanTranslation = false;
  isPlayingScript = false;
  isPlayingWord = false;
  isLoadingScripts = true;
  isLoadingDictionaries = false;
  
  private scrollTimeout?: number;
  private wordHighlightInterval?: number;
  private youtubePlayer?: any;
  private youtubePlayerReady = false;
  private userManuallySelected = false;
  private lastManualSelectionTime = 0;
  private playButtonClicked = false;
  private cuePlayCheckInterval?: number;
  private hiddenWordIndices: Set<number> = new Set();
  private youtubeTimeMonitoringInterval?: number;
  private timeouts: number[] = [];
  private intervals: number[] = [];
  
  // Global word slider for all items
  globalWordIndex = -1;
  maxGlobalWordIndex = 0;
  private allWords: string[] = [];
  private wordToItemMap: Map<number, number> = new Map();

  constructor(
    private apiService: ApiService,
    private videoItemService: VideoItemService,
    private voiceService: VoiceService,
    private autoTranslationService: AutoTranslationService,
    private dictionaryService: DictionaryService
  ) {
    super();
  }

  onCreateRender(param: any): void {
    console.log('PlayerRouteComponent onCreateRender called with params:', param);
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
    this.name = undefined;
    this.dictionaries = undefined;
    this.currentItem = undefined;
    this.translations = undefined;
    this.allTranslations = undefined;
    this.currentActiveIndex = -1;
    const routingStartTime = performance.now();
    console.log('⏱️ [PERF] onRouting started');
    
    this.name = decodeURIComponent(r.routerModule.pathData?.name??'');
    console.log('Routing to PlayerRouteComponent with name:', this.name);

    if (ValidUtils.isBrowser() && this.name) {
      try {
        this.isLoadingScripts = true;
        console.log(`⏱️ [PERF] isLoadingScripts set to true: ${(performance.now() - routingStartTime).toFixed(2)}ms`);

        // Load video item first
        const itemStartTime = performance.now();
        this.currentItem = await this.videoItemService.item(this.name);
        console.log(`⏱️ [PERF] videoItemService.item loaded: ${(performance.now() - itemStartTime).toFixed(2)}ms`);
        console.log(`🎯 Current item:`, this.currentItem);
        
        // Load translations (all content is YouTube type)
        const translationStartTime = performance.now();
        await this.loadTranslations();
        console.log(`⏱️ [PERF] loadTranslations completed: ${(performance.now() - translationStartTime).toFixed(2)}ms`);
        
        // Hide loading screen immediately after translations are loaded
        this.isLoadingScripts = false;
        console.log(`⏱️ [PERF] isLoadingScripts set to false: ${(performance.now() - routingStartTime).toFixed(2)}ms`);
        
        // Initialize YouTube player after translations are loaded
        setTimeout(() => {
          const youtubeStartTime = performance.now();
          this.createYouTubeEmbed();
          console.log(`⏱️ [PERF] createYouTubeEmbed called: ${(performance.now() - youtubeStartTime).toFixed(2)}ms`);
        }, 300);

        console.log('🎤 Voice service ready');
        console.log(`⏱️ [PERF] ✅ Total onRouting time: ${(performance.now() - routingStartTime).toFixed(2)}ms`);
      } catch (error) {
        console.error('Failed to load data:', error);
        this.isLoadingScripts = false;
      }
    }
  }

  async onInitRender(param: any, rawSet: RawSet): Promise<void> {
    await super.onInitRender(param, rawSet);
  }

  private async loadTranslations(): Promise<void> {
    if (!this.name) return;
    
    const loadStartTime = performance.now();
    
    try {
      console.log('📄 Loading translations...');
      
      // Load translation script (English + Korean)
      const fetchStart = performance.now();
      this.allTranslations = await this.autoTranslationService.getTranslationScript(this.name);
      console.log(`⏱️ [PERF] Translation fetch: ${(performance.now() - fetchStart).toFixed(2)}ms`);
      // console.log('allTranslations------->', this.allTranslations);
      console.log(`✅ Loaded ${this.allTranslations.length} translation items`);
      
      // 초기에는 영어만 표시
      this.filterTranslations();
      
      // Build global word index from all translations
      const buildIndexStart = performance.now();
      this.buildGlobalWordIndex();
      console.log(`⏱️ [PERF] buildGlobalWordIndex: ${(performance.now() - buildIndexStart).toFixed(2)}ms`);
      
      // 첫 번째 자막 즉시 선택 - UI 먼저 보여주기
      if (this.translations && this.translations.length > 0) {
        console.log(`⏱️ [PERF] About to call requestAnimationFrame for selectFirstItem`);
        const beforeRAF = performance.now();
        requestAnimationFrame(() => {
          const rafStart = performance.now();
          console.log(`⏱️ [PERF] requestAnimationFrame delay: ${(rafStart - beforeRAF).toFixed(2)}ms`);
          this.selectFirstItem();
          console.log(`⏱️ [PERF] selectFirstItem callback completed: ${(performance.now() - rafStart).toFixed(2)}ms`);
        });
        console.log(`⏱️ [PERF] requestAnimationFrame scheduled: ${(performance.now() - beforeRAF).toFixed(2)}ms`);
      }
      
      console.log(`⏱️ [PERF] ✅ Total loadTranslations time: ${(performance.now() - loadStartTime).toFixed(2)}ms`);
      
    } catch (error) {
      console.error('Failed to load translations:', error);
      this.translations = [];
    }
  }

  private buildGlobalWordIndex(): void {
    const buildStartTime = performance.now();
    if (!this.allTranslations) return;
    
    const allWords: string[] = [];
    const wordToItemMap = new Map<number, number>();
    
    let globalIndex = 0;
    const items = this.allTranslations; // 필터링되지 않은 전체 자막 사용
    const itemsLength = items.length;
    
    for (let itemIndex = 0; itemIndex < itemsLength; itemIndex++) {
      const item = items[itemIndex];
      // 영어 자막만 단어 인덱스에 포함
      if (item.type === 'en') {
        const words = item.text.split(/\s+/);
        const wordsLength = words.length;
        
        for (let i = 0; i < wordsLength; i++) {
          allWords.push(words[i]);
          wordToItemMap.set(globalIndex, itemIndex); // allTranslations 기준 인덱스 저장
          globalIndex++;
        }
      }
    }
    
    this.allWords = allWords;
    this.wordToItemMap = wordToItemMap;
    this.maxGlobalWordIndex = Math.max(0, allWords.length - 1);
    
    console.log(`📊 Built global word index: ${allWords.length} words across ${itemsLength} items`);
    console.log(`⏱️ [PERF] buildGlobalWordIndex actual time: ${(performance.now() - buildStartTime).toFixed(2)}ms`);
  }

  private selectFirstItem(): void {
    if (!ValidUtils.isBrowser() || !this.translations || this.translations.length === 0) {
      return;
    }
    
    const selectStartTime = performance.now();
    console.log('🎯 Auto-selecting first translation item');
    
    this.currentActiveIndex = 0;
    console.log(`⏱️ [PERF] Set currentActiveIndex: ${(performance.now() - selectStartTime).toFixed(2)}ms`);
    
    const stylingStart = performance.now();
    this.updateActiveItemStyling();
    console.log(`⏱️ [PERF] updateActiveItemStyling: ${(performance.now() - stylingStart).toFixed(2)}ms`);
    
    const sliderStart = performance.now();
    this.updateItemWordSliderRange();
    console.log(`⏱️ [PERF] updateItemWordSliderRange: ${(performance.now() - sliderStart).toFixed(2)}ms`);
    
    requestAnimationFrame(() => {
      const clickableStart = performance.now();
      this.makeActiveItemWordsClickable();
      console.log(`⏱️ [PERF] makeActiveItemWordsClickable: ${(performance.now() - clickableStart).toFixed(2)}ms`);
      console.log('✅ First item auto-selected and words made clickable');
    });
    
    setTimeout(() => {
      if (this.translations && this.translations.length > 0) {
        const dictStart = performance.now();
        // 첫 번째 영어 자막 찾기
        const firstEnglishItem = this.translations.find(item => item.type === 'en');
        if (firstEnglishItem) {
          this.setScript(firstEnglishItem.text);
        }
        console.log(`⏱️ [PERF] setScript called (async): ${(performance.now() - dictStart).toFixed(2)}ms`);
      }
    }, 50);
    
    const scrollStart = performance.now();
    this.scrollToActiveItem(0);
    console.log(`⏱️ [PERF] scrollToActiveItem: ${(performance.now() - scrollStart).toFixed(2)}ms`);
    
    console.log(`⏱️ [PERF] ✅ Total selectFirstItem time: ${(performance.now() - selectStartTime).toFixed(2)}ms`);
  }

  private updateActiveItemStyling(activeIndices?: number[]): void {
    if (!ValidUtils.isBrowser()) return;
    
    const items = document.querySelectorAll('.translation-item');
    
    if (activeIndices && activeIndices.length > 0) {
      // 여러 자막이 활성화된 경우
      items.forEach((item, index) => {
        if (activeIndices.includes(index)) {
          item.classList.add('active');
          // 마지막 활성화된 자막은 더 강조
          if (index === activeIndices[activeIndices.length - 1]) {
            item.classList.add('last-active');
          } else {
            item.classList.remove('last-active');
          }
        } else {
          item.classList.remove('active', 'last-active');
        }
      });
    } else {
      // 단일 자막 활성화 (기존 방식)
      items.forEach((item, index) => {
        if (index === this.currentActiveIndex) {
          item.classList.add('active', 'last-active');
        } else {
          item.classList.remove('active', 'last-active');
        }
      });
    }
  }

  private updateItemWordSliderRange(): void {
    if (!ValidUtils.isBrowser() || this.currentActiveIndex < 0 || !this.translations) return;
    
    const item = this.translations[this.currentActiveIndex];
    if (!item || item.type !== 'en') return;
    
    const words = item.text.split(/\s+/);
    const maxIndex = Math.max(0, words.length - 1);
    
    const slider = document.querySelector('.word-slider') as HTMLInputElement;
    if (slider) {
      slider.max = maxIndex.toString();
      slider.value = '-1';
    }
  }

  private makeActiveItemWordsClickable(): void {
    if (!ValidUtils.isBrowser() || this.currentActiveIndex < 0 || !this.translations) return;
    
    const item = this.translations[this.currentActiveIndex];
    if (!item || item.type !== 'en') return;
    
    const items = document.querySelectorAll('.translation-item');
    
    // 모든 이전 자막의 숨김 단어 복원 (일반 텍스트로)
    items.forEach((itemElement, index) => {
      if (index !== this.currentActiveIndex) {
        const textElement = itemElement.querySelector('.translation-text.english-text');
        if (textElement && this.translations && this.translations[index] && this.translations[index].type === 'en') {
          const itemData = this.translations[index];
          // 단순 텍스트로 복원 (클릭 불가능)
          textElement.textContent = itemData.text;
        }
      }
    });
    
    const activeItemElement = items[this.currentActiveIndex];
    if (!activeItemElement) return;
    
    const textElement = activeItemElement.querySelector('.translation-text.english-text');
    if (!textElement) return;
    
    const words = item.text.split(/\s+/);
    const htmlContent = words
      .map((word, index) => {
        const isHidden = this.hideWordsEnabled && this.hiddenWordIndices.has(index);
        const displayText = isHidden ? '___' : word;
        const hiddenClass = isHidden ? ' hidden-word' : '';
        return `<span class="word clickable-word${hiddenClass}" data-word-index="${index}" data-original-word="${word}">${displayText}</span>`;
      })
      .join(' ');
    
    textElement.innerHTML = htmlContent;
    
    textElement.querySelectorAll('.clickable-word').forEach((wordElement, index) => {
      wordElement.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        console.log(`🔤 Word clicked: ${wordElement.textContent}`);
        
        if (wordElement.classList.contains('hidden-word')) {
          const originalWord = wordElement.getAttribute('data-original-word');
          if (originalWord) {
            wordElement.textContent = originalWord;
            wordElement.classList.add('revealed');
            
            setTimeout(() => {
              if (this.hideWordsEnabled && wordElement.classList.contains('hidden-word')) {
                wordElement.textContent = '___';
                wordElement.classList.remove('revealed');
              }
            }, 2000);
          }
        }
        
        const slider = document.querySelector('.word-slider') as HTMLInputElement;
        if (slider) {
          slider.value = index.toString();
        }
        
        const globalWordIndex = this.getGlobalWordIndexForItem(this.currentActiveIndex) + index;
        this.globalWordIndex = globalWordIndex;
        
        this.onItemWordSliderChange(index);
        
        return false;
      }, true);
    });
    
    console.log(`✅ Made ${words.length} words clickable for item ${this.currentActiveIndex}`);
  }

  private scrollToActiveItem(index: number): void {
    if (!ValidUtils.isBrowser()) return;
    
    const items = document.querySelectorAll('.translation-item');
    if (items[index]) {
      items[index].scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }

  private getGlobalWordIndexForItem(translationsItemIndex: number): number {
    if (!this.translations || !this.allTranslations) return 0;
    
    // translations 인덱스를 allTranslations 인덱스로 변환
    const targetItem = this.translations[translationsItemIndex];
    if (!targetItem) return 0;
    
    const allTranslationsItemIndex = this.allTranslations.findIndex(item =>
      item.startMs === targetItem.startMs &&
      item.endMs === targetItem.endMs &&
      item.type === targetItem.type
    );
    
    if (allTranslationsItemIndex === -1) return 0;
    
    // allTranslations 기준으로 이전 영어 단어 수 계산
    let globalIndex = 0;
    for (let i = 0; i < allTranslationsItemIndex; i++) {
      if (this.allTranslations[i] && this.allTranslations[i].type === 'en') {
        globalIndex += this.allTranslations[i].text.split(/\s+/).length;
      }
    }
    return globalIndex;
  }

  private onItemWordSliderChange(wordIndex: number): void {
    if (!ValidUtils.isBrowser() || this.currentActiveIndex < 0 || !this.translations) return;
    
    const item = this.translations[this.currentActiveIndex];
    if (!item || item.type !== 'en') return;
    
    const words = item.text.split(/\s+/);
    if (wordIndex < 0 || wordIndex >= words.length) {
      this.updateItemWordHighlighting(-1);
      return;
    }
    
    const word = words[wordIndex];
    console.log(`🎚️ Word slider: ${wordIndex} - "${word}"`);
    
    this.updateItemWordHighlighting(wordIndex);
    this.scrollToDictionaryWordByText(word);
    
    if (this.soundEnabled) {
      this.speakWord(word);
    }
  }

  private updateItemWordHighlighting(wordIndex: number): void {
    if (!ValidUtils.isBrowser() || this.currentActiveIndex < 0) return;
    
    const items = document.querySelectorAll('.translation-item');
    const activeItem = items[this.currentActiveIndex];
    if (!activeItem) return;
    
    const wordElements = activeItem.querySelectorAll('.clickable-word');
    wordElements.forEach((wordElement, index) => {
      if (index === wordIndex) {
        wordElement.classList.add('highlighted');
      } else {
        wordElement.classList.remove('highlighted');
      }
    });
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  formatTimeMs(milliseconds: number): string {
    const seconds = milliseconds / 1000;
    return this.formatTime(seconds);
  }
  
  onTranslationItemClick(index: number, startMs: number, endMs: number, event?: Event): void {

    console.log('🖱️ onTranslationItemClick called with index:', index, 'startMs:', startMs, 'endMs:', endMs);
    if (event) {
      const target = event.target as HTMLElement;
      if (target && target.classList.contains('clickable-word')) {
        console.log('🚫 Click on word detected - ignoring item click');
        return;
      }
    }
    
    console.log(`🎬 Translation item clicked: ${index} at ${startMs}ms - ${endMs}ms`);
    
    this.stopCuePlayCheck();
    
    this.userManuallySelected = true;
    this.lastManualSelectionTime = Date.now();
    
    if (this.autoPlayEnabled) {
      this.autoPlayEnabled = false;
      console.log('🎮 Auto play disabled - user manually selected item');
    }
    
    this.currentActiveIndex = index;
    this.updateActiveItemStyling();
    this.updateGlobalSliderPosition(index);
    
    if (this.youtubePlayer && this.youtubePlayerReady) {
      const startSeconds = startMs / 1000;
      const endSeconds = endMs / 1000;
      
      this.youtubePlayer.seekTo(startSeconds, true);
      
      setTimeout(() => {
        if (this.youtubePlayer && this.youtubePlayerReady) {
          this.youtubePlayer.playVideo();
          console.log(`▶️ Playing segment: ${startSeconds}s - ${endSeconds}s`);
          
          setTimeout(() => {
            this.startCuePlayCheck(endSeconds);
          }, 100);
        }
      }, 100);
    }
    
    if (this.translations && this.translations[index] && this.translations[index].type === 'en') {
      this.setScript(this.translations[index].text);
      this.updateItemWordSliderRange();
      this.makeActiveItemWordsClickable();
    }
    
    console.log('🔒 Manual selection mode - auto-selection disabled until auto play is enabled');
  }
  
  onItemTimeClick(event: Event, text: string): void {
    event.stopPropagation();
    
    console.log(`🔊 Time clicked, playing: "${text.substring(0, 50)}..."`);
    
    if (this.soundEnabled) {
      this.speakScript(text);
    } else {
      console.log('🔇 Sound is disabled');
    }
  }
  
  private updateGlobalSliderPosition(itemIndex: number): void {
    const globalIndex = this.getGlobalWordIndexForItem(itemIndex);
    this.globalWordIndex = globalIndex;
    console.log(`🎚️ Updated global slider to position ${globalIndex} for item ${itemIndex}`);
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    
    if (!this.soundEnabled && ValidUtils.isBrowser()) {
      this.stopSpeech();
    }
  }

  toggleTranslation(): void {
    this.showTranslation = !this.showTranslation;
    console.log(`🌐 Translation: ${this.showTranslation ? 'shown' : 'hidden'}`);
  }

  toggleKoreanTranslation(): void {
    this.showKoreanTranslation = !this.showKoreanTranslation;
    console.log(`🇰🇷 Korean translation: ${this.showKoreanTranslation ? 'shown' : 'hidden'}`);
    
    // 현재 활성화된 자막의 시간 정보 저장
    let currentStartMs = -1;
    let currentEndMs = -1;
    if (this.currentActiveIndex >= 0 && this.translations && this.translations[this.currentActiveIndex]) {
      currentStartMs = this.translations[this.currentActiveIndex].startMs;
      currentEndMs = this.translations[this.currentActiveIndex].endMs;
    }
    
    // 필터링된 자막 다시 생성
    this.filterTranslations();
    
    // 필터링 후 같은 시간대의 자막 찾아서 활성화
    if (currentStartMs >= 0 && this.translations) {
      // 같은 시간대의 영어 자막 찾기
      const newIndex = this.translations.findIndex(item => 
        item.type === 'en' && item.startMs === currentStartMs && item.endMs === currentEndMs
      );
      
      if (newIndex >= 0) {
        this.currentActiveIndex = newIndex;
        
        // DOM 업데이트 후 스타일링 및 스크롤
        setTimeout(() => {
          this.updateActiveItemStyling();
          this.scrollToActiveItem(newIndex);
          this.makeActiveItemWordsClickable();
        }, 50);
      }
    }
  }
  
  private filterTranslations(): void {
    if (!this.allTranslations) return;
    
    if (this.showKoreanTranslation) {
      // 한글 번역 포함: 모든 자막 표시
      this.translations = this.allTranslations;
    } else {
      // 한글 번역 제외: 영어만 표시
      this.translations = this.allTranslations.filter(item => item.type === 'en');
    }
    
    console.log(`📝 Filtered translations: ${this.translations.length} items (Korean: ${this.showKoreanTranslation ? 'included' : 'excluded'})`);
  }
  
  toggleAutoPlay(): void {
    this.autoPlayEnabled = !this.autoPlayEnabled;
    console.log(`🎮 Auto play: ${this.autoPlayEnabled ? 'enabled' : 'disabled'}`);
    
    if (this.autoPlayEnabled) {
      this.userManuallySelected = false;
      console.log('🔓 Auto play enabled - auto-selection re-enabled');
      
      if (this.youtubePlayer && this.youtubePlayerReady) {
        try {
          if (this.currentActiveIndex >= 0 && this.translations) {
            const currentItem = this.translations[this.currentActiveIndex];
            if (currentItem) {
              this.youtubePlayer.seekTo(currentItem.startMs / 1000, true);
              console.log(`🎯 Seeking to current item at ${currentItem.startMs / 1000}s`);
            }
          }
          
          const playerState = this.youtubePlayer.getPlayerState();
          if (playerState === 2 || playerState === 5 || playerState === -1 || playerState === 0) {
            this.youtubePlayer.playVideo();
            console.log('▶️ Auto play enabled - started playing from current position');
          }
        } catch (error) {
          console.log('⚠️ Could not start playback:', error);
        }
      }
    }
  }
  
  toggleHideWords(): void {
    this.hideWordsEnabled = !this.hideWordsEnabled;
    console.log(`👁️ Hide words: ${this.hideWordsEnabled ? 'enabled' : 'disabled'}`);
    
    if (this.currentActiveIndex < 0) {
      console.warn('⚠️ No active item - cannot hide words');
      this.hideWordsEnabled = false;
      return;
    }
    
    if (this.hideWordsEnabled) {
      this.generateHiddenWordIndices();
    } else {
      this.hiddenWordIndices.clear();
    }
    
    this.makeActiveItemWordsClickable();
  }
  
  private generateHiddenWordIndices(): void {
    if (!this.translations || this.currentActiveIndex < 0) return;
    
    this.hiddenWordIndices.clear();
    
    const item = this.translations[this.currentActiveIndex];
    if (!item || item.type !== 'en') return;
    
    const words = item.text.split(/\s+/);
    const totalWords = words.length;
    const wordsToHide = Math.floor(totalWords * 0.3);
    
    const availableIndices = Array.from({ length: totalWords }, (_, i) => i);
    
    for (let i = 0; i < wordsToHide; i++) {
      const randomIndex = Math.floor(Math.random() * availableIndices.length);
      const wordIndex = availableIndices[randomIndex];
      this.hiddenWordIndices.add(wordIndex);
      availableIndices.splice(randomIndex, 1);
    }
    
    console.log(`👁️ Hiding ${wordsToHide} out of ${totalWords} words:`, Array.from(this.hiddenWordIndices));
  }

  previousWord(): void {
    if (this.globalWordIndex <= 0) {
      console.log('⬅️ Already at first word');
      return;
    }
    
    // allWords는 buildGlobalWordIndex에서 영어 자막만 포함하도록 구성됨
    const newIndex = this.globalWordIndex - 1;
    console.log(`⬅️ Moving to previous word: ${newIndex} (English only)`);
    this.onGlobalWordSliderChange(newIndex);
  }
  
  nextWord(): void {
    if (this.globalWordIndex >= this.maxGlobalWordIndex) {
      console.log('➡️ Already at last word');
      return;
    }
    
    // allWords는 buildGlobalWordIndex에서 영어 자막만 포함하도록 구성됨
    const newIndex = this.globalWordIndex + 1;
    console.log(`➡️ Moving to next word: ${newIndex} (English only)`);
    this.onGlobalWordSliderChange(newIndex);
  }
  
  previousCue(): void {
    if (!this.translations || this.currentActiveIndex <= 0) return;
    
    // 이전 영어 자막 찾기
    let newIndex = this.currentActiveIndex - 1;
    while (newIndex >= 0 && this.translations[newIndex].type !== 'en') {
      newIndex--;
    }
    
    if (newIndex < 0) return; // 이전 영어 자막이 없음
    
    const newItem = this.translations[newIndex];
    
    // 스크롤 먼저 이동
    this.scrollToActiveItem(newIndex);
    
    this.onTranslationItemClick(newIndex, newItem.startMs, newItem.endMs);
  }
  
  nextCue(): void {
    if (!this.translations || this.currentActiveIndex >= this.translations.length - 1) return;
    
    // 다음 영어 자막 찾기
    let newIndex = this.currentActiveIndex + 1;
    while (newIndex < this.translations.length && this.translations[newIndex].type !== 'en') {
      newIndex++;
    }
    
    if (newIndex >= this.translations.length) return; // 다음 영어 자막이 없음
    
    const newItem = this.translations[newIndex];
    
    // 스크롤 먼저 이동
    this.scrollToActiveItem(newIndex);
    
    this.onTranslationItemClick(newIndex, newItem.startMs, newItem.endMs);
  }

  onGlobalWordSliderChange(index: number): void {
    this.globalWordIndex = index;
    console.log(`🎚️ Global word slider: ${index} / ${this.maxGlobalWordIndex}`);
    
    if (this.autoPlayEnabled) {
      this.autoPlayEnabled = false;
      console.log('🎚️ Auto play disabled - user moved slider');
    }
    
    if (index < 0 || index >= this.allWords.length) {
      return;
    }
    
    // wordToItemMap은 allTranslations 기준 인덱스를 저장
    const allTranslationsItemIndex = this.wordToItemMap.get(index);
    if (allTranslationsItemIndex === undefined) return;
    
    // allTranslations 인덱스를 translations 인덱스로 변환
    const translationsItemIndex = this.convertAllTranslationsIndexToTranslationsIndex(allTranslationsItemIndex);
    if (translationsItemIndex === -1) return;
    
    if (translationsItemIndex !== this.currentActiveIndex) {
      this.currentActiveIndex = translationsItemIndex;
      
      this.updateActiveItemStyling();
      
      if (this.translations && this.translations[translationsItemIndex] && this.translations[translationsItemIndex].type === 'en') {
        this.setScript(this.translations[translationsItemIndex].text);
        this.updateItemWordSliderRange();
        this.makeActiveItemWordsClickable();
      }
      
      this.scrollToActiveItem(translationsItemIndex);
    }
    
    if (this.youtubePlayer && this.youtubePlayerReady && this.allTranslations && this.allTranslations[allTranslationsItemIndex]) {
      try {
        const item = this.allTranslations[allTranslationsItemIndex];
        this.youtubePlayer.seekTo(item.startMs / 1000, true);
        this.youtubePlayer.pauseVideo();
        console.log(`🎥 Seeked YouTube to item ${allTranslationsItemIndex} at ${item.startMs / 1000}s and paused`);
      } catch (error) {
        console.error('Failed to seek YouTube:', error);
      }
    }
    
    const localWordIndex = this.getLocalWordIndex(index);
    this.highlightGlobalWord(index, localWordIndex);
    
    const word = this.allWords[index];
    if (word) {
      this.scrollToDictionaryWordByText(word);
      
      if (this.soundEnabled) {
        this.speakWord(word);
      }
    }
  }
  
  private convertAllTranslationsIndexToTranslationsIndex(allTranslationsIndex: number): number {
    if (!this.allTranslations || !this.translations) return -1;
    
    // allTranslations에서 해당 아이템 찾기
    const targetItem = this.allTranslations[allTranslationsIndex];
    if (!targetItem) return -1;
    
    // translations에서 같은 아이템 찾기 (startMs와 endMs로 매칭)
    const translationsIndex = this.translations.findIndex(item => 
      item.startMs === targetItem.startMs && 
      item.endMs === targetItem.endMs &&
      item.type === targetItem.type
    );
    
    return translationsIndex;
  }

  private getLocalWordIndex(globalIndex: number): number {
    const allTranslationsItemIndex = this.wordToItemMap.get(globalIndex);
    if (allTranslationsItemIndex === undefined) return -1;
    
    // allTranslations 기준으로 이전 단어 수 계산
    let wordsBefore = 0;
    for (let i = 0; i < allTranslationsItemIndex; i++) {
      if (this.allTranslations && this.allTranslations[i] && this.allTranslations[i].type === 'en') {
        wordsBefore += this.allTranslations[i].text.split(/\s+/).length;
      }
    }
    
    return globalIndex - wordsBefore;
  }
  
  private highlightGlobalWord(globalIndex: number, localIndex: number): void {
    if (!ValidUtils.isBrowser()) return;
    
    const allWords = document.querySelectorAll('.clickable-word');
    allWords.forEach(word => word.classList.remove('highlighted'));
    
    const allTranslationsItemIndex = this.wordToItemMap.get(globalIndex);
    if (allTranslationsItemIndex === undefined) return;
    
    // allTranslations 인덱스를 translations 인덱스로 변환
    const translationsItemIndex = this.convertAllTranslationsIndexToTranslationsIndex(allTranslationsItemIndex);
    if (translationsItemIndex === -1) return;
    
    const items = document.querySelectorAll('.translation-item');
    const targetItem = items[translationsItemIndex];
    if (!targetItem) return;
    
    const wordElements = targetItem.querySelectorAll('.clickable-word');
    if (wordElements[localIndex]) {
      wordElements[localIndex].classList.add('highlighted');
      
      wordElements[localIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  replayCurrentCue() {
    if (!this.translations || this.currentActiveIndex < 0) return;
    
    const currentItem = this.translations[this.currentActiveIndex];
    this.onTranslationItemClick(this.currentActiveIndex, currentItem.startMs, currentItem.endMs);
  }

  private speakWord(word: string) {
    if (!this.soundEnabled) return;
    this.voiceService.speakWord(word);
  }

  private stopSpeech() {
    const { wasPlayingScript, wasPlayingWord } = this.voiceService.stopSpeech();
    
    this.isPlayingScript = false;
    this.isPlayingWord = false;

    if (wasPlayingScript) {
      this.stopRangeAnimation();
    }

    if (wasPlayingScript && !wasPlayingWord) {
      setTimeout(() => {
        const slider = document.querySelector('.word-slider') as HTMLInputElement;
        const playing = this.voiceService.isPlaying();
        if (slider && !playing.script && !playing.word) {
          slider.value = '-1';
          console.log(`🔄 Manual script stop - reset to initial state`);
        }
      }, 100);
    }
  }

  private stopRangeAnimation() {
    if (this.wordHighlightInterval) {
      clearInterval(this.wordHighlightInterval);
      this.wordHighlightInterval = undefined;
    }
  }

  private speakScript(scriptText: string) {
    if (!this.soundEnabled) return;

    this.stopSpeech();

    this.isPlayingScript = true;

    const slider = document.querySelector('.word-slider') as HTMLInputElement;
    if (slider) {
      slider.value = '0';
    }

    this.voiceService.speakScript(
      scriptText,
      () => {
        this.isPlayingScript = true;
      },
      () => {
        this.isPlayingScript = false;
        this.stopRangeAnimation();
      },
      () => {
        this.isPlayingScript = false;
        this.stopRangeAnimation();
      }
    );
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

    if (this.soundEnabled && dictionary.items && dictionary.items.length > 0) {
      const firstItem = dictionary.items[0];
      if (firstItem && firstItem.entry) {
        this.speakWord(firstItem.entry);
      }
    }
  }

  private resetDictionaryScroll(): void {
    if (!ValidUtils.isBrowser()) return;
    
    requestAnimationFrame(() => {
      const dictionarySection = document.querySelector('.dictionary-section');
      if (dictionarySection) {
        dictionarySection.scrollTop = 0;
        console.log('📜 Dictionary section scrolled to top');
      }
    });
  }

  private scrollToDictionaryWordByText(word: string): void {
    if (!ValidUtils.isBrowser() || !this.dictionaries) return;
    
    const cleanWord = word.replace(/[,.":!?;[\]\-]/g, '').toLowerCase();
    if (!cleanWord) return;
    
    const dictionaryIndex = this.dictionaries.findIndex(dict =>
      dict && dict.originalWord === cleanWord
    );
    
    if (dictionaryIndex >= 0) {
      setTimeout(() => {
        const dictionaryItems = document.querySelectorAll('.dictionary-item');
        
        if (dictionaryItems[dictionaryIndex]) {
          const targetElement = dictionaryItems[dictionaryIndex] as HTMLElement;
          const isMobile = window.innerWidth <= 768;
          
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: isMobile ? 'start' : 'center',
            inline: 'nearest'
          });
          
          targetElement.classList.add('highlighted-dictionary');
          setTimeout(() => {
            targetElement.classList.remove('highlighted-dictionary');
          }, 2000);
        }
      }, 100);
    }
  }

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

  checkWordFavorite(word: string): boolean {
    if (!word || !this.isWordFavorite) {
      return false;
    }
    return this.isWordFavorite(word);
  }

  async setScript(script: string) {
    const startTime = performance.now();
    console.log('📚 setScript started');

    try {
      this.isLoadingDictionaries = false;
      
      const rawWords = script.split(/\s+/);
      const uniqueWords = new Set<string>();
      const punctuationRegex = /[,.":!?;[\]\-]/g;

      for (let i = 0; i < rawWords.length; i++) {
        const word = rawWords[i];
        if (word) {
          const cleanWord = word.replace(punctuationRegex, '').toLowerCase();
          if (cleanWord) {
            uniqueWords.add(cleanWord);
          }
        }
      }

      const cleanWords = Array.from(uniqueWords);
      const cleaningTime = performance.now();
      console.log(`🧹 Word cleaning time: ${(cleaningTime - startTime).toFixed(2)}ms (${cleanWords.length} unique words from ${rawWords.length} total)`);

      // DictionaryService를 사용하여 단어들 가져오기
      const fetchStart = performance.now();
      const dictionaries: any[] =[];
      (await this.dictionaryService.getWords(cleanWords)).forEach((word, index) => {
        if (index > 0 && Math.random() < 0.3) {
          dictionaries!.push(null as any);
        }
        dictionaries!.push(word);
      });
      this.dictionaries = dictionaries;
      const fetchTime = performance.now();
      console.log(`🌐 DictionaryService fetch time: ${(fetchTime - fetchStart).toFixed(2)}ms (${cleanWords.length} unique words)`);
      console.log(`💾 Cache size: ${this.dictionaryService.getCacheSize()} items`);

      // 사전 섹션 스크롤을 맨 위로 초기화
      this.resetDictionaryScroll();

      const finalTime = performance.now();
      console.log(`🏁 Total setScript time: ${(finalTime - startTime).toFixed(2)}ms`);

    } catch (error) {
      console.error('Failed to load dictionaries:', error);
    } finally {
      this.isLoadingDictionaries = false;
    }
  }

  private startYouTubeTimeMonitoring() {
    if (!this.youtubePlayer || !this.youtubePlayerReady) {
      return;
    }

    console.log('🎬 Started YouTube time monitoring (every 200ms)');

    this.youtubeTimeMonitoringInterval = setInterval(() => {
      if (this.youtubePlayer && this.youtubePlayerReady) {
        try {
          const playerState = this.youtubePlayer.getPlayerState();
          if (playerState === 1) {
            const currentTime = this.youtubePlayer.getCurrentTime();
            this.updateScriptSelectionByTime(currentTime);
          }
        } catch (error) {
          // Ignore errors
        }
      }
    }, 50) as any;

    if (this.youtubeTimeMonitoringInterval)
    this.intervals.push(this.youtubeTimeMonitoringInterval);
  }

  private updateScriptSelectionByTime(currentTime: number) {
    // console.log(`⏱️ YouTube time: ${currentTime.toFixed(2)}s`);
    
    if (this.userManuallySelected) {
      console.log('🚫 Skipping auto-selection - user manually selected');
      return;
    }
    
    if (this.playButtonClicked) {
      console.log('🚫 Skipping auto-selection - play button is active');
      return;
    }

    if (currentTime < 1) return;

    try {
      const playerState = this.youtubePlayer?.getPlayerState();
      if (playerState !== 1 && playerState !== 2) {
        console.log(`⏸️ YouTube not playing (state: ${playerState})`);
        return;
      }
    } catch (error) {
      return;
    }

    if (this.translations) {
      const currentTimeMs = currentTime * 1000;
      const adjustedTimeMs = currentTimeMs + 500; // 200ms 일찍 자막 선택
      
      // 현재 시간에 겹치는 모든 자막 찾기
      const matchingIndices: number[] = [];
      let lastEnglishIndex = -1; // 마지막 영어 자막 인덱스
      
      for (let i = 0; i < this.translations.length; i++) {
        const item = this.translations[i];
        if (item.type==='en' && adjustedTimeMs >= item.startMs && adjustedTimeMs < item.endMs) {
          matchingIndices.push(i);
          lastEnglishIndex = i;
        }
      }
      
      // 영어 자막을 우선으로 선택, 없으면 마지막 자막
      const lastMatchingIndex = lastEnglishIndex >= 0 ? lastEnglishIndex : 
                                (matchingIndices.length > 0 ? matchingIndices[matchingIndices.length - 1] : -1);
      const selectionChanged = lastMatchingIndex !== this.currentActiveIndex;
      
      if (!this.autoPlayEnabled && selectionChanged) {
        if (this.currentActiveIndex >= 0) {
          if (lastMatchingIndex < 0 || lastMatchingIndex !== this.currentActiveIndex) {
            console.log(`⏸️ Auto play disabled - pausing (current: ${this.currentActiveIndex}, new: ${lastMatchingIndex})`);
            
            if (this.youtubePlayer && this.youtubePlayerReady) {
              try {
                this.youtubePlayer.pauseVideo();
              } catch (error) {
                // Ignore
              }
            }
            return;
          }
        }
      }
      
      if (matchingIndices.length > 0) {
        // 겹치는 자막들 모두 활성화
        this.updateActiveItemStyling(matchingIndices);
        
        if (selectionChanged && lastMatchingIndex >= 0) {
          this.currentActiveIndex = lastMatchingIndex;
          
          this.scrollToActiveItem(lastMatchingIndex);
          
          const item = this.translations[lastMatchingIndex];
          if (item.type === 'en') {
            this.setScript(item.text);
          }
          
          this.updateItemWordSliderRange();
          
          // Hide words가 활성화되어 있으면 새로운 숨김 단어 생성
          if (this.hideWordsEnabled) {
            this.generateHiddenWordIndices();
          }
          
          // DOM 업데이트 후 단어 클릭 가능하게 만들기
          requestAnimationFrame(() => {
            this.makeActiveItemWordsClickable();
          });
          
          this.updateGlobalSliderPosition(lastMatchingIndex);
          
          console.log(`🎥 Auto-selected ${matchingIndices.length} overlapping items, primary: ${lastMatchingIndex} at ${currentTime.toFixed(1)}s`);
        }
      } else if (this.currentActiveIndex >= 0) {
        // 매칭되는 자막이 없으면 모든 활성화 제거
        this.updateActiveItemStyling([]);
      }
    }
  }

  private startCuePlayCheck(endTime: number): void {
    this.stopCuePlayCheck();
    
    console.log(`⏱️ Started checking for cue end at ${endTime.toFixed(3)}s`);
    
    this.cuePlayCheckInterval = setInterval(() => {
      if (!this.youtubePlayer || !this.youtubePlayerReady) {
        this.stopCuePlayCheck();
        return;
      }
      
      try {
        const currentTime = this.youtubePlayer.getCurrentTime();
        
        if (currentTime >= endTime - 0.5) {
          console.log(`⏱️ Checking: ${currentTime.toFixed(3)}s / ${endTime.toFixed(3)}s`);
        }
        
        if (currentTime >= endTime - 0.1) {
          this.youtubePlayer.pauseVideo();
          console.log(`⏸️ Paused at cue end: ${currentTime.toFixed(3)}s (target: ${endTime.toFixed(3)}s)`);
          this.stopCuePlayCheck();
        }
      } catch (error) {
        console.log('⚠️ Cue play check error:', error);
      }
    }, 50) as any;

    if (this.cuePlayCheckInterval)
    this.intervals.push(this.cuePlayCheckInterval);
  }
  
  private stopCuePlayCheck(): void {
    if (this.cuePlayCheckInterval) {
      clearInterval(this.cuePlayCheckInterval);
      this.cuePlayCheckInterval = undefined;
    }
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

    const videoId = this.extractYouTubeVideoId(this.currentItem.link);
    if (!videoId) {
      console.error('🎥 Could not extract YouTube video ID from:', this.currentItem.link);
      return;
    }

    console.log('🎥 Creating YouTube player for video:', videoId);

    const initPlayer = () => {
      if (typeof (window as any).YT !== 'undefined' && (window as any).YT.Player) {
        this.createYouTubePlayer(videoId);
      } else {
        console.log('🎥 YouTube API not ready, waiting...');
        setTimeout(initPlayer, 200);
      }
    };

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
          showinfo: 0,
          cc_load_policy: 0
        },
        events: {
          onReady: (event: any) => {
            console.log('🎥 YouTube player ready successfully!');
            this.youtubePlayerReady = true;
            this.startYouTubeTimeMonitoring();
          },
          onStateChange: (event: any) => {
            console.log('🎥 YouTube player state changed:', event.data);
            this.handleYouTubeStateChange(event.data);
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

  private handleYouTubeStateChange(state: number): void {
    // YouTube Player States:
    // -1 (unstarted)
    // 0 (ended)
    // 1 (playing)
    // 2 (paused)
    // 3 (buffering)
    // 5 (video cued)
    
    if (state === 1) {
      // 재생 시작됨
      if (!this.autoPlayEnabled && !this.userManuallySelected) {
        // 유튜브 플레이어에서 직접 재생 버튼을 눌렀을 때
        this.autoPlayEnabled = true;
        console.log('▶️ YouTube player started - auto play enabled');
      }
    } else if (state === 2) {
      // 일시정지됨
      if (this.autoPlayEnabled && !this.userManuallySelected) {
        // 유튜브 플레이어에서 직접 일시정지 버튼을 눌렀을 때
        this.autoPlayEnabled = false;
        console.log('⏸️ YouTube player paused - auto play disabled');
      }
    }
  }

  private extractYouTubeVideoId(url: string): string | null {
    console.log('🎥 Extracting video ID from URL:', url);

    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
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

  onDrThisUnBind() {
    super.onDrThisUnBind();
    this.onDestroy();
  }

  onDestroy() {
    console.log('🧹 onDestroy called - cleaning up resources');
    
    // Stop all intervals
    this.stopCuePlayCheck();
    this.stopRangeAnimation();
    
    if (this.youtubeTimeMonitoringInterval) {
      clearInterval(this.youtubeTimeMonitoringInterval);
      this.youtubeTimeMonitoringInterval = undefined;
      console.log('🧹 Cleared YouTube time monitoring interval');
    }
    
    // Clear all tracked intervals
    this.intervals.forEach(intervalId => {
      clearInterval(intervalId);
    });
    this.intervals = [];
    console.log('🧹 Cleared all tracked intervals');
    
    // Clear all tracked timeouts
    this.timeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.timeouts = [];
    console.log('🧹 Cleared all tracked timeouts');
    
    // Clear specific timeout
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = undefined;
    }
    
    // Stop speech
    this.stopSpeech();

    this.isPlayingScript = false;
    this.isPlayingWord = false;
    
    // Destroy YouTube player
    if (this.youtubePlayer) {
      try {
        this.youtubePlayer.destroy();
        console.log('🧹 YouTube player destroyed');
      } catch (error) {
        console.warn('⚠️ Error destroying YouTube player:', error);
      }
      this.youtubePlayer = undefined;
    }
    
    this.youtubePlayerReady = false;

    console.log('✅ Cleanup completed');
    super.onDestroy();
  }
}
