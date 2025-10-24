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

@Sim
@Router({
  path: "",
  route: {
    "/": IndexRouteComponent,
  },
  routers: [EnglishRouterComponent],
})
@Component({
  template: template,
  styles: style,
  using: [drComponent, projectComponent],
})
export class IndexRouterComponent extends ComponentRouterBase {
  constructor(private router: DomRenderRouter) {
    super({ sameRouteNoApply: true });
  }
  async onInitRender(param: any, rawSet: RawSet) {
    super.onInitRender(param, rawSet);
  }
  async canActivate(url: RoutingDataSet, data?: any): Promise<void> {
    super.canActivate(url, data);
  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    await super.onRouting(r);
    console.log("onRouting");
  }

  onCreatedThisChildDebounce(childrenSet: ChildrenSet[]) {
    super.onCreatedThisChildDebounce(childrenSet);
  }

  test() {}
}
