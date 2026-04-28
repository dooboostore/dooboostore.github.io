import 'reflect-metadata';
import { defineSwcAppBody, SwcAppInterface } from '@dooboostore/simple-web-component';
import { UrlUtils } from "@dooboostore/core";
import { defineServices } from "@center-src/services";
import { componentFactories } from "@center-src/components";
import { pageFactories } from "@center-src/pages";

const w = window;

w.document.addEventListener('DOMContentLoaded', async () => {
  const container = Symbol('container');

  await defineServices(container);
  await defineSwcAppBody(w);
  const appElement = w.document.querySelector('#app') as SwcAppInterface;

  if (appElement && typeof appElement.connect === 'function') {
    await appElement.connect({
      path: UrlUtils.getUrlPath(w.location) ?? '/',
      routeType: 'path',
      container: container,
      window: w,
      onStartedLazyDefineComponent: [...componentFactories, ...pageFactories]
    });
  } else {
    console.error('[Root] Failed to initialize SWC App: appElement.connect is not a function. Check Safari polyfill.');
  }
});
