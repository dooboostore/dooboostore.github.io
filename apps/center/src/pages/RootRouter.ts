import {
  elementDefine,
  onConnectedShadow,
  subscribeSwcAppRouteChangeWhileConnected,
  innerHtmlLight,
  replaceChildren,
  addEventListener,
  event,
} from '@dooboostore/simple-web-component';
import { Router, type RouterEventType } from '@dooboostore/core-web';

const tagName = 'center-root-router';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class RootRouter extends w.HTMLElement {
    private router!: Router;

    @subscribeSwcAppRouteChangeWhileConnected({ order: -1 })
    onRouteChange(routerPathSet: RouterEventType) {
      console.log("[Route Change]", routerPathSet.path);
    }

    @subscribeSwcAppRouteChangeWhileConnected(["", "/"], { order: 0 })
    @innerHtmlLight
    handleHome() {
      return `<center-home-page/>`;
    }

    @subscribeSwcAppRouteChangeWhileConnected(["/english"], { order: 1 })
    @innerHtmlLight
    handleEnglishList() {
      return `<center-english-list-page/>`;
    }

    @subscribeSwcAppRouteChangeWhileConnected(['/english/{name}'], { order: 2 })
    @innerHtmlLight
    handleEnglishPlayer(routerPathSet: RouterEventType) {
      return `<center-english-player-page name="${routerPathSet.pathData.name}"/>`;
    }

    @subscribeSwcAppRouteChangeWhileConnected(["/stock-flight"], { order: 3 })
    @innerHtmlLight
    handleStockFlight() {
      return `<center-stock-flight-page/>`;
    }

    @subscribeSwcAppRouteChangeWhileConnected(["/coordinate-simulation"], { order: 4 })
    @innerHtmlLight
    handleCoordinateSimulation() {
      return `<center-coordinate-2d-simulation-page/>`;
    }

    @subscribeSwcAppRouteChangeWhileConnected(["/{tail:.*}"], { order: 999 })
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

    // @event<InputEvent>("#input", "input", {
    //   debounceTime: 1000,
    //   distinctUntilChanged: (a, b) => {
    //     return a.data === b.data;
    //   },
    // })
    // inputHandler(event: Event) {
    //   console.log("----->", event);
    // }

    @onConnectedShadow
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
