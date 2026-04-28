import {
  elementDefine,
  onConnectedShadow,
  onConnectedAfter,
  addEventListener,
  innerHtml, event
} from "@dooboostore/simple-web-component";
import { Inject } from '@dooboostore/simple-boot';
import { Router } from '@dooboostore/core-web';
import { type VideoItem, VideoItemService, type VideoItemServiceType } from '../../services/english/VideoItemService';

const tagName = 'center-english-list-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class EnglishListPage extends w.HTMLElement {
    private router!: Router;
    private items: VideoItem[] = [];

    @onConnectedAfter
    async onInit(
      @Inject(VideoItemService.SYMBOL) videoItemService: VideoItemServiceType,
      router: Router,
    ) {
      this.router = router;
      try {
        this.items = await videoItemService.items();
        this.renderItems(this.items);
      } catch (e) {
        console.error("Failed to load items", e);
      }
    }

    @innerHtml(".video-grid")
    renderItems(items: VideoItem[]) {
      if (!items.length) {
        return `<div class="empty">영상 목록을 불러오는 중...</div>`;
      }
      return items
        .map(
          (item) => `
        <div class="video-card" data-name="${encodeURIComponent(item.name)}" role="button" tabindex="0" aria-label="${item.name}">
          <div class="video-thumb ${item.type === "youtube" ? "youtube" : "movie"}">
            <img src="${item.img}" alt="${item.name}" loading="lazy">
            ${
              item.link
                ? `
              <a class="ext-link" href="${item.link}" target="_blank" rel="noopener noreferrer" aria-label="외부 링크">
                <i class="fa-solid fa-link"></i>
              </a>
            `
                : ""
            }
          </div>
          <h3 class="video-title">${item.name}</h3>
        </div>
      `,
        )
        .join("");
    }

    @event("#lazy-btn", "click")
    async onLazyBtnClick () {
      const {TestComponent, default: factory} = await import('../../components/TestComponent');
      console.log("Lazy button clicked!", TestComponent, factory);
      await factory(w);
    }

    @onConnectedShadow
    render() {
      return `
        <style>
          @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          :host {
            display: block;
            min-height: 100vh;
            background: var(--color-bg, #fff);
            font-family: var(--font-family, -apple-system, sans-serif);
          }

          .video-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 20px;
            padding: 24px;
          }

          .video-card {
            border-radius: 10px;
            overflow: hidden;
            box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.08));
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            background: var(--color-surface, #fff);
            border: 1px solid var(--color-border, #e0e0e0);
            outline: none;
          }

          .video-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.12));
          }

          .video-card:focus-visible {
            box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.3);
          }

          .video-card:hover .video-title {
            color: var(--color-primary, #1976d2);
          }

          .video-thumb {
            position: relative;
            width: 100%;
            overflow: hidden;
          }

          .video-thumb.youtube { padding-bottom: 56.25%; }
          .video-thumb.movie { padding-bottom: 150%; }

          .video-thumb img {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
          }

          .ext-link {
            position: absolute;
            top: 8px; right: 8px;
            width: 30px; height: 30px;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 13px;
            transition: background 0.2s;
            z-index: 2;
          }

          .ext-link:hover { background: rgba(255,255,255,0.35); }

          .video-title {
            padding: 10px 8px;
            font-size: 13px;
            font-weight: 600;
            color: var(--color-text, #222);
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            border-top: 1px solid var(--color-border-light, #eee);
            transition: color 0.2s;
            word-break: break-word;
          }

          .empty {
            grid-column: 1 / -1;
            text-align: center;
            padding: 60px;
            color: var(--color-text-muted, #888);
          }

          @media (max-width: 480px) {
            .video-grid {
              grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
              gap: 12px;
              padding: 16px;
            }
          }
        </style>
<!--        <button id="lazy-btn">lazy-btn loading</button>-->
<!--        <test-component> </test-component>-->

        <h1 style="position: sticky; top:0; background-color: white; z-index: 999; padding: 5px">English <img alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io.svg?style=plastic&amp;"></h1>
        <div class="video-grid">
          <div class="empty">Loading...</div>
        </div>
      `;
    }

    @addEventListener(".video-card", "click", { delegate: true })
    onCardClick(e: Event) {
      const card = (e.target as HTMLElement).closest(
        ".video-card",
      ) as HTMLElement;
      const name = card?.dataset.name;
      if (name) {
        // ext-link 클릭은 무시
        if ((e.target as HTMLElement).closest(".ext-link")) return;
        this.router.go(`/english/${name}`);
      }
    }

    @addEventListener(".video-card", "keydown", { delegate: true })
    onCardKeydown(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const card = (e.target as HTMLElement).closest(
          ".video-card",
        ) as HTMLElement;
        const name = card?.dataset.name;
        if (name) this.router.go(`/english/${name}`);
      }
    }
  }

  return tagName;
};
