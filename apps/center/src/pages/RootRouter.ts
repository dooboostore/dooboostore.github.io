import {
  elementDefine,
  onConnectedBodyShadow,
  onConnectedBefore,
  subscribeSwcAppRouteChange,
  innerHtmlLight,
  innerHtml,
  attribute,
  replaceChildren,
  addEventListener,
  event,
  skipIfExists,
} from '@dooboostore/simple-web-component';
import { Router, type RouterEventType } from '@dooboostore/core-web';

const tagName = 'center-root-router';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RootRouter extends w.HTMLElement {
    private router!: Router;

    @subscribeSwcAppRouteChange({ order: -1 })
    onRouteChange(routerPathSet: RouterEventType) {
      console.log("[Route Change]", routerPathSet.path);
    }

    @subscribeSwcAppRouteChange(["", "/"], { order: 0 })
    @innerHtmlLight
    handleHome() {
      return `<center-home-page/>`;
    }

    @subscribeSwcAppRouteChange(["/english"], { order: 1 })
    @innerHtmlLight
    handleEnglishList() {
      return `<center-english-list-page/>`;
    }

    @subscribeSwcAppRouteChange(['/english/{name}'], { order: 2 })
    @innerHtmlLight
    handleEnglishPlayer(routerPathSet: RouterEventType) {
      return `<center-english-player-page name="${routerPathSet.pathData.name}"/>`;
    }

    @subscribeSwcAppRouteChange(["/text-english"], { order: 2 })
    @innerHtmlLight
    handleTextEnglishList() {
      return `<center-text-english-list-page/>`;
    }

    @subscribeSwcAppRouteChange(['/text-english/{name}'], { order: 2 })
    @innerHtmlLight
    handleTextEnglishReader(routerPathSet: RouterEventType) {
      return `<center-text-english-reader-page name="${routerPathSet.pathData.name}"/>`;
    }

    @subscribeSwcAppRouteChange(["/stock-flight"], { order: 3 })
    @innerHtmlLight
    handleStockFlight() {
      return `<center-stock-flight-page/>`;
    }

    @subscribeSwcAppRouteChange(["/lotto"], { order: 4 })
    @innerHtmlLight
    handleLotto() {
      return `<center-lotto-page/>`;
    }

    @subscribeSwcAppRouteChange(["/coordinate-simulation"], { order: 5 })
    @innerHtmlLight
    handleCoordinateSimulation() {
      return `<center-coordinate-2d-simulation-page/>`;
    }

    @subscribeSwcAppRouteChange(["/buyback"], { order: 6 })
    @innerHtmlLight
    handleBuyback() {
      return `<center-buyback-page/>`;
    }

    @subscribeSwcAppRouteChange(["/stock-brain-checker"], { order: 7 })
    @innerHtmlLight
    handleStockBrainChecker() {
      return `<center-stock-brain-checker-page/>`;
    }

    @subscribeSwcAppRouteChange(["/stock-npti"], { order: 8 })
    @innerHtmlLight
    handleStockNpti() {
      return `<center-stock-npti-page/>`;
    }

    @subscribeSwcAppRouteChange(["/stock-category"], { order: 9 })
    @innerHtmlLight
    handleStockCategory() {
      return `<center-stock-category-page/>`;
    }

    @subscribeSwcAppRouteChange(["/stock-indicator"], { order: 9 })
    @innerHtmlLight
    handleStockIndicator() {
      return `<center-stock-indicator-page/>`;
    }

    @subscribeSwcAppRouteChange(["/stock-chart"], { order: 9 })
    @innerHtmlLight
    handleStockChart() {
      return `<center-stock-chart-page/>`;
    }

    @subscribeSwcAppRouteChange(["/gpu-rental"], { order: 9 })
    @innerHtmlLight
    handleGpuRental() {
      return `<center-gpu-rental-page/>`;
    }

    @subscribeSwcAppRouteChange(["/stock-category-ranking"], { order: 9 })
    @innerHtmlLight
    handleStockCategoryRanking() {
      return `<center-stock-category-ranking-page/>`;
    }

    @subscribeSwcAppRouteChange(["/stock-trading-simulation"], { order: 10 })
    @innerHtmlLight({ filter: skipIfExists('center-stock-trading-simulation-page') })
    handleStockTradingSimulation() {
      return `<center-stock-trading-simulation-page/>`;
    }

    @subscribeSwcAppRouteChange(["/math"], { order: 11 })
    @innerHtmlLight({ filter: skipIfExists('center-math-page') })
    handleMath() {
      return `<center-math-page/>`;
    }

    @subscribeSwcAppRouteChange(["/ram-price"], { order: 12 })
    @innerHtmlLight
    handleRamPrice() {
      return `<center-ram-price-page/>`;
    }

    @subscribeSwcAppRouteChange(["/physical"], { order: 13 })
    @innerHtmlLight({ filter: skipIfExists('center-physical-page') })
    handlePhysical() {
      return `<center-physical-page/>`;
    }

    @subscribeSwcAppRouteChange(["/{tail:.*}"], { order: 999 })
    @innerHtmlLight
    handle404() {
      return `<div style="display: flex; align-items: center; justify-content: center; min-height: 400px; text-align: center; color: #666;">
        <div>
          <h2 style="font-size: 24px; margin-bottom: 10px; color: #333;">404 - Page Not Found</h2>
          <p style="margin-bottom: 20px; color: #999;">The page you're looking for doesn't exist.</p>
          <a href="/" style="padding: 12px 24px; background: #1976d2; color: white; text-decoration: none; border-radius: 4px; font-weight: 600;">Go Home</a>
        </div>
      </div>`;
    }

    @replaceChildren({
      root: "light",
      filter: (host, newNode) => !host.contains(newNode),
    })
    renderContent(node: Node) {
      return node;
    }

    @onConnectedBefore
    @innerHtml((c, helper) => helper.$w.document.querySelector("title"), { valueKey: "titleBody" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:title"]'), "content", { valueKey: "ogTitle" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[name="description"]'), "content", { valueKey: "desc" })
    @attribute((c, helper) => helper.$w.document.querySelector('meta[property="og:description"]'), "content", { valueKey: "ogDesc" })
    setMeta() {
      return {
        titleBody: "@dooboostore Center",
        ogTitle: "@dooboostore Center",
        desc: "다양한 미니 앱들을 한 곳에서 만나보세요.",
        ogDesc: "다양한 미니 앱들을 한 곳에서 만나보세요.",
      };
    }

    // @event<InputEvent>("#input", "input", {
    //   debounceTime: 1000,
    //   distinctUntilChanged: (a, b) => {
    //     return a.data === b.data;
    //   },
    // })
    // inputHandler(event: Event) {
    //   console.log("----->", event);
    // }

    @onConnectedBodyShadow
    render() {
      return `
        <style>
          * { box-sizing: border-box; }
          :host { display: flex; flex-direction: column; min-height: 100vh; width: 100%; background: #fff; }
          #page-container { flex: 1; display: flex; flex-direction: column; width: 100%; }
        </style>
<!--        <input id="input" type="text">-->
        <main id="page-container">
          <slot></slot>
        </main>
      `;
    }
  }

  return tagName;
};
