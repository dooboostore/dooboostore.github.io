import {
  elementDefine,
  onConnectedShadow,
  onConnectedAfter,
  addEventListener,
  innerHtml, onInitialize, onDisconnected
} from "@dooboostore/simple-web-component";
import { ClipBoardUtils, Router } from "@dooboostore/core-web";
import { Inject } from '@dooboostore/simple-boot';
import { type VideoItem, VideoItemService, type VideoItemServiceType } from '../../services/english/VideoItemService';
import { AutoTranslationService, type AutoTranslationServiceType, type TranslationItemSet } from '../../services/english/AutoTranslationService';
import { DictionaryService, type DictionaryServiceType, type Dictionary } from '../../services/english/DictionaryService';
import { VoiceService, type VoiceServiceType } from '../../services/english/VoiceService';
import { OllamaService, type OllamaServiceType } from '../../services/OllamaService';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const tagName = 'center-english-player-page';

// marked 설정 (highlight.js 포함)
marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class EnglishPlayerPage extends w.HTMLElement {
    private router!: Router;
    private videoName: string = "";
    private videoItem: VideoItem | null = null;
    private allTranslations: TranslationItemSet[] = [];
    private translations: TranslationItemSet[] = [];
    private currentDictionaries: Dictionary[] = [];
    private currentActiveIndex: number = -1;
    private hiddenWordIndices: Set<number> = new Set();
    private youtubePlayer: any = null;
    private youtubePlayerReady: boolean = false;
    private videoTimeMonitoringInterval: number | null = null;
    private userManuallySelected: boolean = false;
    private lastManualSelectionTime: number = 0;
    private currentWordIndex: number = -1;
    private currentSelectedWord: string = "";

    // State flags
    private soundEnabled: boolean = true;
    private showKoreanTranslation: boolean = false;
    private autoPlayEnabled: boolean = false;
    private playbackRate: number = 1.0; // 영상 재생속도

    // 유튜브 플레이어 상태 헬퍼
    private videoItemService: VideoItemServiceType;
    private autoTranslationService: AutoTranslationServiceType;
    private dictionaryService: DictionaryServiceType;
    private voiceService: VoiceServiceType;
    private ollamaService: OllamaServiceType;
    
    // Ollama 분석 상태
    private ollamaAnalysisInProgress: boolean = false;
    private ollamaDialogOpen: boolean = false;
    private ollamaDialogScrollPosition: number = 0; // Dialog 열기 전 스크롤 위치 저장
    private ollamaDialogActiveIndex: number = -1; // Dialog 열기 전 선택된 문장 인덱스 저장
    private ollamaAvailable: boolean = false; // Ollama 서버 가용성
    constructor() {
      super();
    }
    private isPlaying(): boolean {
      if (!this.youtubePlayer || !this.youtubePlayer.getPlayerState)
        return false;
      return this.youtubePlayer.getPlayerState() === 1;
    }

    private isPaused(): boolean {
      if (!this.youtubePlayer || !this.youtubePlayer.getPlayerState)
        return false;
      return this.youtubePlayer.getPlayerState() === 2;
    }
    @onInitialize
    onInit(
      @Inject(VideoItemService.SYMBOL) videoItemService: VideoItemServiceType,
      @Inject(AutoTranslationService.SYMBOL) autoTranslationService: AutoTranslationServiceType,
      @Inject(DictionaryService.SYMBOL) dictionaryService: DictionaryServiceType,
      @Inject(VoiceService.SYMBOL) voiceService: VoiceServiceType,
      @Inject(OllamaService.SYMBOL) ollamaService: OllamaServiceType,
    ) {
      this.videoItemService = videoItemService;
      this.autoTranslationService = autoTranslationService;
      this.dictionaryService = dictionaryService;
      this.voiceService = voiceService;
      this.ollamaService = ollamaService;
    }

    @onConnectedAfter
    async onConnectedAfter(
      router: Router,
    ) {
      this.router = router;
      const name = this.getAttribute("name");
      if (!name) {
        console.error("No video name provided");
        return;
      }

      this.videoName = decodeURIComponent(name);
      try {
        this.videoItem = await this.videoItemService.item(this.videoName);
        if (!this.videoItem) {
          console.error("Video not found:", this.videoName);
          return;
        }

        // Update header title immediately after loading videoItem
        const headerTitle = this.shadowRoot?.querySelector(
          ".header-title",
        ) as HTMLElement;
        if (headerTitle && this.videoItem.name) {
          headerTitle.innerHTML = this.videoItem.name;
        }

        // Ollama 서버 가용성 확인
        console.log("[onConnectedAfter] Checking Ollama availability...");
        this.ollamaAvailable = await this.ollamaService.isAvailable();
        console.log("[onConnectedAfter] Ollama available:", this.ollamaAvailable);

        await this.loadTranslations();
        this.initYouTube();
        this.updateUI();

        // Select first item and load its words
        if (this.translations.length > 0) {
          this.currentActiveIndex = 0;
          this.renderTranslations();
          this.loadWordsFromCurrentSubtitle();
        }

        // Setup keyboard listeners
        this.setupKeyboardListeners();
      } catch (e) {
        console.error("Failed to initialize player", e);
      }
    }

    @onDisconnected
    onDisconnected(): void {
      // Clean up keyboard listeners
      this.removeKeyboardListeners();
      
      // Stop video monitoring
      this.stopVideoTimeMonitoring();
      
      // Pause video
      this.pauseYouTubeVideo();
    }

    private setupKeyboardListeners(): void {
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.shiftKey && e.key === "ArrowLeft") {
          e.preventDefault();
          this.jumpToFirstWord();
        } else if (e.shiftKey && e.key === "ArrowRight") {
          e.preventDefault();
          this.jumpToLastWord();
        } else if (e.shiftKey && (e.key === "<" || e.code === "Comma")) {
          // Shift + < (또는 Shift + ,)
          e.preventDefault();
          this.decreasePlaybackRate();
        } else if (e.shiftKey && (e.key === ">" || e.code === "Period")) {
          // Shift + > (또는 Shift + .)
          e.preventDefault();
          this.increasePlaybackRate();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.onPrevWord();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          this.onNextWord();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.onPrevCue();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          this.onNextCue();
        } else if (e.key === "Enter") {
          e.preventDefault();
          this.playFocusedWordOrSentence();
        } else if (e.key === " ") {
          e.preventDefault();
          this.replayCurrentSentence();
        } else if (e.key === "p") {
          // 소문자 p: 현재 문장 재생 후 문장 끝에서 멈춤
          e.preventDefault();
          this.playSentenceAndStop();
        } else if (e.key === "P") {
          // 대문자 P: 일시정지/재생 토글
          e.preventDefault();
          this.togglePlayPause();
        } else if (e.key === "w" || e.key === "W") {
          e.preventDefault();
          this.clearWordSelection();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          this.onSoundToggle();
        } else if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          this.onKoreanToggle();
        } else if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          this.onAutoPlayToggle();
        } else if (e.key === "o" || e.key === "O") {
          console.log("[setupKeyboardListeners] O key pressed - currentActiveIndex:", this.currentActiveIndex);
          e.preventDefault();
          this.onOllamaKeyboardShortcut();
        }
      };

      w.document.addEventListener("keydown", handleKeydown);
      (this as any)._keydownHandler = handleKeydown;
    }

    private removeKeyboardListeners(): void {
      const handler = (this as any)._keydownHandler;
      if (handler) {
        w.document.removeEventListener("keydown", handler);
        (this as any)._keydownHandler = null;
      }
    }

    private async loadTranslations(): Promise<void> {
      try {
        this.allTranslations =
          await this.autoTranslationService.getTranslationScript(this.videoName);
        this.filterTranslations();
      } catch (e) {
        console.error("Failed to load translations", e);
      }
    }

    private filterTranslations(): void {
      console.log("[filterTranslations] START - currentActiveIndex:", this.currentActiveIndex);
      console.log("[filterTranslations] START - showKoreanTranslation:", this.showKoreanTranslation);
      
      // currentActiveIndex는 항상 allTranslations 기준의 영어 인덱스
      // 필터링할 때도 이 값을 유지하면 됨
      
      if (this.showKoreanTranslation) {
        this.translations = this.allTranslations;
        console.log("[filterTranslations] Set translations to allTranslations (with Korean)");
      } else {
        this.translations = this.allTranslations.filter((t) => t.type === "en");
        console.log("[filterTranslations] Set translations to English only");
      }
      
      console.log("[filterTranslations] this.translations.length:", this.translations.length);
      
      // renderTranslations만 호출 (currentActiveIndex는 변경하지 않음)
      this.renderTranslations();
      
      console.log("[filterTranslations] END - currentActiveIndex:", this.currentActiveIndex);
      
      // 스크롤 위치 유지 (현재 선택된 영어 문장 위치 유지)
      requestAnimationFrame(() => {
        this.scrollToActiveItem();
      });
    }

    @innerHtml(".translations-list")
    private renderTranslations(): string {
      if (!this.translations.length) {
        return '<div class="empty">No translations available</div>';
      }

      // allTranslations 기준으로 영어 항목들의 인덱스를 미리 계산 (일관성 유지)
      const englishIndices = new Map<TranslationItemSet, number>();
      let englishCount = 0;
      for (const item of this.allTranslations) {
        if (item.type === "en") {
          englishIndices.set(item, englishCount);
          englishCount++;
        }
      }

      // 한글 항목들의 인덱스를 미리 계산
      const koreanIndices = new Map<TranslationItemSet, number>();
      let koreanCount = 0;
      for (const item of this.allTranslations) {
        if (item.type === "ko") {
          koreanIndices.set(item, koreanCount);
          koreanCount++;
        }
      }

      console.log("[renderTranslations] currentActiveIndex:", this.currentActiveIndex, "translations.length:", this.translations.length);
      console.log("[renderTranslations] Stack:", new Error().stack);
      
      return this.translations
        .map((item, idx) => {
          // 영어 항목인 경우 미리 계산된 인덱스 사용
          let englishIndex = -1;
          let koreanIndex = -1;
          
          if (item.type === "en") {
            englishIndex = englishIndices.get(item) ?? -1;
            const isActive = englishIndex === this.currentActiveIndex;
            if (isActive) {
              console.log(`[renderTranslations] ACTIVE EN at [${idx}] - englishIndex: ${englishIndex}`);
            }
          } else {
            // 한글 항목인 경우
            koreanIndex = koreanIndices.get(item) ?? -1;
          }
          
          // active 상태: 영어 항목이고 currentActiveIndex와 일치할 때만
          const isActive = item.type === "en" && englishIndex === this.currentActiveIndex;
          const langClass = item.type === "en" ? "en" : "ko";
          
          // data-en-index는 영어 항목에만, data-ko-index는 한글 항목에만 추가
          const enIndexAttr = item.type === "en" ? ` data-en-index="${englishIndex}"` : "";
          const koIndexAttr = item.type === "ko" ? ` data-ko-index="${koreanIndex}"` : "";
          
          return `
          <div class="translation-item ${isActive ? "active" : ""}" data-type="${item.type}"${enIndexAttr}${koIndexAttr}>
            ${isActive && this.ollamaAvailable ? `
              <div class="translation-item-actions">
                <button class="btn-ollama-analyze-inline" title="Analyze with Ollama (AI)">🤖</button>
              </div>
            ` : ''}
            <div class="translation-text ${langClass}">
              ${this.renderTranslationWithClickableWords(item.text, englishIndex)}
            </div>
          </div>
        `;
        })
        .join("");
    }

    private renderTranslationWithClickableWords(
      text: string,
      itemIndex: number,
    ): string {
      const words = text.split(/(\s+)/);
      let nonWhitespaceIndex = 0;

      return words
        .map((word, wordIdx) => {
          if (/^\s+$/.test(word)) return word;

          const cleanWord = word.replace(/[,.":!?;]/g, "").toLowerCase();
          const currentNonWhitespaceIndex = nonWhitespaceIndex;
          nonWhitespaceIndex++;

          return `
          <span class="word" 
                data-word="${cleanWord}" 
                data-item-index="${itemIndex}"
                data-word-index="${currentNonWhitespaceIndex}"
                aria-label="Click to see definition or hear pronunciation">
            ${word}
          </span>
        `;
        })
        .join("");
    }

    private initYouTube(): void {
      if (!this.videoItem?.link) return;

      const videoId = this.extractYouTubeId(this.videoItem.link);
      if (!videoId) return;

      const youtubeContainer =
        this.shadowRoot?.querySelector(".youtube-container");
      if (youtubeContainer) {
        youtubeContainer.innerHTML = `
          <iframe
            id="youtube-iframe"
            width="100%"
            height="100%"
            src="https://www.youtube.com/embed/${videoId}?enablejsapi=1"
            title="${this.videoName}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            style="border-radius: 8px;">
          </iframe>
        `;
      }

      // Initialize YouTube API
      this.initYouTubeAPI();
    }

    private initYouTubeAPI(): void {
      // Load YouTube IFrame API if not already loaded
      if (!(window as any).YT) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      // Wait for YouTube API to be ready
      const checkPlayer = setInterval(() => {
        const iframe = this.shadowRoot?.querySelector(
          "#youtube-iframe",
        ) as HTMLIFrameElement;
        if (iframe && (window as any).YT && (window as any).YT.Player) {
          clearInterval(checkPlayer);
          this.youtubePlayer = new (window as any).YT.Player(iframe, {
            events: {
              onReady: () => {
                this.youtubePlayerReady = true;
                console.log("YouTube player ready");
                this.startVideoTimeMonitoring();
              },
              onStateChange: (event: any) => this.onYouTubeStateChange(event),
            },
          });
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => clearInterval(checkPlayer), 5000);
    }

    private onYouTubeStateChange(event: any): void {
      const YT = (window as any).YT;
      if (event.data === YT.PlayerState.PLAYING) {
        this.startVideoTimeMonitoring();
      } else if (
        event.data === YT.PlayerState.PAUSED ||
        event.data === YT.PlayerState.ENDED
      ) {
        this.stopVideoTimeMonitoring();
      }
    }

    private startVideoTimeMonitoring(): void {
      if (this.videoTimeMonitoringInterval) return;

      this.videoTimeMonitoringInterval = window.setInterval(() => {
        if (!this.youtubePlayer || !this.youtubePlayerReady) return;

        try {
          const currentTimeMs = this.youtubePlayer.getCurrentTime() * 1000;
          this.updateSubtitleByVideoTime(currentTimeMs);
        } catch (e) {
          console.error("Error monitoring video time", e);
        }
      }, 500) as any;
    }

    private stopVideoTimeMonitoring(): void {
      if (this.videoTimeMonitoringInterval) {
        clearInterval(this.videoTimeMonitoringInterval);
        this.videoTimeMonitoringInterval = null;
      }
    }

    private updateSubtitleByVideoTime(currentTimeMs: number): void {
      if (!this.allTranslations || this.allTranslations.length === 0) return;

      // Find the subtitle that matches the current video time (using allTranslations as reference)
      let newIndex = -1;
      let englishCount = 0;
      for (let i = 0; i < this.allTranslations.length; i++) {
        const item = this.allTranslations[i];
        if (item.type === "en") {
          if (
            currentTimeMs >= item.startMs &&
            currentTimeMs < item.endMs
          ) {
            newIndex = englishCount;
            break;
          }
          englishCount++;
        }
      }

      // Update subtitle if it changed
      if (newIndex >= 0 && newIndex !== this.currentActiveIndex) {
        // Only auto-update if user didn't manually select a subtitle recently
        const timeSinceManualSelection =
          Date.now() - this.lastManualSelectionTime;
        
        console.log("[updateSubtitleByVideoTime] newIndex:", newIndex, "currentActiveIndex:", this.currentActiveIndex);
        console.log("[updateSubtitleByVideoTime] userManuallySelected:", this.userManuallySelected);
        console.log("[updateSubtitleByVideoTime] timeSinceManualSelection:", timeSinceManualSelection, "ms");
        console.log("[updateSubtitleByVideoTime] ollamaDialogOpen:", this.ollamaDialogOpen);
        
        // 다이얼로그가 열려있으면 자동 업데이트 하지 않음
        if (this.ollamaDialogOpen) {
          console.log("[updateSubtitleByVideoTime] SKIPPED - Ollama dialog is open");
          return;
        }
        
        if (timeSinceManualSelection > 5000) {
          // 5 second grace period
          console.log("[updateSubtitleByVideoTime] AUTO UPDATE - changing currentActiveIndex from", this.currentActiveIndex, "to", newIndex);
          this.currentActiveIndex = newIndex;
          this.renderTranslations();
          this.loadWordsFromCurrentSubtitle();

          // Scroll after DOM update with a small delay to ensure rendering is complete
          requestAnimationFrame(() => {
            this.scrollToActiveItem();
          });
        } else {
          console.log("[updateSubtitleByVideoTime] SKIPPED - within 5 second grace period");
        }
      }

      // Check if current subtitle has ended and user manually selected it
      if (this.userManuallySelected && this.currentActiveIndex >= 0) {
        // Find the English subtitle at currentActiveIndex
        let englishCount = 0;
        let currentEnglishItem = null;
        for (const item of this.allTranslations) {
          if (item.type === "en") {
            if (englishCount === this.currentActiveIndex) {
              currentEnglishItem = item;
              break;
            }
            englishCount++;
          }
        }
        
        if (currentEnglishItem && currentTimeMs >= currentEnglishItem.endMs) {
          console.log("[updateSubtitleByVideoTime] Manually selected subtitle ended, pausing video");
          // Pause video when manually selected subtitle ends
          this.pauseYouTubeVideo();
          this.userManuallySelected = false;
        }
      }
    }

    private seekYouTubeToTime(timeMs: number): void {
      if (!this.youtubePlayer || !this.youtubePlayerReady) {
        console.warn("YouTube player not ready");
        return;
      }

      try {
        const timeSeconds = timeMs / 1000;
        this.youtubePlayer.seekTo(timeSeconds, true);
      } catch (e) {
        console.error("Failed to seek YouTube video", e);
      }
    }

    private pauseYouTubeVideo(): void {
      if (!this.youtubePlayer || !this.youtubePlayerReady) {
        console.warn("YouTube player not ready");
        return;
      }

      try {
        this.youtubePlayer.pauseVideo();
      } catch (e) {
        console.error("Failed to pause YouTube video", e);
      }
    }

    private playYouTubeVideo(): void {
      if (!this.youtubePlayer || !this.youtubePlayerReady) {
        console.warn("YouTube player not ready");
        return;
      }

      try {
        this.youtubePlayer.playVideo();
      } catch (e) {
        console.error("Failed to play YouTube video", e);
      }
    }

    /**
     * P 키로 일시정지/재생 토글
     */
    private togglePlayPause(): void {
      console.log("[togglePlayPause] Called - current state:", this.isPlaying() ? "playing" : "paused");
      
      if (!this.youtubePlayer || !this.youtubePlayerReady) {
        console.warn("[togglePlayPause] YouTube player not ready");
        return;
      }

      try {
        if (this.isPlaying()) {
          console.log("[togglePlayPause] Pausing video");
          this.youtubePlayer.pauseVideo();
        } else {
          console.log("[togglePlayPause] Playing video");
          this.youtubePlayer.playVideo();
        }
      } catch (e) {
        console.error("[togglePlayPause] Failed to toggle play/pause", e);
      }
    }

    /**
     * p 키로 일시정지/재생 토글 (문장 끝에서 자동 멈춤)
     */
    private playSentenceAndStop(): void {
      console.log("[playSentenceAndStop] Called - current state:", this.isPlaying() ? "playing" : "paused");
      
      if (!this.youtubePlayer || !this.youtubePlayerReady) {
        console.warn("[playSentenceAndStop] YouTube player not ready");
        return;
      }

      if (this.currentActiveIndex < 0) {
        console.log("[playSentenceAndStop] Invalid index, returning");
        return;
      }

      // Mark as manually selected so video pauses at sentence end
      this.userManuallySelected = true;
      this.lastManualSelectionTime = Date.now();

      try {
        if (this.isPlaying()) {
          console.log("[playSentenceAndStop] Pausing video at current position");
          this.youtubePlayer.pauseVideo();
        } else {
          console.log("[playSentenceAndStop] Playing video from current position");
          this.youtubePlayer.playVideo();
        }
      } catch (e) {
        console.error("[playSentenceAndStop] Failed to toggle play/pause", e);
      }
    }

    private replayCurrentSentence(): void {
      console.log("[replayCurrentSentence] START - currentActiveIndex:", this.currentActiveIndex);
      
      if (this.currentActiveIndex < 0) {
        console.log("[replayCurrentSentence] Invalid index, returning");
        return;
      }

      // allTranslations에서 영어 항목을 찾기
      let englishCount = 0;
      let currentEnglishItem = null;
      
      for (const item of this.allTranslations) {
        if (item.type === "en") {
          if (englishCount === this.currentActiveIndex) {
            currentEnglishItem = item;
            break;
          }
          englishCount++;
        }
      }

      if (!currentEnglishItem || currentEnglishItem.startMs === undefined) {
        console.log("[replayCurrentSentence] Could not find English item or startMs is undefined");
        return;
      }

      console.log("[replayCurrentSentence] Found sentence:", currentEnglishItem.text, "startMs:", currentEnglishItem.startMs);
      
      // Mark as manually selected so video pauses at sentence end
      this.userManuallySelected = true;
      this.lastManualSelectionTime = Date.now();
      
      this.seekYouTubeToTime(currentEnglishItem.startMs);
      
      // Auto-play the sentence
      setTimeout(() => {
        this.playYouTubeVideo();
      }, 100);
    }

    private playFocusedWordOrSentence(): void {
      // If a word is focused, play the word
      if (this.currentWordIndex >= 0 && this.currentSelectedWord) {
        if (this.soundEnabled) {
          this.voiceService.speakWord(this.currentSelectedWord);
        }
      } else {
        // Otherwise, replay the current sentence
        this.replayCurrentSentence();
      }
    }

    private clearWordSelection(): void {
      this.currentWordIndex = -1;
      this.currentSelectedWord = "";
      this.highlightSelectedWord();
    }

    private extractYouTubeId(url: string): string | null {
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
        /youtube\.com\/embed\/([^&\n?#]+)/,
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    }

    private async loadDictionaryForWord(word: string): Promise<void> {
      try {
        // 단어 정제: 특수문자 제거
        const cleanWord = word.replace(/[,.":!?;[\](){}]/g, "").toLowerCase();
        
        if (!cleanWord) {
          console.warn("Empty word after cleaning:", word);
          return;
        }

        const dict = await this.dictionaryService.getWord(cleanWord);
        // Add to current dictionaries if not already there
        const exists = this.currentDictionaries.some(
          (d) => d.items?.[0]?.entry === dict.items?.[0]?.entry,
        );
        if (!exists) {
          this.currentDictionaries.push(dict);
        }
        this.renderDictionaries();

        // Scroll to the selected word in dictionary section
        this.scrollToDictionaryWord(cleanWord);
      } catch (e) {
        console.error("Failed to load dictionary", e);
      }
    }

    private scrollToDictionaryWord(word: string): void {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        const cleanWord = word.replace(/[,.":!?;]/g, "").toLowerCase();
        const dictionarySection = this.shadowRoot?.querySelector(
          ".dictionary-section",
        ) as HTMLElement;
        
        if (!dictionarySection) return;
        
        const dictEntry = dictionarySection.querySelector(
          `.dict-entry[data-word="${cleanWord}"]`,
        ) as HTMLElement;

        if (dictEntry) {
          // 현재 포커싱된 요소 저장
          const currentFocused = this.shadowRoot?.activeElement as HTMLElement;

          // 수동으로 스크롤 계산 (scrollIntoView 대신 사용)
          const entryRect = dictEntry.getBoundingClientRect();
          const sectionRect = dictionarySection.getBoundingClientRect();
          
          // 섹션 내에서의 상대 위치
          const entryTopRelative = entryRect.top - sectionRect.top + dictionarySection.scrollTop;
          
          // 엔트리를 섹션 맨 위쪽에 위치시키기 (10px 여백)
          const targetScroll = entryTopRelative - 10;
          
          // 스크롤 범위 제한 (0 이상, 최대 스크롤 높이 이하)
          const maxScroll = dictionarySection.scrollHeight - sectionRect.height;
          const clampedScroll = Math.max(0, Math.min(targetScroll, maxScroll));
          
          dictionarySection.scrollTop = clampedScroll;
          
          // 포커싱 복원
          if (currentFocused && currentFocused !== dictionarySection) {
            requestAnimationFrame(() => {
              currentFocused.focus();
            });
          }
        }
      });
    }

    private async loadWordsFromCurrentSubtitle(): Promise<void> {
      if (this.currentActiveIndex < 0) return;

      // Find the English subtitle at currentActiveIndex
      let englishCount = 0;
      let currentEnglishItem = null;
      
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          if (englishCount === this.currentActiveIndex) {
            currentEnglishItem = translation;
            break;
          }
          englishCount++;
        }
      }
      
      if (!currentEnglishItem) return;

      const words = currentEnglishItem.text.split(/\s+/).filter((w) => w.length > 0);

      // Clear previous dictionaries
      this.currentDictionaries = [];

      // Load dictionary for each word
      for (const word of words) {
        const cleanWord = word.replace(/[,.":!?;[\](){}]/g, "").toLowerCase();
        if (cleanWord) {
          try {
            const dict = await this.dictionaryService.getWord(cleanWord);
            this.currentDictionaries.push(dict);
          } catch (e) {
            console.error("Failed to load dictionary for word:", cleanWord, e);
          }
        }
      }

      this.renderDictionaries();
      
      // Dictionary 스크롤을 맨 위로 초기화
      const dictionarySection = this.shadowRoot?.querySelector(
        ".dictionary-section",
      ) as HTMLElement;
      if (dictionarySection) {
        dictionarySection.scrollTop = 0;
        console.log("[loadWordsFromCurrentSubtitle] Dictionary scroll reset to 0");
      }
    }

    @innerHtml(".dictionary-content")
    private renderDictionaries(): string {
      if (!this.currentDictionaries || this.currentDictionaries.length === 0) {
        return '<div class="empty">Select a subtitle to see words</div>';
      }

      return this.currentDictionaries
        .map((dict, dictIndex) => {
          if (!dict.items || dict.items.length === 0) return "";

          const item = dict.items[0];
          return `
          <div class="dict-entry" data-word="${item.entry.toLowerCase()}">
            <div class="dict-word dict-clickable" data-text="${item.entry}" title="Click to hear pronunciation">${item.entry}</div>
            ${
              item.pos && item.pos.length > 0
                ? `
              <div class="dict-pos">
                ${item.pos
                  .map(
                    (pos) => `
                  <div class="pos-section">
                    <div class="pos-type">${pos.type}</div>
                    ${
                      pos.meanings && pos.meanings.length > 0
                        ? `
                      <div class="meanings">
                        ${pos.meanings
                          .slice(0, 1)
                          .map(
                            (meaning, idx) => `
                          <div class="meaning">
                            <div class="meaning-text">${idx + 1}. ${meaning.meaning}</div>
                            ${
                              meaning.examples && meaning.examples.length > 0
                                ? `
                              <div class="examples">
                                ${meaning.examples
                                  .slice(0, 1)
                                  .map(
                                    (ex) => `
                                  <div class="example">
                                    <div class="example-en dict-clickable" data-text="${ex.text}" title="Click to hear example">"${ex.text}"</div>
                                    <div class="example-ko">"${ex.translatedText}"</div>
                                  </div>
                                `,
                                  )
                                  .join("")}
                              </div>
                            `
                                : ""
                            }
                          </div>
                        `,
                          )
                          .join("")}
                      </div>
                    `
                        : ""
                    }
                  </div>
                `,
                  )
                  .join("")}
              </div>
            `
                : ""
            }
          </div>
        `;
        })
        .join("");
    }

    private updateUI(): void {
      console.log("[updateUI] START - currentActiveIndex:", this.currentActiveIndex);
      
      const soundBtn = this.shadowRoot?.querySelector(
        ".btn-sound",
      ) as HTMLElement;
      const koreanBtn = this.shadowRoot?.querySelector(
        ".btn-korean",
      ) as HTMLElement;
      const autoPlayBtn = this.shadowRoot?.querySelector(
        ".btn-auto-play",
      ) as HTMLElement;

      if (soundBtn) soundBtn.classList.toggle("active", this.soundEnabled);
      if (koreanBtn)
        koreanBtn.classList.toggle("active", this.showKoreanTranslation);
      if (autoPlayBtn)
        autoPlayBtn.classList.toggle("active", this.autoPlayEnabled);
      
      console.log("[updateUI] END - currentActiveIndex:", this.currentActiveIndex);
    }

    @addEventListener(".btn-sound", "click")
    onSoundToggle(): void {
      this.soundEnabled = !this.soundEnabled;
      this.updateUI();
    }

    @addEventListener(".btn-korean", "click")
    onKoreanToggle(): void {
      console.log("[onKoreanToggle] BEFORE - currentActiveIndex:", this.currentActiveIndex);
      console.log("[onKoreanToggle] BEFORE - showKoreanTranslation:", this.showKoreanTranslation);
      
      this.showKoreanTranslation = !this.showKoreanTranslation;
      
      console.log("[onKoreanToggle] AFTER - showKoreanTranslation:", this.showKoreanTranslation);
      
      this.filterTranslations();
      
      console.log("[onKoreanToggle] AFTER filterTranslations - currentActiveIndex:", this.currentActiveIndex);
      
      // 한글 토글할 때도 사용자가 수동으로 선택한 것으로 간주
      // 이렇게 하면 비디오 자동 업데이트가 5초 동안 일어나지 않음
      this.userManuallySelected = true;
      this.lastManualSelectionTime = Date.now();
      
      this.updateUI();
    }

    @addEventListener(".btn-auto-play", "click")
    onAutoPlayToggle(): void {
      this.autoPlayEnabled = !this.autoPlayEnabled;
      this.updateUI();
    }

    /**
     * 재생속도 증가 (Shift + >)
     */
    private increasePlaybackRate(): void {
      console.log("[increasePlaybackRate] Called - current rate:", this.playbackRate);
      
      if (!this.youtubePlayer || !this.youtubePlayerReady) {
        console.warn("[increasePlaybackRate] YouTube player not ready");
        return;
      }

      this.playbackRate = Math.min(this.playbackRate + 0.25, 2.0); // 최대 2.0배
      this.youtubePlayer.setPlaybackRate(this.playbackRate);
      console.log("[increasePlaybackRate] Playback rate set to:", this.playbackRate);
      
      // 토스트 메시지 표시 (선택사항)
      this.showPlaybackRateNotification();
    }

    /**
     * 재생속도 감소 (Shift + <)
     */
    private decreasePlaybackRate(): void {
      console.log("[decreasePlaybackRate] Called - current rate:", this.playbackRate);
      
      if (!this.youtubePlayer || !this.youtubePlayerReady) {
        console.warn("[decreasePlaybackRate] YouTube player not ready");
        return;
      }

      this.playbackRate = Math.max(this.playbackRate - 0.25, 0.25); // 최소 0.25배
      this.youtubePlayer.setPlaybackRate(this.playbackRate);
      console.log("[decreasePlaybackRate] Playback rate set to:", this.playbackRate);
      
      // 토스트 메시지 표시 (선택사항)
      this.showPlaybackRateNotification();
    }

    /**
     * 재생속도 변경 알림 표시
     */
    private showPlaybackRateNotification(): void {
      // 기존 알림 제거
      const existingNotification = this.shadowRoot?.querySelector(".playback-rate-notification");
      if (existingNotification) {
        existingNotification.remove();
      }

      // 새 알림 생성
      const notification = document.createElement("div");
      notification.className = "playback-rate-notification";
      notification.textContent = `재생속도: ${this.playbackRate.toFixed(2)}x`;
      notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        z-index: 3000;
        pointer-events: none;
      `;

      this.shadowRoot?.appendChild(notification);

      // 2초 후 제거
      setTimeout(() => {
        notification.remove();
      }, 2000);
    }

    @addEventListener(".btn-prev", "click")
    onPrevCue(): void {
      // Find previous English subtitle (always use allTranslations as reference)
      let newIndex = this.currentActiveIndex - 1;
      
      if (newIndex >= 0) {
        this.currentActiveIndex = newIndex;
        this.currentWordIndex = -1;
        this.renderTranslations();
        this.scrollToActiveItem();
        this.loadWordsFromCurrentSubtitle();

        // Mark as manually selected (keyboard navigation)
        this.userManuallySelected = true;
        this.lastManualSelectionTime = Date.now();

        // Find the English subtitle at this index
        let englishCount = 0;
        for (const translation of this.allTranslations) {
          if (translation.type === "en") {
            if (englishCount === this.currentActiveIndex) {
              if (translation && translation.startMs !== undefined) {
                this.seekYouTubeToTime(translation.startMs);

                // Auto-play if enabled, otherwise pause
                if (this.autoPlayEnabled) {
                  setTimeout(() => {
                    this.playYouTubeVideo();
                  }, 100);
                } else {
                  setTimeout(() => {
                    this.pauseYouTubeVideo();
                  }, 100);
                }
              }
              break;
            }
            englishCount++;
          }
        }
      }
    }

    @addEventListener(".btn-next", "click")
    onNextCue(): void {
      // Find next English subtitle (always use allTranslations as reference)
      let newIndex = this.currentActiveIndex + 1;
      
      // Count total English subtitles
      let englishCount = 0;
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          englishCount++;
        }
      }
      
      if (newIndex < englishCount) {
        this.currentActiveIndex = newIndex;
        this.currentWordIndex = -1;
        this.renderTranslations();
        this.scrollToActiveItem();
        this.loadWordsFromCurrentSubtitle();

        // Mark as manually selected (keyboard navigation)
        this.userManuallySelected = true;
        this.lastManualSelectionTime = Date.now();

        // Find the English subtitle at this index
        let englishIdx = 0;
        for (const translation of this.allTranslations) {
          if (translation.type === "en") {
            if (englishIdx === this.currentActiveIndex) {
              if (translation && translation.startMs !== undefined) {
                this.seekYouTubeToTime(translation.startMs);

                // Auto-play if enabled, otherwise pause
                if (this.autoPlayEnabled) {
                  setTimeout(() => {
                    this.playYouTubeVideo();
                  }, 100);
                } else {
                  setTimeout(() => {
                    this.pauseYouTubeVideo();
                  }, 100);
                }
              }
              break;
            }
            englishIdx++;
          }
        }
      }
    }

    private scrollToActiveItem(): void {
      console.log('vvvvvv');
      const translationsSection = this.shadowRoot?.querySelector(
        ".translations-section",
      ) as HTMLElement;
      
      if (!translationsSection) return;
      
      const activeItem = translationsSection.querySelector(
        ".translation-item.active",
      ) as HTMLElement;
      
      if (activeItem) {
        // 현재 포커싱된 요소 저장
        const currentFocused = this.shadowRoot?.activeElement as HTMLElement;
        
        // Set scroll margin
        activeItem.style.scrollMarginTop = "0px";
        activeItem.style.scrollMarginBottom = "120px";

        // 수동으로 스크롤 계산 (scrollIntoView 대신 사용)
        // scrollIntoView는 포커싱을 변경할 수 있으므로 피함
        
        // activeItem의 컨테이너 내에서의 위치 계산
        const itemRect = activeItem.getBoundingClientRect();
        const containerRect = translationsSection.getBoundingClientRect();
        
        // 컨테이너 내에서의 상대 위치
        const itemTopRelative = itemRect.top - containerRect.top + translationsSection.scrollTop;
        
        // 아이템을 컨테이너 맨 위쪽에 위치시키기 (5px 띄우기)
        const targetScroll = itemTopRelative -50;
        
        // 스크롤 범위 제한 (0 이상, 최대 스크롤 높이 이하)
        const maxScroll = translationsSection.scrollHeight - containerRect.height;
        const clampedScroll = Math.max(0, Math.min(targetScroll, maxScroll));
        
        translationsSection.scrollTop = clampedScroll;
        
        // 포커싱 복원
        if (currentFocused && currentFocused !== translationsSection) {
          requestAnimationFrame(() => {
            currentFocused.focus();
          });
        }
      }
    }

    private highlightSelectedWord(): void {
      const translationsSection = this.shadowRoot?.querySelector(
        ".translations-section",
      ) as HTMLElement;
      
      if (!translationsSection) return;
      
      // Remove previous highlight from all words
      const previousHighlighted =
        translationsSection.querySelectorAll(".word.highlighted");
      if (previousHighlighted) {
        previousHighlighted.forEach((el) => {
          el.classList.remove("highlighted");
        });
      }

      // Add highlight to current word
      if (this.currentActiveIndex >= 0 && this.currentWordIndex >= 0) {
        // Find the English subtitle at currentActiveIndex
        let englishCount = 0;
        let currentEnglishItem = null;
        
        for (const translation of this.allTranslations) {
          if (translation.type === "en") {
            if (englishCount === this.currentActiveIndex) {
              currentEnglishItem = translation;
              break;
            }
            englishCount++;
          }
        }
        
        if (!currentEnglishItem) return;
        
        const words = currentEnglishItem.text.split(/(\s+)/).filter((w) => !/^\s+$/.test(w));

        if (this.currentWordIndex < words.length) {
          // Find the word element by data-item-index and data-word-index
          const wordElement = translationsSection.querySelector(
            `[data-item-index="${this.currentActiveIndex}"][data-word-index="${this.currentWordIndex}"]`,
          );
          if (wordElement) {
            (wordElement as HTMLElement).classList.add("highlighted");
          }
        }
      }
    }

    @addEventListener(".btn-slider-prev", "click")
    onPrevWord(): void {
      if (this.currentActiveIndex < 0) return;

      // Find the English subtitle at currentActiveIndex
      let englishCount = 0;
      let englishItem = null;
      
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          if (englishCount === this.currentActiveIndex) {
            englishItem = translation;
            break;
          }
          englishCount++;
        }
      }

      if (!englishItem) return;

      const words = englishItem.text
        .split(/(\s+)/)
        .filter((w) => !/^\s+$/.test(w));

      if (this.currentWordIndex > 0) {
        this.currentWordIndex--;
        const word = words[this.currentWordIndex]
          .replace(/[,.":!?;]/g, "")
          .toLowerCase();
        this.currentSelectedWord = word;

        if (this.soundEnabled && word) {
          this.voiceService.speakWord(word);
        }
        this.loadDictionaryForWord(word);
        this.highlightSelectedWord();
      } else {
        // 이전 문장으로 이동
        this.onPrevCue();
        
        // 이전 문장의 마지막 단어로 선택
        requestAnimationFrame(() => {
          // Find the English subtitle at new currentActiveIndex
          let englishCount = 0;
          let prevEnglishItem = null;
          
          for (const translation of this.allTranslations) {
            if (translation.type === "en") {
              if (englishCount === this.currentActiveIndex) {
                prevEnglishItem = translation;
                break;
              }
              englishCount++;
            }
          }

          if (prevEnglishItem) {
            const prevWords = prevEnglishItem.text
              .split(/(\s+)/)
              .filter((w) => !/^\s+$/.test(w));
            
            // 마지막 단어로 설정
            this.currentWordIndex = prevWords.length - 1;
            const lastWord = prevWords[this.currentWordIndex]
              .replace(/[,.":!?;]/g, "")
              .toLowerCase();
            this.currentSelectedWord = lastWord;

            if (this.soundEnabled && lastWord) {
              this.voiceService.speakWord(lastWord);
            }
            this.loadDictionaryForWord(lastWord);
            this.highlightSelectedWord();
            
            console.log("[onPrevWord] Moved to previous sentence, selected last word:", lastWord);
          }
        });
      }
    }

    @addEventListener(".btn-slider-next", "click")
    onNextWord(): void {
      if (this.currentActiveIndex < 0) return;

      // Find the English subtitle at currentActiveIndex
      let englishCount = 0;
      let englishItem = null;
      
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          if (englishCount === this.currentActiveIndex) {
            englishItem = translation;
            break;
          }
          englishCount++;
        }
      }

      if (!englishItem) return;

      const words = englishItem.text
        .split(/(\s+)/)
        .filter((w) => !/^\s+$/.test(w));

      if (this.currentWordIndex < words.length - 1) {
        this.currentWordIndex++;

        const word = words[this.currentWordIndex]
          .replace(/[,.":!?;]/g, "")
          .toLowerCase();
        this.currentSelectedWord = word;

        if (this.soundEnabled && word) {
          this.voiceService.speakWord(word);
        }
        this.loadDictionaryForWord(word);
        this.highlightSelectedWord();
      } else {
        // 다음 문장으로 이동
        this.onNextCue();
        
        // 다음 문장의 첫 번째 단어로 선택
        requestAnimationFrame(() => {
          // Find the English subtitle at new currentActiveIndex
          let englishCount = 0;
          let nextEnglishItem = null;
          
          for (const translation of this.allTranslations) {
            if (translation.type === "en") {
              if (englishCount === this.currentActiveIndex) {
                nextEnglishItem = translation;
                break;
              }
              englishCount++;
            }
          }

          if (nextEnglishItem) {
            const nextWords = nextEnglishItem.text
              .split(/(\s+)/)
              .filter((w) => !/^\s+$/.test(w));
            
            // 첫 번째 단어로 설정
            this.currentWordIndex = 0;
            const firstWord = nextWords[this.currentWordIndex]
              .replace(/[,.":!?;]/g, "")
              .toLowerCase();
            this.currentSelectedWord = firstWord;

            if (this.soundEnabled && firstWord) {
              this.voiceService.speakWord(firstWord);
            }
            this.loadDictionaryForWord(firstWord);
            this.highlightSelectedWord();
            
            console.log("[onNextWord] Moved to next sentence, selected first word:", firstWord);
          }
        });
      }
    }

    private jumpToFirstWord(): void {
      if (this.currentActiveIndex < 0) return;

      // Find the English subtitle at currentActiveIndex
      let englishCount = 0;
      let englishItem = null;
      
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          if (englishCount === this.currentActiveIndex) {
            englishItem = translation;
            break;
          }
          englishCount++;
        }
      }

      if (!englishItem) return;

      const words = englishItem.text
        .split(/(\s+)/)
        .filter((w) => !/^\s+$/.test(w));

      if (words.length > 0) {
        this.currentWordIndex = 0;

        const word = words[0]
          .replace(/[,.":!?;]/g, "")
          .toLowerCase();
        this.currentSelectedWord = word;

        if (this.soundEnabled && word) {
          this.voiceService.speakWord(word);
        }
        this.loadDictionaryForWord(word);
        this.highlightSelectedWord();
      }
    }

    private jumpToLastWord(): void {
      if (this.currentActiveIndex < 0) return;

      // Find the English subtitle at currentActiveIndex
      let englishCount = 0;
      let englishItem = null;
      
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          if (englishCount === this.currentActiveIndex) {
            englishItem = translation;
            break;
          }
          englishCount++;
        }
      }

      if (!englishItem) return;

      const words = englishItem.text
        .split(/(\s+)/)
        .filter((w) => !/^\s+$/.test(w));

      if (words.length > 0) {
        this.currentWordIndex = words.length - 1;

        const word = words[this.currentWordIndex]
          .replace(/[,.":!?;]/g, "")
          .toLowerCase();
        this.currentSelectedWord = word;

        if (this.soundEnabled && word) {
          this.voiceService.speakWord(word);
        }
        this.loadDictionaryForWord(word);
        this.highlightSelectedWord();
      }
    }

    @addEventListener(".word", "click", { delegate: true })
    onWordClick(e: Event): void {
      const wordEl = (e.target as HTMLElement).closest(".word") as HTMLElement;
      if (!wordEl) return;

      ClipBoardUtils.writeText(wordEl.innerText, w);
      const word = wordEl.dataset.word || "";
      const wordIndex = parseInt(wordEl.dataset.wordIndex || "-1", 10);
      const itemIndex = parseInt(wordEl.dataset.itemIndex || "-1", 10);

      if (!word) return;

      // Update active item if clicking a word from a different sentence
      if (itemIndex >= 0 && itemIndex !== this.currentActiveIndex) {
        this.currentActiveIndex = itemIndex;
        this.renderTranslations();
        this.loadWordsFromCurrentSubtitle();
      } else if (itemIndex >= 0 && itemIndex === this.currentActiveIndex) {
        // Even if it's the same item, ensure it's marked as active
        this.renderTranslations();
      }

      this.currentWordIndex = wordIndex;
      this.currentSelectedWord = word;

      if (this.soundEnabled) {
        this.voiceService.speakWord(word);
      }

      this.loadDictionaryForWord(word);

      // Use requestAnimationFrame to ensure DOM is updated before highlighting
      requestAnimationFrame(() => {
        this.highlightSelectedWord();
      });
    }

    @addEventListener(".word", "keydown", { delegate: true })
    onWordKeydown(e: KeyboardEvent): void {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.onWordClick(e);
      }
    }

    @addEventListener(".dict-clickable", "click", { delegate: true })
    onDictClickableClick(e: Event): void {
      const element = (e.target as HTMLElement).closest(
        ".dict-clickable",
      ) as HTMLElement;
      if (!element) return;

      const text = element.dataset.text || "";
      if (!text || !this.soundEnabled) return;

      // Speak the text (word or example sentence)
      this.voiceService.speakWord(text);
    }

    @addEventListener(".dict-clickable", "keydown", { delegate: true })
    onDictClickableKeydown(e: KeyboardEvent): void {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.onDictClickableClick(e);
      }
    }

    /**
     * Ollama 분석 버튼 클릭 핸들러
     */
    @addEventListener(".btn-ollama-analyze-inline", "click", {delegate: true})
    async onOllamaAnalyzeClick(): Promise<void> {
      console.log("[onOllamaAnalyzeClick] START - currentActiveIndex:", this.currentActiveIndex);
      console.log("[onOllamaAnalyzeClick] ollamaAvailable:", this.ollamaAvailable);
      
      if (!this.ollamaAvailable) {
        console.log("[onOllamaAnalyzeClick] Ollama not available");
        return;
      }
      
      if (this.currentActiveIndex < 0) {
        alert("Please select a sentence first");
        return;
      }

      // Mark as manually selected to prevent auto-update during Ollama analysis
      this.userManuallySelected = true;
      this.lastManualSelectionTime = Date.now();
      console.log("[onOllamaAnalyzeClick] Set userManuallySelected = true, lastManualSelectionTime:", this.lastManualSelectionTime);

      // Find the English subtitle at currentActiveIndex
      let englishCount = 0;
      let currentEnglishItem = null;
      
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          if (englishCount === this.currentActiveIndex) {
            currentEnglishItem = translation;
            break;
          }
          englishCount++;
        }
      }

      if (!currentEnglishItem) {
        alert("Could not find the selected sentence");
        return;
      }

      const sentence = currentEnglishItem.text;
      console.log("[onOllamaAnalyzeClick] Analyzing sentence:", sentence);
      await this.analyzeWithOllama(sentence);
    }

    /**
     * 'o' 단축키로 Ollama 분석 열기
     */
    private async onOllamaKeyboardShortcut(): Promise<void> {
      console.log("[onOllamaKeyboardShortcut] START - currentActiveIndex:", this.currentActiveIndex);
      console.log("[onOllamaKeyboardShortcut] ollamaAvailable:", this.ollamaAvailable);

      if (!this.ollamaAvailable) {
        console.log("[onOllamaKeyboardShortcut] Ollama not available");
        return;
      }

      if (this.currentActiveIndex < 0) {
        console.log("[onOllamaKeyboardShortcut] No active index, returning");
        return;
      }

      // Mark as manually selected to prevent auto-update during Ollama analysis
      this.userManuallySelected = true;
      this.lastManualSelectionTime = Date.now();
      console.log("[onOllamaKeyboardShortcut] Set userManuallySelected = true, lastManualSelectionTime:", this.lastManualSelectionTime);

      // Find the English subtitle at currentActiveIndex
      let englishCount = 0;
      let currentEnglishItem = null;
      
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          if (englishCount === this.currentActiveIndex) {
            currentEnglishItem = translation;
            break;
          }
          englishCount++;
        }
      }

      if (!currentEnglishItem) {
        console.log("[onOllamaKeyboardShortcut] Could not find English item");
        return;
      }

      const sentence = currentEnglishItem.text;
      console.log("[onOllamaKeyboardShortcut] Analyzing sentence:", sentence);
      await this.analyzeWithOllama(sentence);
    }

    /**
     * Ollama를 사용하여 문장 분석
     */
    private async analyzeWithOllama(sentence: string): Promise<void> {
      console.log("[analyzeWithOllama] START - currentActiveIndex:", this.currentActiveIndex);
      console.log("[analyzeWithOllama] userManuallySelected:", this.userManuallySelected);
      console.log("[analyzeWithOllama] lastManualSelectionTime:", this.lastManualSelectionTime);
      
      if (this.ollamaAnalysisInProgress) {
        console.log("[analyzeWithOllama] Analysis already in progress, returning");
        return;
      }

      this.ollamaAnalysisInProgress = true;
      // this.updateOllamaButtonState();

      try {
        // Ollama 서버 가용성 확인
        const isAvailable = await this.ollamaService.isAvailable();
        if (!isAvailable) {
          console.log("[analyzeWithOllama] Ollama server not available");
          this.showOllamaDialog(
            "❌ Ollama Server Not Available",
            "Ollama server is not running. Please start Ollama at http://localhost:11434"
          );
          return;
        }

        // 분석 요청 (캐시는 OllamaService에서 처리)
        console.log("[analyzeWithOllama] Showing loading dialog");
        this.showOllamaDialog("⏳ Analyzing...", "Please wait while analyzing the sentence...");
        
        const analysis = await this.ollamaService.analyzeSentence(sentence);
        
        console.log("[analyzeWithOllama] Analysis complete, currentActiveIndex:", this.currentActiveIndex);
        // 결과 표시
        this.showOllamaDialog("📚 Analysis Result", this.markdownToHtml(analysis));
      } catch (error) {
        console.error("Ollama analysis failed:", error);
        this.showOllamaDialog(
          "❌ Analysis Failed",
          `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`
        );
      } finally {
        this.ollamaAnalysisInProgress = false;
        console.log("[analyzeWithOllama] END - currentActiveIndex:", this.currentActiveIndex);
        // this.updateOllamaButtonState();
      }
    }

    /**
     * Marked를 사용한 마크다운을 HTML로 변환 (highlight.js 포함)
     */
    private markdownToHtml(markdown: string): string {
      try {
        return marked(markdown) as string;
      } catch (e) {
        console.error("Failed to parse markdown:", e);
        // Fallback: 간단한 HTML 이스케이프
        return `<p>${this.escapeHtml(markdown)}</p>`;
      }
    }

    /**
     * HTML 특수문자 이스케이프
     */
    private escapeHtml(text: string): string {
      const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, (char) => map[char]);
    }

    /**
     * Ollama 분석 다이얼로그 표시
     */
    private showOllamaDialog(title: string, content: string): void {
      console.log("[showOllamaDialog] START - currentActiveIndex:", this.currentActiveIndex);
      console.log("[showOllamaDialog] ollamaDialogOpen:", this.ollamaDialogOpen);
      
      // 기존 다이얼로그 제거
      const existingDialog = this.shadowRoot?.querySelector(".ollama-dialog-overlay");
      if (existingDialog) {
        console.log("[showOllamaDialog] Removing existing dialog");
        existingDialog.remove();
      }

      const translationsSection = this.shadowRoot?.querySelector(".translations-section") as HTMLElement;

      // Dialog가 처음 열릴 때만 상태 저장 (이미 열려있으면 저장하지 않음)
      if (!this.ollamaDialogOpen) {
        console.log("[showOllamaDialog] First time opening dialog, saving state");
        if (translationsSection) {
          this.ollamaDialogScrollPosition = translationsSection.scrollTop;
          console.log("[showOllamaDialog] Saved scrollPosition:", this.ollamaDialogScrollPosition);
        }
        this.ollamaDialogActiveIndex = this.currentActiveIndex;
        console.log("[showOllamaDialog] Saved activeIndex:", this.ollamaDialogActiveIndex);
        // renderTranslations() 호출하지 않음 - 현재 상태 유지
      } else {
        console.log("[showOllamaDialog] Dialog already open, not saving state again");
      }

      const overlay = document.createElement("div");
      overlay.className = "ollama-dialog-overlay";
      overlay.innerHTML = `
        <div class="ollama-dialog">
          <div class="ollama-dialog-header">
            <h2 class="ollama-dialog-title">${this.escapeHtml(title)}</h2>
            <button class="ollama-dialog-close" aria-label="Close dialog">✕</button>
          </div>
          <div class="ollama-dialog-content">
            ${content}
          </div>
          <div class="ollama-dialog-footer">
            <button class="ollama-dialog-button">Close</button>
          </div>
        </div>
      `;

      const closeBtn = overlay.querySelector(".ollama-dialog-close") as HTMLElement;
      const footerBtn = overlay.querySelector(".ollama-dialog-button") as HTMLElement;

      const closeDialog = () => {
        console.log("[closeDialog] START - currentActiveIndex before restore:", this.currentActiveIndex);
        console.log("[closeDialog] ollamaDialogActiveIndex:", this.ollamaDialogActiveIndex);
        
        overlay.remove();
        this.ollamaDialogOpen = false;
        
        // 상태 복원: 저장된 영어 기준 인덱스 복원
        this.currentActiveIndex = this.ollamaDialogActiveIndex;
        console.log("[closeDialog] Restored currentActiveIndex to:", this.currentActiveIndex);
        
        // Mark as manually selected to prevent auto-update after dialog closes
        this.userManuallySelected = true;
        this.lastManualSelectionTime = Date.now();
        console.log("[closeDialog] Set userManuallySelected = true");
        
        // 현재 선택된 문장을 명확하게 유지하기 위해 renderTranslations 호출
        console.log("[closeDialog] Calling renderTranslations");
        this.renderTranslations();
        
        // 스크롤 위치 복원 및 선택된 항목 중앙 정렬
        if (translationsSection) {
          requestAnimationFrame(() => {
            console.log("[closeDialog] requestAnimationFrame - calling scrollToActiveItem");
            // scrollToActiveItem을 호출하여 선택된 항목을 중앙에 정렬
            this.scrollToActiveItem();
          });
        }
        
        console.log("[closeDialog] END - currentActiveIndex:", this.currentActiveIndex);
        // ESC 키 이벤트 리스너 제거
        w.document.removeEventListener("keydown", handleEscKey);
      };

      const handleEscKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeDialog();
        }
      };

      closeBtn?.addEventListener("click", closeDialog);
      footerBtn?.addEventListener("click", closeDialog);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          closeDialog();
        }
      });

      // ESC 키 이벤트 리스너 추가
      w.document.addEventListener("keydown", handleEscKey);

      this.shadowRoot?.appendChild(overlay);
      this.ollamaDialogOpen = true;
      console.log("[showOllamaDialog] END - Dialog opened");
    }

    /**
     * Ollama 버튼 상태 업데이트
     */
    private updateOllamaButtonState(): void {
      const btn = this.shadowRoot?.querySelector(".btn-ollama-analyze-inline") as HTMLButtonElement;
      if (btn) {
        if (this.ollamaAnalysisInProgress) {
          btn.disabled = true;
          btn.style.opacity = "0.6";
        } else {
          btn.disabled = false;
          btn.style.opacity = "1";
        }
      }
    }

    @addEventListener(".translation-item", "click", { delegate: true })
    onTranslationItemClick(e: Event): void {
      console.log('vvvvvvvvvvv');
      // 실제 click 이벤트만 처리 (마우스 클릭)
      // KeyboardEvent는 처리하지 않음
      if (!(e instanceof MouseEvent)) {
        return;
      }

      const item = (e.target as HTMLElement).closest(
        ".translation-item",
      ) as HTMLElement;
      if (!item) return;

      // data-en-index로 영어 인덱스 가져오기
      const enIndex = parseInt(item.dataset.enIndex || "-1", 10);
      
      console.log("[onTranslationItemClick] enIndex from data-en-index:", enIndex);
      
      // 영어 항목만 처리 (data-en-index가 유효한 경우)
      if (enIndex < 0) {
        return;
      }

      ClipBoardUtils.writeText(item.innerText, w);
      this.currentWordIndex = -1;
      this.currentActiveIndex = enIndex;
      
      console.log("[onTranslationItemClick] SET currentActiveIndex to:", this.currentActiveIndex);
      
      this.renderTranslations();

      // Mark as manually selected
      this.userManuallySelected = true;
      this.lastManualSelectionTime = Date.now();

      // Load all words from this subtitle
      this.loadWordsFromCurrentSubtitle();

      // Find the translation with this English index
      let englishCount = 0;
      for (const translation of this.allTranslations) {
        if (translation.type === "en") {
          if (englishCount === enIndex) {
            if (translation && translation.startMs !== undefined) {
              this.seekYouTubeToTime(translation.startMs);
              
              // Auto-play if enabled, otherwise pause
              if (this.autoPlayEnabled) {
                setTimeout(() => {
                  this.playYouTubeVideo();
                }, 100);
              } else {
                setTimeout(() => {
                  this.pauseYouTubeVideo();
                }, 100);
              }
            }
            break;
          }
          englishCount++;
        }
      }
    }

    @addEventListener(".translation-item", "keydown", { delegate: true })
    onTranslationItemKeydown(e: KeyboardEvent): void {
      // Enter 또는 Space 키만 처리
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        // 수동으로 click 로직 실행
        const item = (e.target as HTMLElement).closest(
          ".translation-item",
        ) as HTMLElement;
        if (!item) return;

        // data-en-index로 영어 인덱스 가져오기
        const enIndex = parseInt(item.dataset.enIndex || "-1", 10);
        
        // 영어 항목만 처리 (data-en-index가 유효한 경우)
        if (enIndex < 0) {
          return;
        }

        ClipBoardUtils.writeText(item.innerText, w);
        this.currentWordIndex = -1;
        this.currentActiveIndex = enIndex;
        this.renderTranslations();

        // Mark as manually selected
        this.userManuallySelected = true;
        this.lastManualSelectionTime = Date.now();

        // Load all words from this subtitle
        this.loadWordsFromCurrentSubtitle();

        // Find the translation with this English index
        let englishCount = 0;
        for (const translation of this.allTranslations) {
          if (translation.type === "en") {
            if (englishCount === enIndex) {
              if (translation && translation.startMs !== undefined) {
                this.seekYouTubeToTime(translation.startMs);
                
                // Auto-play if enabled, otherwise pause
                if (this.autoPlayEnabled) {
                  setTimeout(() => {
                    this.playYouTubeVideo();
                  }, 100);
                } else {
                  setTimeout(() => {
                    this.pauseYouTubeVideo();
                  }, 100);
                }
              }
              break;
            }
            englishCount++;
          }
        }
      }
    }

    @onConnectedShadow
    render() {
      return `
        <style>
          @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
          @import url('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css');
          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          :host {
            display: block;
            min-height: 100vh;
            background: var(--color-bg, #fff);
            font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
            --color-primary: #1976d2;
            --color-text: #222;
            --color-text-muted: #888;
            --color-border: #e0e0e0;
            --color-highlight: #ffeb3b;
            --color-hidden: #ffecb3;
          }

          .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
          }

          .header {
            display: flex;
            gap: 8px;
            padding: 12px 16px;
            background: #f7f7f7;
            border-bottom: 1px solid var(--color-border);
            flex-wrap: wrap;
            align-items: center;
          }

          .header-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--color-text);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .btn {
            padding: 6px 10px;
            border: 1px solid var(--color-border);
            background: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            color: var(--color-text);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 4px;
            outline: none;
          }

          .btn:hover {
            background: #f0f0f0;
            border-color: var(--color-primary);
          }

          .btn:focus-visible {
            box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.3);
          }

          .btn.active {
            background: var(--color-primary);
            color: white;
            border-color: var(--color-primary);
          }

          .btn-slider-prev,
          .btn-slider-next {
            padding: 6px 10px;
            border: 1px solid var(--color-border);
            background: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            color: var(--color-text);
            transition: all 0.2s ease;
            outline: none;
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .btn-slider-prev:hover,
          .btn-slider-next:hover {
            background: #f0f0f0;
            border-color: var(--color-primary);
          }

          .btn-slider-prev:focus-visible,
          .btn-slider-next:focus-visible {
            box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.3);
          }

          .content {
            display: flex;
            flex: 1;
            overflow: hidden;
            gap: 0;
          }

          @media (min-width: 769px) {
            .content {
              flex-direction: row;
            }

            .dictionary-section {
              width: 30%;
              border-right: 1px solid var(--color-border);
              overflow-y: auto;
            }

            .scripts-section {
              width: 70%;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }

            .youtube-container {
              height: 40%;
              border-bottom: 1px solid var(--color-border);
              overflow: hidden;
            }

            .translations-section {
              height: 60%;
              overflow-y: auto;
            }
     
          }

          @media (max-width: 768px) {
            .content {
              flex-direction: column;
            }

            .dictionary-section {
              height: 30%;
              border-bottom: 1px solid var(--color-border);
              border-right: none;
              overflow-y: auto;
            }

            .scripts-section {
              height: 70%;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }

            .youtube-container {
              height: 35%;
              border-bottom: 1px solid var(--color-border);
              overflow: hidden;
            }

            .translations-section {
              height: 65%;
              overflow-y: auto;
            }
          }

          .dictionary-content {
            padding: 16px;
          }

          .dict-entry {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .dict-word {
            font-size: 18px;
            font-weight: 700;
            color: var(--color-primary);
          }

          .dict-clickable {
            cursor: pointer;
            transition: all 0.2s ease;
            padding: 2px 4px;
            border-radius: 3px;
            outline: none;
          }

          .dict-clickable:hover {
            background: rgba(25, 118, 210, 0.1);
            text-decoration: underline;
          }

          .dict-clickable:focus-visible {
            box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3);
          }

          .dict-pos {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .pos-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .pos-type {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .meanings {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .meaning {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .meaning-text {
            font-size: 13px;
            color: var(--color-text);
            line-height: 1.5;
          }

          .examples {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-left: 12px;
            padding-left: 8px;
            border-left: 2px solid var(--color-border);
          }

          .example {
            font-size: 12px;
            line-height: 1.4;
          }

          .example-en {
            color: var(--color-text);
            font-style: italic;
            margin-bottom: 2px;
          }

          .example-ko {
            color: var(--color-text-muted);
            font-size: 11px;
          }

          .translations-list {
            display: flex;
            flex-direction: column;
            gap: 0;
          }

          .translation-item {
            padding: 12px 16px;
            border-bottom: 1px solid var(--color-border);
            cursor: pointer;
            transition: background 0.2s ease;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 1px;
          }

          .translation-item:hover {
            background: #f9f9f9;
          }

          .translation-item.active {
            background: #e3f2fd;
            border-left: 4px solid var(--color-primary);
            padding-left: 12px;
          }

          .translation-item-actions {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
          }

          .btn-ollama-analyze {
            padding: 4px 8px;
            border: 1px solid var(--color-border);
            background: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            color: var(--color-text);
            transition: all 0.2s ease;
            outline: none;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
          }

          .btn-ollama-analyze:hover:not(:disabled) {
            background: #f0f0f0;
            border-color: var(--color-primary);
          }

          .btn-ollama-analyze:focus-visible {
            box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3);
          }

          .btn-ollama-analyze:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          /* Inline Ollama button */
          .btn-ollama-analyze-inline {
            background: none;
            border: none;
            padding: 4px 4px;
            margin: 0;
            cursor: pointer;
            font-size: 16px;
            color: var(--color-primary);
            transition: all 0.2s ease;
            outline: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            font-weight: 600;
            border-radius: 4px;
            /*min-width: 32px;*/
            /*height: 32px;*/
          }

          .btn-ollama-analyze-inline:hover:not(:disabled) {
            background: rgba(25, 118, 210, 0.1);
            transform: scale(1.1);
          }

          .btn-ollama-analyze-inline:focus-visible {
            box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3);
          }

          .btn-ollama-analyze-inline:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          /* Ollama Dialog Styles */
          .ollama-dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: 16px;
          }

          .ollama-dialog {
            background: white;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            display: flex;
            flex-direction: column;
            max-width: 800px;
            max-height: 600px;
            width: 100%;
            overflow: hidden;
          }

          .ollama-dialog-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px;
            border-bottom: 1px solid var(--color-border);
            flex-shrink: 0;
          }

          .ollama-dialog-title {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--color-text);
          }

          .ollama-dialog-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--color-text-muted);
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s ease;
            outline: none;
          }

          .ollama-dialog-close:hover {
            background: #f0f0f0;
            color: var(--color-text);
          }

          .ollama-dialog-close:focus-visible {
            box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3);
          }

          .ollama-dialog-content {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            font-size: 14px;
            line-height: 1.6;
            color: var(--color-text);
          }

          .ollama-dialog-content p {
            margin: 0 0 12px 0;
          }

          .ollama-dialog-content h1,
          .ollama-dialog-content h2,
          .ollama-dialog-content h3,
          .ollama-dialog-content h4,
          .ollama-dialog-content h5,
          .ollama-dialog-content h6 {
            margin-top: 16px;
            margin-bottom: 8px;
            color: var(--color-primary);
            font-weight: 600;
          }

          .ollama-dialog-content h1 {
            font-size: 20px;
          }

          .ollama-dialog-content h2 {
            font-size: 18px;
          }

          .ollama-dialog-content h3 {
            font-size: 16px;
          }

          .ollama-dialog-content ul,
          .ollama-dialog-content ol {
            margin: 8px 0;
            padding-left: 24px;
          }

          .ollama-dialog-content li {
            margin: 4px 0;
          }

          .ollama-dialog-content code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #d63384;
          }

          .ollama-dialog-content pre {
            background: #f5f5f5;
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
            border-left: 4px solid var(--color-primary);
          }

          .ollama-dialog-content pre code {
            background: none;
            padding: 0;
            color: inherit;
            font-family: 'Courier New', monospace;
            font-size: 12px;
          }

          /* Highlight.js styles */
          .ollama-dialog-content .hljs {
            background: #f5f5f5;
            color: #333;
          }

          .ollama-dialog-content .hljs-string {
            color: #d63384;
          }

          .ollama-dialog-content .hljs-number {
            color: #0d6efd;
          }

          .ollama-dialog-content .hljs-literal {
            color: #0d6efd;
          }

          .ollama-dialog-content .hljs-attr {
            color: #0d6efd;
          }

          .ollama-dialog-content .hljs-title {
            color: #0d6efd;
          }

          .ollama-dialog-content blockquote {
            border-left: 4px solid var(--color-border);
            padding-left: 12px;
            margin: 8px 0;
            color: var(--color-text-muted);
            font-style: italic;
          }

          .ollama-dialog-content strong {
            font-weight: 600;
            color: var(--color-text);
          }

          .ollama-dialog-content em {
            font-style: italic;
          }

          .ollama-dialog-content a {
            color: var(--color-primary);
            text-decoration: none;
          }

          .ollama-dialog-content a:hover {
            text-decoration: underline;
          }

          .ollama-dialog-content table {
            border-collapse: collapse;
            width: 100%;
            margin: 8px 0;
          }

          .ollama-dialog-content th,
          .ollama-dialog-content td {
            border: 1px solid var(--color-border);
            padding: 8px;
            text-align: left;
          }

          .ollama-dialog-content th {
            background: #f5f5f5;
            font-weight: 600;
          }

          .ollama-dialog-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            flex-shrink: 0;
          }

          .ollama-dialog-button {
            padding: 8px 16px;
            border: 1px solid var(--color-border);
            background: var(--color-primary);
            color: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            outline: none;
          }

          .ollama-dialog-button:hover {
            background: #1565c0;
            border-color: #1565c0;
          }

          .ollama-dialog-button:focus-visible {
            box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.3);
          }

          .translation-text {
            font-size: 14px;
            line-height: 1.6;
            color: var(--color-text);
            word-break: break-word;
            flex: 1;
          }

          .translation-text.ko {
            font-size: 13px;
            color: var(--color-text-muted);
          }

          .word {
            cursor: pointer;
            position: relative;
            padding: 2px 0;
            border-bottom: 1px dotted var(--color-primary);
            transition: all 0.2s ease;
            outline: none;
            display: inline;
          }

          .word:hover {
            background: rgba(25, 118, 210, 0.1);
            border-bottom-style: solid;
          }

          .word:focus-visible {
            box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3);
            border-radius: 2px;
          }

          .word.highlighted {
            background: #ffeb3b;
            color: #333;
            font-weight: 600;
            padding: 2px 4px;
            border-radius: 3px;
            border-bottom: none;
            box-shadow: 0 2px 4px rgba(255, 235, 59, 0.4);
          }

          .word.hidden {
            background: var(--color-hidden);
            border-bottom: none;
            border-radius: 3px;
            padding: 2px 4px;
            font-weight: 600;
            color: #ff9800;
          }

          .empty {
            padding: 24px 16px;
            text-align: center;
            color: var(--color-text-muted);
            font-size: 13px;
          }

          .floating-controller {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            border: 1px solid var(--color-border);
            border-radius: 8px;
            padding: 8px 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: center;
            gap: 6px;
            z-index: 1000;
            max-width: 90%;
          }

          @media (max-width: 480px) {
            .header {
              padding: 8px 12px;
              gap: 6px;
            }

            .btn {
              padding: 6px 10px;
              font-size: 12px;
            }

            .btn span {
              display: inline;
            }

            .btn::after {
              content: attr(data-label);
              display: none;
            }

            /* Hide button text on mobile, show only icons */
            .btn-sound::after,
            .btn-korean::after,
            .btn-auto-play::after,
            .btn-prev::after,
            .btn-next::after {
              display: none;
            }

            .btn-sound,
            .btn-korean,
            .btn-auto-play,
            .btn-prev,
            .btn-next {
              padding: 6px 8px;
              font-size: 0;
            }

            .btn-sound span,
            .btn-korean span,
            .btn-auto-play span,
            .btn-prev span,
            .btn-next span {
              font-size: 13px;
            }

            /* Hide btn-slider text on mobile, show only icons */
            .btn-slider-prev,
            .btn-slider-next {
              padding: 3px 8px;
              font-size: 0;
            }

            .btn-slider-prev span,
            .btn-slider-next span {
              font-size: 14px;
            }

            .floating-controller {
              bottom: 10px;
              left: 5px;
              right: 5px;
              transform: none;
              max-width: none;
              flex-wrap: wrap;
              gap: 2px;
            }

            .dictionary-content {
              padding: 12px;
            }

            .translation-item {
              padding: 10px 12px;
            }

            .translation-text {
              font-size: 13px;
            }
            .btn {
              gap:0;
            }
          }
        </style>

        <div class="container">
          <div class="header">
            <div class="header-title">${this.videoItem?.name || "Loading..."}</div> <img alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io.svg?style=plastic&amp;">
          </div>

          <div class="content">
            <div class="dictionary-section">
              <div class="dictionary-content">
                <div class="empty">Select a word to see its definition</div>
              </div>
            </div>

            <div class="scripts-section">
              <div class="youtube-container"></div>
              <div class="translations-section">
                <div class="translations-list">
                  <div class="empty">Loading translations...</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="floating-controller">
          <button class="btn btn-sound" title="Toggle text-to-speech (M)">
            <span>🔊</span> Sound
          </button>
          <button class="btn btn-korean" title="Toggle Korean translation (T)">
            <span>🇰🇷</span> Korean
          </button>
          <button class="btn btn-auto-play" title="Enable auto-play mode (A)">
            <span>▶️</span>AutoPlay</button>
          
          <div style="flex: 1;"></div>
          
          <button class="btn btn-prev" title="Previous sentence (↑ Arrow)">
            <span>⬆️</span> Prev
          </button>
          <button class="btn-slider-prev" title="Previous word (← Arrow)">
            <span>◀</span>
          </button>
          <button class="btn-slider-next" title="Next word (→ Arrow)">
            <span>▶</span>
          </button>
          <button class="btn btn-next" title="Next sentence (↓ Arrow)">
            <span>⬇️</span> Next
          </button>
        </div>
      `;
    }
  }

  return tagName;
};


/**
 네, 유튜브 IFrame Player API에서는
 재생이 “시작”됐을 때 받을 수 있는 이벤트 리스너가 공식적으로 지원됩니다!
 ---
 정답:
 onStateChange 이벤트를 이용하면 됩니다.
 예시
 player.addEventListener('onStateChange', (event) => {
 if (event.data === 1) { // 1 === PLAYING
 // 재생이 시작됨!
 }
 });
 혹은,
 function onPlayerStateChange(event) {
 if (event.data === YT.PlayerState.PLAYING) {
 // 재생 시작 이벤트
 }
 }
 플레이어 생성 시 옵션에:
 new YT.Player("...", {
 events: {
 'onStateChange': onPlayerStateChange
 }
 })
 ---
 ## 상태값 상수
 - `YT.PlayerState.PLAYING` 혹은 숫자 `1` : 재생 시작
 - `YT.PlayerState.PAUSED` 혹은 숫자 `2` : 일시정지
 - 기타 ENDED(-0), BUFFERING(3), 등
 ---
 코드에 쉽게 연결하는 법
 이미 player 객체(this.youtubePlayer)가 있다면,
 - 보통 initYouTube 함수 안에서 Player 생성할 때
 onStateChange에 콜백(메서드)를 연결합니다.
 ---
 요약
 - 유튜브 영상이 재생이 시작됐을 때 이벤트를 받으려면
 onStateChange 이벤트를 등록 → (event.data === 1)일 때 실행
 - 이벤트 등록 방법은 "플레이어 생성 시 events에 넣거나, addEventListener('onStateChange', ...)" 형태
 ---
 예제 (TypeScript&현재 프로젝트 맞춤)
 const onYouTubePlayerStateChange = (event: any) => {
 if (event.data === 1) {
 // 재생 시작됨!
 }
 };
 this.youtubePlayer.addEventListener('onStateChange', onYouTubePlayerStateChange);
 // 또는 players 생성 시 events: { 'onStateChange': ... }
 ---
 궁금한 점이 더 있다면 추가로 설명드릴 수 있습니다!
 (코드에 이벤트 등록 필요하면 바로 반영해드릴 수 있습니다.)
 */