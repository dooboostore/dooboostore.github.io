import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './finance.route.component.html';
import styles from './finance.route.component.css';
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
import { FinanceItem, FinanceService } from '@src/service/english/FinanceService';


@Sim
@Component({
  template,
  styles
})
export class FinanceRouteComponent extends ComponentBase implements RouterAction.OnRouting {

  name='english-route'
  items?: FinanceItem[] = undefined;

  constructor(private financeService: FinanceService) {
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
      const items: FinanceItem[] = [];
      (await this.financeService.items()).forEach((it, index) => {
        items!.push(it);
        if (index > 0 && Math.random() < 0.2) {
          items!.push(null as any);
        }
      });
      this.items = items;
      console.log('-------->', this.name, this.items);
    }
  }

  async add() {
  }
  onDestroy() {
    super.onDestroy();
  }
}
