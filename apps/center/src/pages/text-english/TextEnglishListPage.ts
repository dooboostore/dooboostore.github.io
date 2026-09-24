import {
  elementDefine,
  onConnectedBodyShadow,
  onConnectedAfter,
  event,
  eventDelegate,
  innerHtml,
  onConnectedBefore,
  attribute
} from "@dooboostore/simple-web-component";
import { Inject } from '@dooboostore/simple-boot';
import { Router } from '@dooboostore/core-web';
import { type VideoItem, VideoItemService, type VideoItemServiceType } from '../../services/english/VideoItemService';

const tagName = 'center-text-english-list-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class TextEnglishListPage extends w.HTMLElement {
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
        titleBody: "Text English | @dooboostore",
        ogTitle: "Text English | @dooboostore",
        desc: "PDF·텍스트로 영어를 읽으며 배워보세요. 단어 툴팁, 발음 듣기까지.",
        ogDesc: "PDF·텍스트로 영어를 읽으며 배워보세요. 단어 툴팁, 발음 듣기까지.",
        ogImage: "/assets/images/text-english-og.png",
        twitterImage: "/assets/images/text-english-og.png",
        twitterTitle: "Text English | @dooboostore",
        twitterDesc: "PDF·텍스트로 영어를 읽으며 배워보세요. 단어 툴팁, 발음 듣기까지.",
      };
    }

    private router!: Router;
    private items: VideoItem[] = [];

    @onConnectedAfter
    async onInit(
      @Inject(VideoItemService.SYMBOL) videoItemService: VideoItemServiceType,
      router: Router,
    ) {
      this.router = router;
      try {
        const all = await videoItemService.items();
        this.items = all.filter(item => item.type === 'text');
        this.renderItems(this.items);
      } catch (e) {
        console.error("Failed to load text items", e);
      }
    }

    @innerHtml(".video-grid")
    renderItems(items: VideoItem[]) {
      if (!items.length) {
        return `<div class="empty">텍스트 목록을 불러오는 중...</div>`;
      }
      return items
        .map(
          (item) => `
        <div class="video-card" data-name="${encodeURIComponent(item.name)}" role="button" tabindex="0" aria-label="${item.name}">
          <div class="video-thumb text">
            <img src="${item.img || "/assets/dooboostore.png"}" alt="${item.name}" loading="lazy" onerror="this.onerror=null;this.src='/assets/dooboostore.png'">
          </div>
          <h3 class="video-title">${item.name}</h3>
        </div>
      `,
        )
        .join("");
    }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
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
            background: linear-gradient(135deg, #0d47a1 0%, #1976d2 60%, #42a5f5 100%);
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
            background: #faf8f2;
          }

          .video-thumb.text { padding-bottom: 56.25%; }

          .video-thumb img {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
          }

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
            <div class="header-title">📖 Text English</div>
          </div>
          <img class="header-hits" alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io-apps-center-text-english.svg?style=plastic&amp;"/>
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

    @event('.header-back', 'click')
    onBackClick() {
      this.router?.go('/');
    }

    @eventDelegate(".video-card", 'click')
    onCardClick(e: Event) {
      const card = (e.target as HTMLElement).closest(
        ".video-card",
      ) as HTMLElement;
      const name = card?.dataset.name;
      if (name) {
        this.router.go(`/text-english/${name}`);
      }
    }

    @eventDelegate(".video-card", 'keydown')
    onCardKeydown(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const card = (e.target as HTMLElement).closest(
          ".video-card",
        ) as HTMLElement;
        const name = card?.dataset.name;
        if (name) this.router.go(`/text-english/${name}`);
      }
    }
  }

  return tagName;
};
