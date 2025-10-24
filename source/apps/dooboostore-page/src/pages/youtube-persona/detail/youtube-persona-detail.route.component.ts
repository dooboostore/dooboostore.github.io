import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './youtube-persona-detail.route.component.html';
import styles from './youtube-persona-detail.route.component.css';
import { Lifecycle, Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { RouterAction } from '@dooboostore/simple-boot/route/RouterAction';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import { ComponentBase } from '@dooboostore/dom-render/components/ComponentBase';
import { Persona, VideoRecommendation, YoutubePersonaService } from '@src/service/youtube-persona/YoutubePersonaService';

@Sim({scope: Lifecycle.Transient})
@Component({
  template,
  styles
})
export class YoutubePersonaDetailRouteComponent extends ComponentBase implements RouterAction.OnRouting {
  personaName?: string;
  persona?: Persona;
  videos?: VideoRecommendation[] = undefined;

  constructor(private youtubePersonaService: YoutubePersonaService) {
    super();
  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    this.personaName = decodeURIComponent(r.routerModule.pathData?.name ?? '');
    
    if (ValidUtils.isBrowser() && this.personaName) {
      try {
        this.persona = await this.youtubePersonaService.persona(this.personaName);
        this.videos = await this.youtubePersonaService.videos(this.personaName);
      } catch (error) {
        console.error('Failed to load videos:', error);
        this.videos = [];
      }
    }
  }

  async onInitRender(param: any, rawSet: RawSet): Promise<void> {
    await super.onInitRender(param, rawSet);
  }

  onDestroy() {
    super.onDestroy();
  }
}
