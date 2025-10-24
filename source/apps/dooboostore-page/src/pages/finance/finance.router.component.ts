import { Router } from '@dooboostore/simple-boot/decorators/route/Router';
import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './finance.router.component.html';
import styles from './finance.router.component.css';
import { ComponentRouterBase } from '@dooboostore/simple-boot-front/component/ComponentRouterBase';
import { FinanceRouteComponent } from './finance.route.component';
import { ChildrenSet } from '@dooboostore/dom-render/components/ComponentBase';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { OnCreateRenderDataParams } from '@dooboostore/dom-render/lifecycle/OnCreateRenderData';
import { OnCreatedOutletDebounce } from '@dooboostore/dom-render/components/ComponentRouterBase';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import { SimFrontOption } from '@dooboostore/simple-boot-front/option/SimFrontOption';
import { OnCreateRender } from '@dooboostore/dom-render/lifecycle/OnCreateRender';
import { VoiceService } from '@src/service/VoiceService';
import { environment } from '@back-end/environments/environment';
import { ChartRouteComponent } from '@src/pages/finance/chart/chart.route.component';
import { FinanceItem, FinanceService } from '@src/service/english/FinanceService';

export type FavoriteWord = {
  text: string;
  meaning: string;
  addedAt: number;
};

export type Item = { name: string; type?: string; img: string; link?: string };

@Sim
@Router({
  path: '/finance',
  route: {
    '': '/',
    '/': FinanceRouteComponent,
    '/{name}': ChartRouteComponent,
    '/{name}/': ChartRouteComponent

  },
  routers: []
})
@Component({
  template,
  styles
})
export class FinanceRouterComponent extends ComponentRouterBase implements OnCreatedOutletDebounce, OnCreateRender {
  favoriteWords: FavoriteWord[] = [];
  showFavorites = false;

  // Current item info
  currentItemName?: string;
  currentItem?: FinanceItem;
  // items?: Item[];
  isInSubRoute = false; // Track if we're in a sub-route

  name='zzz'
  constructor(
    private config: SimFrontOption,
    private financeService: FinanceService,
    private voiceService: VoiceService
  ) {
    super({ sameRouteNoApply: true });
  }


  onCreateRenderData(data: OnCreateRenderDataParams): void {
    super.onCreateRenderData(data);
    console.log('english.router.component onCreateRenderData-------');

  }

  onCreateRender(...param: any[]): void {
    console.log('english.router.component onCreateRender-------');
  }

  async onInitRender(param: any, rawSet: RawSet) {
    await super.onInitRender(param, rawSet);
    this.name = new Date().toISOString();
    console.log('english.router.component onInitRender-------');

    // Initialize speech synthesis voices
    this.initializeSpeechSynthesis();


  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    await super.onRouting(r);

    this.currentItemName = decodeURIComponent(r.routerModule.pathData?.name??'');
    this.currentItem = this.currentItemName ? await this.financeService.item(this.currentItemName) : undefined;


    if (this.config?.window) {
      const doc = this.config.window.document;
      const setMetaByProperty = (property: string, content: string) => {
        const d = doc.querySelector(`meta[property="${property}"]`);
        doc.querySelector(`meta[property="${property}"]`)?.setAttribute('content', content);
      };
      const setMetaByName = (name: string, content: string) => {
        doc.querySelector(`meta[name="${name}"]`)?.setAttribute('content', content);
      };
      const setLink = (rel: string, href: string) => {
        doc.querySelector(`link[rel="${rel}"]`)?.setAttribute('href', href);
      };
      const setTitle = (title: string) => {
        doc.title = title;
      };
      let pageTitle = 'Finance Chart';
      let pageDescription = 'Finance Chart and Data Visualization';
      let pageUrl = environment.host + this.config.window.window.location.pathname;
      let pageImage = 'assets/images/dooboostore.png'

      if (this.currentItem) {
        // Page-specific SEO content
        pageTitle = this.currentItem.label;
        pageDescription = this.currentItem.label
        pageImage = `/datas/finance/item/${this.currentItem.symbol}.png`;
        // Set Title, Description, Canonical URL
      }
      console.log('Setting SEO tags:', { pageTitle, pageDescription, pageUrl, pageImage });
      setTitle(pageTitle);
      setMetaByName('description', pageDescription);
      setLink('canonical', pageUrl);

      // Set Open Graph (OG) tags for social sharing
      setMetaByProperty('og:title', pageTitle);
      setMetaByProperty('og:description', pageDescription);
      setMetaByProperty('og:image', pageImage);
      setMetaByProperty('og:url', pageUrl);
      setMetaByProperty('og:type', 'website')
    }




    if (ValidUtils.isBrowser()) {
      // Get current item name from route
      // console.log('------->', r, this.currentItemName);
      // Check if we're in a sub-route (has name parameter)
      this.isInSubRoute = !!this.currentItemName;
    }
  }

  onCreatedThisChild(child: any, data: OnCreateRenderDataParams) {
    super.onCreatedThisChild(child, data);
  }

  onCreatedThisChildDebounce(childrenSet: ChildrenSet[]) {
    super.onCreatedThisChildDebounce(childrenSet);
  }

  onDrThisUnBind() {
    super.onDrThisUnBind();
    this.onDestroyRender();
  }

  onDestroyRender(data?: any) {
    super.onDestroyRender(data);
  }

  onCreatedOutletDebounce(a: any) {
    // Prism.highlightAll() 전체 하이라이트 제거
  }

  private initializeSpeechSynthesis() {
    // VoiceService handles initialization automatically
    console.log('🎤 Voice service initialized in router');
  }

}
