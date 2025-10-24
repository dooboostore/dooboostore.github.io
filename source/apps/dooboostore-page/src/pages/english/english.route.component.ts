import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './english.route.component.html';
import styles from './english.route.component.css';
import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { ApiService } from '@dooboostore/simple-boot/fetch/ApiService';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { OnRawSetRenderedOtherData } from '@dooboostore/dom-render/lifecycle/OnRawSetRendered';
import { RouterAction } from '@dooboostore/simple-boot/route/RouterAction';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import {
  ComponentBase,
  query
} from '@dooboostore/dom-render/components/ComponentBase';
import { VideoItem, VideoItemService } from '@src/service/english/VideoItemService';


@Sim
@Component({
  template,
  styles
})
export class EnglishRouteComponent extends ComponentBase implements RouterAction.OnRouting {

  name='english-route'
  items?: VideoItem[] = undefined;
  movieItems?: VideoItem[] = undefined;
  youtubeItems?: VideoItem[] = undefined;
  
  constructor(private videoItemService: VideoItemService) {
    super();
  }

  async onRawSetRendered(rawSet: RawSet, otherData: OnRawSetRenderedOtherData): Promise<void> {
    await super.onRawSetRendered(rawSet, otherData);
  }

  //
  async onRouting(r: RoutingDataSet): Promise<void> {
    await new Promise((r, j) => setTimeout(r, 0));
    // this.items = [{},{}]


  }

  async onInitRender(param: any, rawSet: RawSet): Promise<void> {
    await super.onInitRender(param, rawSet);
    this.name = 'english-route' + Date.now();
    if (ValidUtils.isBrowser()) {
      this.items = await this.videoItemService.items();
      
      // Separate items by type
      this.movieItems = this.items.filter(item => !item.type || item.type === 'movie');
      this.youtubeItems = [];
      this.items.filter(item => item.type === 'youtube').forEach((it,index) => {
        this.youtubeItems!.push(it);
        if (index > 0 && Math.random() < 0.2) {
          this.youtubeItems!.push(null as any);
        }
      });
      
      console.log('Movies:', this.movieItems.length);
      console.log('YouTube videos:', this.youtubeItems.length);
    }
  }

  async add() {
  }
  onDestroy() {
    super.onDestroy();
  }
}
