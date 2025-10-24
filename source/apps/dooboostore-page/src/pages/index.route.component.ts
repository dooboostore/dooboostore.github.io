import {
  Lifecycle,
  Sim,
} from "@dooboostore/simple-boot/decorators/SimDecorator";
import { Component } from "@dooboostore/simple-boot-front/decorators/Component";
import template from "./index.route.component.html";
import style from "./index.route.component.css";
import { SimFrontOption } from "@dooboostore/simple-boot-front/option/SimFrontOption";
import { Appender } from "@dooboostore/dom-render/operators/Appender";
import { ApiService } from "@dooboostore/simple-boot/fetch/ApiService";
import { ComponentBase } from "@dooboostore/simple-boot-front/component/ComponentBase";
import { RoutingDataSet } from "@dooboostore/simple-boot/route/RouterManager";
import { ChildrenSet, event } from "@dooboostore/dom-render/components/ComponentBase";
import { OnRawSetRendered, OnRawSetRenderedOtherData } from "@dooboostore/dom-render/lifecycle/OnRawSetRendered";
import { RawSet } from "@dooboostore/dom-render/rawsets/RawSet";

@Sim({
  scope: Lifecycle.Transient,
})
@Component({
  template: template,
  styles: style,
})
export class IndexRouteComponent extends ComponentBase<any> implements OnRawSetRendered {
  private fetchAppender = new Appender<string>();

  private sw = true;
  constructor(
  ) {
    super();
  }


  onCreatedThisChildDebounce(childrenSet: ChildrenSet[]) {
    super.onCreatedThisChildDebounce(childrenSet);
    // console.log('vvvvvvvv');
  }


  async onRouting(r: RoutingDataSet): Promise<void> {
    await super.onRouting(r);
    // console.log('index route onRouting??', r);
  }
}
