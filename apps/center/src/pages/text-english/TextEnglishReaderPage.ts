import {
  elementDefine,
  onConnectedBodyShadow,
  onConnectedAfter,
  onInitialize,
  onDisconnected,
  event,
  eventDelegate,
  innerHtml,
  onConnectedBefore,
  attribute
} from "@dooboostore/simple-web-component";
import { Router } from '@dooboostore/core-web';
import { Inject } from '@dooboostore/simple-boot';
import { type VideoItem, VideoItemService, type VideoItemServiceType } from '../../services/english/VideoItemService';
import { TextTranslationService, type TextTranslationServiceType, type TextTranslationEntry } from '../../services/english/TextTranslationService';
import { DictionaryService, type DictionaryServiceType } from '../../services/english/DictionaryService';
import { VoiceService, type VoiceServiceType } from '../../services/english/VoiceService';

const tagName = 'center-text-english-reader-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class TextEnglishReaderPage extends w.HTMLElement {
    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector("title"), { valueKey: "titleBody" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), "content", { valueKey: "ogTitle" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), "content", { valueKey: "desc" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), "content", { valueKey: "ogDesc" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:image"]'), "content", { valueKey: "ogImage" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:image"]'), "content", { valueKey: "twitterImage" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:title"]'), "content", { valueKey: "twitterTitle" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="twitter:description"]'), "content", { valueKey: "twitterDesc" })
    setPageMeta() {
      return {
        titleBody: "Text Reader | @dooboostore",
        ogTitle: "Text Reader | @dooboostore",
        desc: "텍스트를 읽으며 영어를 배우세요. 단어 클릭으로 툴팁 사전·발음 듣기.",
        ogDesc: "텍스트를 읽으며 영어를 배우세요. 단어 클릭으로 툴팁 사전·발음 듣기.",
        ogImage: "/assets/images/text-english-og.png",
        twitterImage: "/assets/images/text-english-og.png",
        twitterTitle: "Text Reader | @dooboostore",
        twitterDesc: "텍스트를 읽으며 영어를 배우세요. 단어 클릭으로 툴팁 사전·발음 듣기.",
      };
    }

    private router!: Router;
    private docName: string = "";
    private entries: TextTranslationEntry[] = [];
    private currentActiveIndex: number = -1;
    private currentWordIndex: number = -1;
    private currentSelectedWord: string = "";

    private soundEnabled: boolean = true;
    private showKorean: boolean = false;

    private videoItemService!: VideoItemServiceType;
    private textTranslationService!: TextTranslationServiceType;
    private dictionaryService!: DictionaryServiceType;
    private voiceService!: VoiceServiceType;

    @onInitialize
    onInit(
      @Inject(VideoItemService.SYMBOL) videoItemService: VideoItemServiceType,
      @Inject(TextTranslationService.SYMBOL) textTranslationService: TextTranslationServiceType,
      @Inject(DictionaryService.SYMBOL) dictionaryService: DictionaryServiceType,
      @Inject(VoiceService.SYMBOL) voiceService: VoiceServiceType,
    ) {
      this.videoItemService = videoItemService;
      this.textTranslationService = textTranslationService;
      this.dictionaryService = dictionaryService;
      this.voiceService = voiceService;
    }

    @onConnectedAfter
    async onConnectedAfter(router: Router) {
      this.router = router;
      const name = this.getAttribute("name");
      if (!name) {
        console.error("No document name provided");
        return;
      }
      this.docName = decodeURIComponent(name);
      try {
        const headerTitle = this.shadowRoot?.querySelector(".header-title") as HTMLElement;
        if (headerTitle) headerTitle.textContent = `📖 ${this.docName}`;
        this.entries = await this.textTranslationService.entries(this.docName);
        if (this.entries.length > 0) {
          this.currentActiveIndex = 0;
        }
        this.renderSentences();
        this.updateToolbar();
        this.setupKeyboardListeners();
        this.scrollToActiveItem(false);
      } catch (e) {
        console.error("Failed to load text", e);
        this.renderSentences();
      }
    }

    @onDisconnected
    onDisconnected(): void {
      this.removeKeyboardListeners();
      this.voiceService?.stopSpeech();
      this.closePopup();
    }

    private setupKeyboardListeners(): void {
      const handleKeydown = (e: KeyboardEvent) => {
        // 팝업 안의 입력/포커스에서는 전역 단축키 무시 (단 Esc는 닫기)
        const inPopup = (e.target as HTMLElement)?.closest?.(".word-popup");
        if (e.key === "Escape") {
          this.closePopup();
          return;
        }
        if (inPopup) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.goSentence(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.goSentence(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          this.onNextWord();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.onPrevWord();
        } else if (e.key === "Enter") {
          e.preventDefault();
          this.speakActiveSentence();
        } else if (e.key === " " && (e.target === w.document.body || (e.target as HTMLElement)?.closest?.(".reading-toolbar"))) {
          e.preventDefault();
          this.speakActiveSentence();
        } else if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          this.onKoreanToggle();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          this.onSoundToggle();
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

    private escapeHtml(text: string): string {
      const map: { [key: string]: string } = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, (char) => map[char]);
    }

    private renderSentenceWords(text: string, itemIndex: number): string {
      const words = text.split(/(\s+)/);
      let nonWhitespaceIndex = 0;
      return words
        .map((word) => {
          if (/^\s+$/.test(word)) return word;
          const cleanWord = word.replace(/[,.":!?;()]/g, "").toLowerCase();
          const idx = nonWhitespaceIndex;
          nonWhitespaceIndex++;
          if (!cleanWord) return this.escapeHtml(word);
          return `<span class="word" data-word="${cleanWord}" data-item-index="${itemIndex}" data-word-index="${idx}" role="button" tabindex="0" aria-label="${cleanWord} 뜻 보기">${this.escapeHtml(word)}</span>`;
        })
        .join("");
    }

    @innerHtml(".reading")
    private renderSentences(): string {
      if (!this.entries.length) {
        return '<div class="empty">본문을 불러오는 중...</div>';
      }
      return this.entries
        .map((entry, idx) => `
          <div class="sentence${idx === this.currentActiveIndex ? " active" : ""}" data-index="${idx}" tabindex="-1">
            <p class="en">${this.renderSentenceWords(entry.en, idx)}</p>
            ${this.showKorean && entry.ko ? `<p class="ko">${this.escapeHtml(entry.ko)}</p>` : ""}
          </div>
        `)
        .join("");
    }

    private updateToolbar(): void {
      const root = this.shadowRoot;
      if (!root) return;
      const progress = root.querySelector(".progress") as HTMLElement;
      if (progress) {
        progress.textContent = this.entries.length
          ? `${this.currentActiveIndex + 1} / ${this.entries.length}`
          : "0 / 0";
      }
      const koBtn = root.querySelector(".btn-korean") as HTMLElement;
      if (koBtn) koBtn.classList.toggle("active", this.showKorean);
      const soundBtn = root.querySelector(".btn-sound") as HTMLElement;
      if (soundBtn) soundBtn.classList.toggle("active", this.soundEnabled);
    }

    private goSentence(delta: number): void {
      if (!this.entries.length) return;
      const next = Math.min(
        this.entries.length - 1,
        Math.max(0, this.currentActiveIndex + delta),
      );
      if (next === this.currentActiveIndex) return;
      const prev = this.currentActiveIndex;
      this.currentActiveIndex = next;
      this.currentWordIndex = -1;
      this.currentSelectedWord = "";
      this.closePopup();
      // 전체 리렌더 금지 (1443문장 innerHTML이 느림) — active 클래스만 교체
      this.updateActiveSentence(prev, next);
      this.updateToolbar();
      this.scrollToActiveItem(false);
    }

    /** 전체 리렌더 없이 active 문장만 교체 */
    private updateActiveSentence(prevIdx: number, nextIdx: number): void {
      const root = this.shadowRoot;
      if (!root) return;
      if (prevIdx >= 0) {
        root.querySelector(`.sentence[data-index="${prevIdx}"]`)?.classList.remove("active");
      }
      if (nextIdx >= 0) {
        root.querySelector(`.sentence[data-index="${nextIdx}"]`)?.classList.add("active");
      }
    }

    /** 문장의 단어 토큰 (공백 제외, 순서대로) */
    private sentenceWords(itemIndex: number): string[] {
      const entry = this.entries[itemIndex];
      if (!entry) return [];
      return entry.en.split(/(\s+)/).filter((part) => !/^\s+$/.test(part));
    }

    private cleanToken(token: string): string {
      return token.replace(/[,.":!?;()]/g, "").toLowerCase();
    }

    /** 단어 선택의 단일 진입점 — 클릭/키보드/이전다음 모두 여기로 */
    private activateWord(itemIndex: number, wordIndex: number): void {
      const tokens = this.sentenceWords(itemIndex);
      if (wordIndex < 0 || wordIndex >= tokens.length) return;
      const word = this.cleanToken(tokens[wordIndex]);
      if (!word) return;
      const sentenceChanged = itemIndex !== this.currentActiveIndex;
      const prevIndex = this.currentActiveIndex;
      this.currentActiveIndex = itemIndex;
      this.currentWordIndex = wordIndex;
      this.currentSelectedWord = word;
      if (sentenceChanged) {
        this.updateActiveSentence(prevIndex, itemIndex);
        this.updateToolbar();
        this.scrollToActiveItem(false);
      } else {
        this.highlightSelectedWord();
      }
      if (this.soundEnabled) {
        this.voiceService.speakWord(word);
      }
      const wordEl = this.shadowRoot?.querySelector(
        `.word[data-item-index="${itemIndex}"][data-word-index="${wordIndex}"]`,
      ) as HTMLElement;
      if (wordEl) {
        const popup = this.openPopupLoading(wordEl, word);
        if (popup) this.fillPopup(popup, wordEl, word);
      }
    }

    private highlightSelectedWord(): void {
      const root = this.shadowRoot;
      if (!root) return;
      root.querySelectorAll(".word.selected").forEach((el) => {
        if (!el.closest(".word-popup")) el.classList.remove("selected");
      });
      if (this.currentActiveIndex >= 0 && this.currentWordIndex >= 0) {
        const wordEl = root.querySelector(
          `.reading .word[data-item-index="${this.currentActiveIndex}"][data-word-index="${this.currentWordIndex}"]`,
        ) as HTMLElement;
        if (wordEl) wordEl.classList.add("selected");
      }
    }

    private onPrevWord(): void {
      if (this.currentActiveIndex < 0) {
        if (this.entries.length) this.activateWord(0, 0);
        return;
      }
      if (this.currentWordIndex > 0) {
        this.activateWord(this.currentActiveIndex, this.currentWordIndex - 1);
        return;
      }
      // 현재 문장 첫 단어 → 이전 문장 마지막 단어 (EnglishPlayer와 동일)
      if (this.currentActiveIndex > 0) {
        const prevTokens = this.sentenceWords(this.currentActiveIndex - 1);
        // 뒤에서부터 발음 가능한 단어 찾기
        for (let i = prevTokens.length - 1; i >= 0; i--) {
          if (this.cleanToken(prevTokens[i])) {
            this.activateWord(this.currentActiveIndex - 1, i);
            return;
          }
        }
        this.goSentence(-1);
      }
    }

    private onNextWord(): void {
      if (this.currentActiveIndex < 0) {
        if (this.entries.length) this.activateWord(0, 0);
        return;
      }
      const tokens = this.sentenceWords(this.currentActiveIndex);
      if (this.currentWordIndex < tokens.length - 1) {
        for (let i = this.currentWordIndex + 1; i < tokens.length; i++) {
          if (this.cleanToken(tokens[i])) {
            this.activateWord(this.currentActiveIndex, i);
            return;
          }
        }
      }
      // 현재 문장 마지막 단어 → 다음 문장 첫 단어 (EnglishPlayer와 동일)
      if (this.currentActiveIndex < this.entries.length - 1) {
        const nextTokens = this.sentenceWords(this.currentActiveIndex + 1);
        for (let i = 0; i < nextTokens.length; i++) {
          if (this.cleanToken(nextTokens[i])) {
            this.activateWord(this.currentActiveIndex + 1, i);
            return;
          }
        }
        this.goSentence(1);
      }
    }

    private clearWordSelection(): void {
      this.currentWordIndex = -1;
      this.currentSelectedWord = "";
      this.highlightSelectedWord();
    }

    private scrollToActiveItem(smooth: boolean): void {
      const active = this.shadowRoot?.querySelector(".sentence.active") as HTMLElement;
      if (!active) return;
      // 포커스를 옮기고 window 스크롤을 따라가게 (안쪽 스크롤 컨테이너 없음)
      active.focus({ preventScroll: true });
      const top = active.getBoundingClientRect().top + w.scrollY - 80;
      w.scrollTo({
        top: Math.max(0, top),
        behavior: smooth ? "smooth" : "auto",
      });
    }

    private speakActiveSentence(): void {
      if (this.currentActiveIndex < 0 || !this.entries[this.currentActiveIndex]) return;
      if (!this.soundEnabled) return;
      this.voiceService.speakScript(this.entries[this.currentActiveIndex].en);
    }

    // ── 단어 툴팁 팝업 ──

    private closePopup(): void {
      const popup = this.shadowRoot?.querySelector(".word-popup");
      if (popup) popup.remove();
      const highlighted = this.shadowRoot?.querySelectorAll(".word.selected");
      highlighted?.forEach((el) => el.classList.remove("selected"));
    }

    private openPopupLoading(wordEl: HTMLElement, word: string): HTMLElement | null {
      const reading = this.shadowRoot?.querySelector(".reading") as HTMLElement;
      if (!reading) return null;
      this.closePopup();
      wordEl.classList.add("selected");

      const popup = w.document.createElement("div");
      popup.className = "word-popup";
      popup.innerHTML = `
        <div class="popup-head">
          <strong class="popup-word">${this.escapeHtml(word)}</strong>
          <div class="popup-head-btns">
            <button class="popup-speak" aria-label="발음 듣기" title="발음 듣기">🔊</button>
            <button class="popup-close" aria-label="닫기" title="닫기">✕</button>
          </div>
        </div>
        <div class="popup-body"><div class="popup-loading">사전 불러오는 중...</div></div>
      `;

      // 클릭한 단어 근처에 배치 (.reading 기준, window 스크롤이 메인이라 rect 차이로 계산)
      popup.style.visibility = "hidden";
      reading.appendChild(popup);
      this.positionPopup(popup, wordEl, reading);
      popup.style.visibility = "visible";
      return popup;
    }

    /** 팝업 위치 계산 — 콘텐츠가 채워져 높이가 바뀔 때마다 다시 호출 */
    private positionPopup(popup: HTMLElement, wordEl: HTMLElement, reading: HTMLElement): void {
      const wordRect = wordEl.getBoundingClientRect();
      const readingRect = reading.getBoundingClientRect();
      const popupWidth = Math.min(300, readingRect.width - 16);
      const popupHeight = popup.offsetHeight || 120;
      let left = wordRect.left - readingRect.left - 20;
      left = Math.max(8, Math.min(left, readingRect.width - popupWidth - 8));
      let top: number;
      if (wordRect.bottom + popupHeight + 8 > w.innerHeight) {
        // 아래가 잘리면 단어 위로
        top = wordRect.top - readingRect.top - popupHeight - 8;
      } else {
        top = wordRect.bottom - readingRect.top + 8;
      }
      popup.style.left = `${left}px`;
      popup.style.top = `${Math.max(8, top)}px`;
    }

    private fillPopup(popup: HTMLElement, wordEl: HTMLElement, word: string): void {
      const body = popup.querySelector(".popup-body") as HTMLElement;
      if (!body) return;
      // 사전 내용이 채워지면 팝업 높이가 바뀌므로 위치 재계산
      const reposition = () => {
        const reading = this.shadowRoot?.querySelector(".reading") as HTMLElement;
        if (reading && popup.isConnected) this.positionPopup(popup, wordEl, reading);
      };
      this.dictionaryService.getWord(word).then((dict) => {
        if (!popup.isConnected) return;
        if (!dict.items || dict.items.length === 0) {
          body.innerHTML = `<div class="popup-empty">사전에 없는 단어예요.</div>`;
        } else {
          const item = dict.items[0];
          const phonetic = item.phoneticSigns?.map((p: any) => p.sign).filter(Boolean).join(" · ") ?? "";
          const posHtml = (item.pos ?? [])
            .slice(0, 3)
            .map((pos: any) => {
              const meanings = (pos.meanings ?? []).slice(0, 2).map((m: any) => {
                const ex = (m.examples ?? [])[0];
                return `<div class="meaning">• ${this.escapeHtml(m.meaning ?? "")}${
                  ex ? `<div class="example-en">“${this.escapeHtml(ex.text ?? "")}”</div>
                        <div class="example-ko">${this.escapeHtml(ex.translatedText ?? "")}</div>` : ""
                }</div>`;
              }).join("");
              return `<div class="pos-block"><div class="pos-type">${this.escapeHtml(pos.type ?? "")}</div>${meanings}</div>`;
            })
            .join("");
          body.innerHTML = `
            ${phonetic ? `<div class="phonetic">[${this.escapeHtml(phonetic)}]</div>` : ""}
            ${posHtml || '<div class="popup-empty">뜻을 찾지 못했어요.</div>'}
          `;
        }
        reposition();
      }).catch(() => {
        if (popup.isConnected) {
          body.innerHTML = `<div class="popup-empty">사전을 불러오지 못했어요.</div>`;
          reposition();
        }
      });
    }

    @eventDelegate(".word", 'click')
    onWordClick(e: Event): void {
      const wordEl = (e.target as HTMLElement).closest(".word") as HTMLElement;
      if (!wordEl) return;
      e.stopPropagation();
      const word = wordEl.dataset.word || "";
      if (!word) return;
      if (this.soundEnabled) {
        this.voiceService.speakWord(word);
      }
      const popup = this.openPopupLoading(wordEl, word);
      if (popup) this.fillPopup(popup, wordEl, word);
    }

    @eventDelegate(".word", 'keydown')
    onWordKeydown(e: KeyboardEvent): void {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.onWordClick(e);
      }
    }

    @eventDelegate(".popup-close", 'click')
    onPopupClose(): void {
      this.closePopup();
    }

    @eventDelegate(".popup-speak", 'click')
    onPopupSpeak(e: Event): void {
      const popup = (e.target as HTMLElement).closest(".word-popup") as HTMLElement;
      const word = popup?.querySelector(".popup-word")?.textContent || "";
      if (word) this.voiceService.speakWord(word);
    }

    @eventDelegate(".sentence", 'click')
    onSentenceClick(e: Event): void {
      // 단어 클릭은 위 핸들러가 처리 (stopPropagation 되지만 delegate 순서 보장용으로 재확인)
      if ((e.target as HTMLElement).closest(".word")) return;
      if ((e.target as HTMLElement).closest(".word-popup")) return;
      const block = (e.target as HTMLElement).closest(".sentence") as HTMLElement;
      if (!block) return;
      const idx = parseInt(block.dataset.index || "-1", 10);
      if (idx >= 0 && idx !== this.currentActiveIndex) {
        const prev = this.currentActiveIndex;
        this.currentActiveIndex = idx;
        this.currentWordIndex = -1;
        this.currentSelectedWord = "";
        this.updateActiveSentence(prev, idx);
        this.updateToolbar();
      }
      this.speakActiveSentence();
    }

    @event(".reading", "click", { delegate: false })
    onReadingClick(e: Event): void {
      // 팝업 바깥(여백) 클릭이면 닫기
      if ((e.target as HTMLElement).closest(".word-popup")) return;
      if ((e.target as HTMLElement).closest(".word")) return;
      if ((e.target as HTMLElement).closest(".sentence")) return;
      this.closePopup();
    }

    @event(".toolbar-back", "click")
    onBackClick() {
      this.router?.go('/text-english');
    }

    @event(".btn-korean", "click")
    onKoreanToggle(): void {
      this.showKorean = !this.showKorean;
      this.closePopup();
      this.renderSentences();
      this.updateToolbar();
      this.scrollToActiveItem(false);
    }

    @event(".btn-sound", "click")
    onSoundToggle(): void {
      this.soundEnabled = !this.soundEnabled;
      if (!this.soundEnabled) this.voiceService.stopSpeech();
      this.updateToolbar();
    }

    @event(".btn-prev", "click")
    onPrevClick(): void {
      this.goSentence(-1);
    }

    @event(".btn-next", "click")
    onNextClick(): void {
      this.goSentence(1);
    }

    @event(".btn-word-prev", "click")
    onPrevWordClick(): void {
      this.onPrevWord();
    }

    @event(".btn-word-next", "click")
    onNextWordClick(): void {
      this.onNextWord();
    }

    @event(".btn-speak", "click")
    onSpeakClick(): void {
      this.speakActiveSentence();
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          :host {
            display: block;
            min-height: 100vh;
            background: #faf8f2;
            font-family: Georgia, 'Noto Serif KR', serif;
            color: #2b2b2b;
          }

          .toolbar {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 16px;
            background: linear-gradient(135deg, #0d47a1 0%, #1976d2 60%, #42a5f5 100%);
            color: white;
          }
          .toolbar-back {
            background: rgba(255,255,255,0.2); border: none; color: white;
            width: 36px; height: 36px; border-radius: 8px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-size: 18px;
            flex-shrink: 0;
          }
          .toolbar-back:hover { background: rgba(255,255,255,0.3); }
          .toolbar-title {
            font-size: 16px; font-weight: 700; flex: 1; min-width: 0;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            font-family: var(--font-family, sans-serif);
          }
          .progress {
            font-size: 12px; opacity: 0.9; white-space: nowrap;
            font-family: var(--font-family, sans-serif);
          }
          .tool-btn {
            background: rgba(255,255,255,0.2); border: none; color: white;
            min-width: 36px; height: 36px; border-radius: 8px; cursor: pointer;
            font-size: 15px; padding: 0 8px;
            display: flex; align-items: center; justify-content: center; gap: 4px;
            font-family: var(--font-family, sans-serif);
          }
          .tool-btn:hover { background: rgba(255,255,255,0.3); }
          .tool-btn.active { background: #ffca28; color: #4e342e; }
          .reading-wrap {
            padding: 28px 20px 120px;
          }

          .reading {
            position: relative;
            background: #fffdf7;
            border: 1px solid #e8e0d0;
            border-radius: 12px;
            padding: 28px 30px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.05);
          }

          .sentence {
            padding: 10px 12px;
            border-radius: 8px;
            cursor: pointer;
            border-left: 3px solid transparent;
            outline: none;
            /* 화면 밖 문장은 레이아웃/페인트 스킵 — 1443문장 스크롤 최적화 */
            content-visibility: auto;
            contain-intrinsic-size: auto 140px;
          }
          .sentence:hover { background: #f7f2e7; }
          .sentence.active {
            background: #fff8e1;
            border-left-color: #ffca28;
          }
          .sentence .en {
            font-size: 17px;
            line-height: 2.0;
            overflow-wrap: break-word;
            word-break: break-word;
          }
          .sentence .ko {
            font-size: 14px;
            line-height: 1.8;
            color: #6d6d6d;
            margin-top: 6px;
            font-family: var(--font-family, sans-serif);
            overflow-wrap: break-word;
            word-break: break-word;
          }

          .word {
            border-radius: 4px;
            padding: 1px 1px;
            cursor: pointer;
            outline: none;
          }
          .word:hover { background: #ffe082; }
          .word:focus-visible { background: #ffe082; box-shadow: 0 0 0 2px #1976d2; }
          .word.selected { background: #ffca28; }

          .empty { text-align: center; padding: 60px; color: #888; font-family: var(--font-family, sans-serif); }

          /* 단어 툴팁 팝업 */
          .word-popup {
            position: absolute;
            z-index: 100;
            width: 300px;
            max-width: calc(100% - 16px);
            background: #fff;
            border: 1px solid #d7ccc8;
            border-radius: 12px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.22);
            overflow: hidden;
            font-family: var(--font-family, sans-serif);
          }
          .popup-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 12px;
            background: #4e342e;
            color: #fff;
          }
          .popup-word { font-size: 16px; word-break: break-word; }
          .popup-head-btns { display: flex; gap: 4px; }
          .popup-speak, .popup-close {
            background: rgba(255,255,255,0.15); border: none; color: #fff;
            width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 13px;
          }
          .popup-speak:hover, .popup-close:hover { background: rgba(255,255,255,0.3); }
          .popup-body {
            padding: 12px;
            max-height: 260px;
            overflow-y: auto;
            font-size: 13px;
            line-height: 1.6;
          }
          .popup-loading, .popup-empty { color: #999; text-align: center; padding: 12px; }
          .phonetic { color: #8d6e63; margin-bottom: 8px; }
          .pos-block { margin-bottom: 8px; }
          .pos-type {
            display: inline-block;
            font-size: 11px; font-weight: 700;
            background: #efebe9; color: #5d4037;
            padding: 1px 8px; border-radius: 999px; margin-bottom: 4px;
          }
          .meaning { margin-bottom: 4px; word-break: break-word; }
          .example-en { color: #444; margin-top: 2px; }
          .example-ko { color: #999; }

          .bottom-nav {
            position: fixed;
            bottom: 0; left: 0; right: 0;
            z-index: 60;
            display: flex; align-items: center; justify-content: center; gap: 10px;
            padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
            background: rgba(255,253,247,0.96);
            border-top: 1px solid #e8e0d0;
            font-family: var(--font-family, sans-serif);
          }
          .nav-btn {
            background: #1976d2; border: none; color: white;
            padding: 10px 18px; border-radius: 10px; cursor: pointer; font-size: 14px;
          }
          .nav-btn:hover { background: #1565c0; }
          .nav-btn.speak { background: #4e342e; }
          .nav-btn.speak:hover { background: #3e2723; }
          .nav-btn.toggle { background: #fff; color: #4e342e; border: 1px solid #d7ccc8; }
          .nav-btn.toggle:hover { background: #efebe9; }
          .nav-btn.toggle.active { background: #ffca28; border-color: #ffca28; color: #4e342e; }
          .nav-btn.word-nav { background: #fff; color: #1976d2; border: 1px solid #90caf9; padding: 10px 12px; }
          .nav-btn.word-nav:hover { background: #e3f2fd; }
          .nav-hint { font-size: 11px; color: #aaa; }

          @media (max-width: 600px) {
            .reading-wrap { padding: 12px 8px 120px; }
            .reading { padding: 16px 14px; }
            .sentence .en { font-size: 16px; }
            .toolbar-title { font-size: 14px; }
            .nav-hint { display: none; }
          }
        </style>

        <div class="toolbar">
          <button class="toolbar-back" aria-label="목록으로" title="목록으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <div class="toolbar-title">📖 Text English</div>
          <div class="progress">0 / 0</div>
        </div>

        <main class="reading-wrap">
          <div class="reading">
            <div class="empty">본문을 불러오는 중...</div>
          </div>
        </main>

        <nav class="bottom-nav">
          <button class="nav-btn toggle btn-korean" title="한글 보기 토글 (T)">🇰🇷</button>
          <button class="nav-btn toggle btn-sound active" title="소리 토글 (M)">🔊</button>
          <button class="nav-btn btn-prev" title="이전 문장 (↑)">←</button>
          <button class="nav-btn word-nav btn-word-prev" title="이전 단어 (←)">◀</button>
          <button class="nav-btn speak btn-speak" title="문장 듣기 (Enter)">🎙️</button>
          <button class="nav-btn word-nav btn-word-next" title="다음 단어 (→)">▶</button>
          <button class="nav-btn btn-next" title="다음 문장 (↓)">→</button>
          <span class="nav-hint">←→ 단어 · ↑↓ 문장 · Enter 듣기 · T 한글 · Esc 닫기</span>
        </nav>
      `;
    }
  }

  return tagName;
};
