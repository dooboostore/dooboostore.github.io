/**
 * Global type augmentation for @dooboostore showcase
 */
declare global {
  interface Window {
    HTMLElement: typeof HTMLElement;
    HTMLDivElement: typeof HTMLDivElement;
    HTMLButtonElement: typeof HTMLButtonElement;
    HTMLTemplateElement: typeof HTMLTemplateElement;
    HTMLAnchorElement: typeof HTMLAnchorElement;
    HTMLFormElement: typeof HTMLFormElement;
    location: Location;
    document: Document;
    history: History;
    CustomEvent: typeof CustomEvent;
  }
}

export {};
