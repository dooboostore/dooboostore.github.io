import { innerHtml, createElement, CreateElementConfig, elementDefine, onConnectedShadow } from "@dooboostore/simple-web-component";

const tagName = "test-component";

export interface TestComponent extends HTMLElement {
}

export const TestComponent = (w: Window, data?: CreateElementConfig) => {
  return createElement<TestComponent>(w, tagName, data);
};
export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return existing;


  @elementDefine(tagName, { window: w })
  class AccommodationCard extends w.HTMLElement {

    @onConnectedShadow
    render() {
      return `
     <div>asdasd</div>
      `;
    }
  }

  return AccommodationCard;
};
