import {
  elementDefine,
  onConnectedShadow,
  addEventListener, onInitialize
} from "@dooboostore/simple-web-component";
import { Router } from '@dooboostore/core-web';

const tagName = 'center-home-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  const apps = [
    {
      id: 'english',
      icon: '🎬',
      title: 'English Learning',
      description: 'YouTube 영상으로 영어를 배워보세요. 자막, 사전, 발음 연습까지.',
      path: '/english',
      color: '#ff0000',
      badge: 'Popular'
    },
    {
      id: 'stock-flight',
      icon: '✈️',
      title: 'Stock Flight',
      description: '주식 데이터를 비행기 계기판처럼 시각화하여 한눈에 파악하세요.',
      path: '/stock-flight',
      color: '#2196f3',
      badge: 'New'
    },
    {
      id: 'coordinate-simulation',
      icon: '📐',
      title: '2D Coordinate Simulation',
      description: '2D 좌표계를 시각화하고 FPS를 조절하며 시뮬레이션해보세요.',
      path: '/coordinate-simulation',
      color: '#9c27b0',
      badge: ''
    }
  ];

  @elementDefine(tagName, { window: w })
  class HomePage extends w.HTMLElement {
    private router!: Router;

    @onInitialize
    onInitialized(router: Router): void {
      this.router = router;
    }

    @onConnectedShadow
    render() {
      const cardHtml = apps.map(app => `
        <div class="app-card" data-path="${app.path}" role="button" tabindex="0" aria-label="${app.title}">
          ${app.badge ? `<span class="badge">${app.badge}</span>` : ''}
          <div class="card-icon" style="background: ${app.color}20; color: ${app.color}">
            ${app.icon}
          </div>
          <div class="card-body">
            <h3 class="card-title">${app.title}</h3>
            <p class="card-desc">${app.description}</p>
          </div>
          <div class="card-arrow">
            <i class="fas fa-arrow-right"></i>
          </div>
        </div>
      `).join('');

      return `
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          :host {
            display: block;
            min-height: 100vh;
            background: var(--color-bg, #fff);
            font-family: var(--font-family, -apple-system, sans-serif);
            color: var(--color-text, #222);
          }

          .hero {
            background: linear-gradient(135deg, #0d47a1 0%, #1976d2 50%, #42a5f5 100%);
            color: white;
            padding: 80px 40px 60px;
            text-align: center;
          }

          .hero-logo {
            width: 72px;
            height: 72px;
            border-radius: 20px;
            margin: 0 auto 24px;
            overflow: hidden;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          }

          .hero-logo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .hero h1 {
            font-size: 42px;
            font-weight: 850;
            letter-spacing: -1.5px;
            margin-bottom: 16px;
            line-height: 1.1;
          }

          .hero p {
            font-size: 18px;
            opacity: 0.85;
            max-width: 560px;
            margin: 0 auto;
            line-height: 1.6;
          }

          .main {
            max-width: 960px;
            margin: 0 auto;
            padding: 60px 24px 80px;
          }

          .section-title {
            font-size: 22px;
            font-weight: 700;
            color: var(--color-text, #222);
            margin-bottom: 28px;
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .section-title::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--color-border, #e0e0e0);
          }

          .apps-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
          }

          .app-card {
            position: relative;
            background: var(--color-surface, #fff);
            border: 1px solid var(--color-border, #e0e0e0);
            border-radius: 16px;
            padding: 24px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 16px;
            outline: none;
          }

          .app-card:hover {
            border-color: var(--color-primary, #1976d2);
            box-shadow: 0 8px 24px rgba(25, 118, 210, 0.12);
            transform: translateY(-2px);
          }

          .app-card:focus-visible {
            border-color: var(--color-primary, #1976d2);
            box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.2);
          }

          .badge {
            position: absolute;
            top: 12px;
            right: 12px;
            background: var(--color-secondary, #ff385c);
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 999px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .card-icon {
            width: 56px;
            height: 56px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            flex-shrink: 0;
          }

          .card-body {
            flex: 1;
            min-width: 0;
          }

          .card-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--color-text, #222);
            margin-bottom: 6px;
          }

          .card-desc {
            font-size: 13px;
            color: var(--color-text-muted, #888);
            line-height: 1.5;
          }

          .card-arrow {
            color: var(--color-text-light, #aaa);
            font-size: 14px;
            flex-shrink: 0;
            transition: transform 0.2s ease, color 0.2s ease;
          }

          .app-card:hover .card-arrow {
            color: var(--color-primary, #1976d2);
            transform: translateX(4px);
          }

          .coming-soon {
            text-align: center;
            padding: 48px 24px;
            color: var(--color-text-muted, #888);
            border: 2px dashed var(--color-border, #e0e0e0);
            border-radius: 16px;
            margin-top: 20px;
          }

          .coming-soon .icon { font-size: 40px; margin-bottom: 12px; }
          .coming-soon p { font-size: 15px; }

          footer {
            text-align: center;
            padding: 32px 24px;
            border-top: 1px solid var(--color-border, #e0e0e0);
            color: var(--color-text-muted, #888);
            font-size: 13px;
          }

          @media (max-width: 600px) {
            .hero { padding: 60px 20px 40px; }
            .hero h1 { font-size: 28px; }
            .hero p { font-size: 15px; }
            .main { padding: 40px 16px 60px; }
            .apps-grid { grid-template-columns: 1fr; }
          }
        </style>

        <div class="hero">
          <div class="hero-logo">
            <img src="/assets/dooboostore.png" alt="dooboostore logo">
          </div>
          <h1>dooboostore</h1>
          <p>다양한 미니 앱들을 한 곳에서 만나보세요.</p>
          <div><img alt="Hits" src="https://hits.sh/hits.sh/dooboostore.github.io.svg?style=plastic&amp;"></div>
        </div>

        <main class="main">
          <h2 class="section-title">Apps</h2>
          <div class="apps-grid">
            ${cardHtml}
          </div>
          <div class="coming-soon">
            <div class="icon">🚀</div>
            <p>더 많은 앱들이 곧 추가될 예정입니다.</p>
          </div>
        </main>

        <footer>
          © 2025 dooboostore · Built with @dooboostore/simple-web-component
        </footer>
      `;
    }

    @addEventListener('.app-card', 'click', { delegate: true })
    onCardClick(e: Event) {
      const card = (e.target as HTMLElement).closest('.app-card') as HTMLElement;
      if (card?.dataset.path) {
        this.router?.go(card.dataset.path);
        // window.location.href = card.dataset.path;
      }
    }

    @addEventListener('.app-card', 'keydown', { delegate: true })
    onCardKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const card = (e.target as HTMLElement).closest('.app-card') as HTMLElement;
        if (card?.dataset.path) {
          this.router?.go(card.dataset.path);
          // window.location.href = card.dataset.path;
        }
      }
    }
  }

  return tagName;
};
