import { Router } from '@dooboostore/simple-boot/decorators/route/Router';
import { Lifecycle, Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './youtube-persona.router.component.html';
import styles from './youtube-persona.router.component.css';
import { ComponentRouterBase } from '@dooboostore/simple-boot-front/component/ComponentRouterBase';
import { YoutubePersonaRouteComponent } from './youtube-persona.route.component';
import { YoutubePersonaDetailRouteComponent } from './detail/youtube-persona-detail.route.component';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import { SimFrontOption } from '@dooboostore/simple-boot-front/option/SimFrontOption';
import { environment } from '@back-end/environments/environment';
import { Persona, YoutubePersonaService } from '@src/service/youtube-persona/YoutubePersonaService';

@Sim({scope: Lifecycle.Transient})
@Router({
  path: '/youtube-persona',
  route: {
    '': '/',
    '/': YoutubePersonaRouteComponent,
    '/{name}': YoutubePersonaDetailRouteComponent,
    '/{name}/': YoutubePersonaDetailRouteComponent
  },
  routers: []
})
@Component({
  template,
  styles
})
export class YoutubePersonaRouterComponent extends ComponentRouterBase {
  currentPersonaName?: string;
  currentPersona?: Persona;
  isInSubRoute = false;

  constructor(
    private config: SimFrontOption,
    private youtubePersonaService: YoutubePersonaService
  ) {
    super({ sameRouteNoApply: true });
  }

  async onInitRender(param: any, rawSet: RawSet) {
    await super.onInitRender(param, rawSet);
  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    await super.onRouting(r);

    this.currentPersonaName = decodeURIComponent(r.routerModule.pathData?.name ?? '');
    this.currentPersona = this.currentPersonaName ? await this.youtubePersonaService.persona(this.currentPersonaName) : undefined;

    if (this.config?.window) {
      const doc = this.config.window.document;
      const setMetaByProperty = (property: string, content: string) => {
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

      let pageTitle = '유튜브 알고리즘 훔쳐보기';
      let pageDescription = '다른 사람들의 유튜브 알고리즘을 훔쳐보고 새로운 영상을 발견하세요';
      let pageUrl = environment.host + this.config.window.window.location.pathname;
      let pageImage = '/datas/youtube-persona/img.png';

      if (this.currentPersona) {
        pageTitle = `${this.currentPersona.persona} - 유튜브 알고리즘`;
        pageDescription = `${this.currentPersona.categoryEmojis[0]??''} ${this.currentPersona.persona}의 유튜브 알고리즘 훔쳐보기`;
      }

      setTitle(pageTitle);
      setMetaByName('description', pageDescription);
      setLink('canonical', pageUrl);
      setMetaByProperty('og:title', pageTitle);
      setMetaByProperty('og:description', pageDescription);
      setMetaByProperty('og:image', pageImage);
      setMetaByProperty('og:url', pageUrl);
      setMetaByProperty('og:type', 'website');
    }

    if (ValidUtils.isBrowser()) {
      this.isInSubRoute = !!this.currentPersonaName;
    }
  }
}
