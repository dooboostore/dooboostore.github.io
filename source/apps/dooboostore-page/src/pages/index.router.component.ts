import { Sim } from "@dooboostore/simple-boot/decorators/SimDecorator";
import { Router } from "@dooboostore/simple-boot/decorators/route/Router";
import { Component } from "@dooboostore/simple-boot-front/decorators/Component";
import { IndexRouteComponent } from "./index.route.component";
import { ComponentRouterBase } from "@dooboostore/simple-boot-front/component/ComponentRouterBase";
import template from "./index.router.component.html";
import style from "./index.router.component.css";
import { drComponent } from "@dooboostore/dom-render/components/index";
import projectComponent from "@src/component";
import { RawSet } from "@dooboostore/dom-render/rawsets/RawSet";
import { Router as DomRenderRouter } from "@dooboostore/dom-render/routers/Router";
import { RoutingDataSet } from "@dooboostore/simple-boot/route/RouterManager";
import { ChildrenSet } from "@dooboostore/dom-render/components/ComponentBase";
import { EnglishRouterComponent } from "@src/pages/english/english.router.component";
import { FinanceRouterComponent } from '@src/pages/finance/finance.router.component';
import { YoutubePersonaRouterComponent } from '@src/pages/youtube-persona/youtube-persona.router.component';

@Sim
@Router({
  path: "",
  route: {
    "/": IndexRouteComponent,
  },
  routers: [EnglishRouterComponent, FinanceRouterComponent, YoutubePersonaRouterComponent],
})
@Component({
  template: template,
  styles: style,
  using: [drComponent, projectComponent],
})
export class IndexRouterComponent extends ComponentRouterBase {
  private name= 'index-router'
  constructor(private router: DomRenderRouter) {
    super({ sameRouteNoApply: true });
  }
  async onInitRender(param: any, rawSet: RawSet) {
    await super.onInitRender(param, rawSet);
    this.name = 'index-router' + Date.now();
  }



  test() {}
}
