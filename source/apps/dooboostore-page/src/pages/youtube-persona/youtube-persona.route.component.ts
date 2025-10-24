import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './youtube-persona.route.component.html';
import styles from './youtube-persona.route.component.css';
import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { RouterAction } from '@dooboostore/simple-boot/route/RouterAction';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import { ComponentBase } from '@dooboostore/dom-render/components/ComponentBase';
import { Persona, YoutubePersonaService } from '@src/service/youtube-persona/YoutubePersonaService';

@Sim
@Component({
  template,
  styles
})
export class YoutubePersonaRouteComponent extends ComponentBase implements RouterAction.OnRouting {
  personas?: Persona[] = undefined;

  constructor(private youtubePersonaService: YoutubePersonaService) {
    super();
  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    await new Promise((r, j) => setTimeout(r, 0));
  }

  async onInitRender(param: any, rawSet: RawSet): Promise<void> {
    await super.onInitRender(param, rawSet);

    if (ValidUtils.isBrowser()) {
      try {
        this.personas = await this.youtubePersonaService.personas();
      } catch (error) {
        console.error('Failed to load personas:', error);
        this.personas = [];
      }
    }
  }

  onDestroy() {
    super.onDestroy();
  }
}
