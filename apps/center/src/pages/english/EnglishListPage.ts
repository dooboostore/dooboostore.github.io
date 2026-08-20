import {
  elementDefine,
  onConnectedBodyShadow,
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

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          :host {
            display: block;
            min-height: 100vh;
            background: #f0f2f5;
            font-family: var(--font-family, sans-serif);
          }

          .header {
            display: flex; align-items: center; gap: 12px;
            padding: 16px 24px;
            background: linear-gradient(135deg, #1565c0 0%, #1976d2 60%, #42a5f5 100%);
            color: white;
          }
          .header-back {
            background: rgba(255,255,255,0.2); border: none; color: white;
            width: 40px; height: 40px; border-radius: 8px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-size: 20px;
          }
          .header-back:hover { background: rgba(255,255,255,0.3); }
          .header-title { font-size: 22px; font-weight: 700; flex: 1; }
          .header-hits { height: 20px; border-radius: 4px; opacity: 0.9; margin-left: auto; }
          .content { padding: 20px; max-width: 1200px; margin: 0 auto; }

          .video-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 20px;
          }

          .video-card {
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            background: #fff;
            border: 1px solid #e0e0e0;
            outline: none;
          }

          .video-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(25,118,210,0.15);
            border-color: #1976d2;
          }

          .video-card:focus-visible {
            box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.3);
          }

          .video-card:hover .video-title {
            color: #1976d2;
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
            color: #222;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            border-top: 1px solid #eee;
            transition: color 0.2s;
            word-break: break-word;
          }

          .empty {
            grid-column: 1 / -1;
            text-align: center;
            padding: 60px;
            color: #888;
          }

          .copyright {
            text-align: center; padding: 24px 16px; color: #aaa; font-size: 13px;
            border-top: 1px solid #eee; margin-top: 24px;
          }

          @media (max-width: 600px) {
            .header { padding: 14px 16px; }
            .header-title { font-size: 18px; }
            .content { padding: 12px; }
            .video-grid {
              grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
              gap: 12px;
            }
          }
        </style>

        <div class="header">
          <button class="header-back" aria-label="Go home" title="홈으로">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
          </button>
          <div>
            <div class="header-title">🎬 English Learning</div>
          </div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-english.svg?style=plastic&amp;"/>
        </div>

        <main class="content">
          <div class="video-grid">
            <div class="empty">Loading...</div>
          </div>
        </main>

        <footer class="copyright">
          © ${new Date().getFullYear()} dooboostore
        </footer>
      `;
    }

    @addEventListener('.header-back', 'click')
    onBackClick() {
      this.router?.go('/');
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
