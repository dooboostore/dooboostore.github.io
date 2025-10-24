import {
  attribute,
  ComponentBase,
  query,
} from "@dooboostore/dom-render/components/ComponentBase";
import { Component } from "@dooboostore/simple-boot-front/decorators/Component";
import { ClipBoardUtils } from "@dooboostore/core-web/clipboard/ClipBoardUtils";
import template from "./test.component.html";
import styles from "./test.component.css";
import { RawSet } from "@dooboostore/dom-render/rawsets/RawSet";

export type TestAttribute = {
  title: string;
  // code: string;
  codeClass: string;
};
@Component({
  selector: "test",
  template,
  styles,
})
export class TestComponent extends ComponentBase<TestAttribute> {
  @attribute("title")
  title?: string = "";

  @query("pre")
  codeElement?: HTMLElement;

  @attribute("codeClass")
  codeClass?: string = "";

  onInitRender(param: any, rawSet: RawSet) {
    super.onInitRender(param, rawSet);

  }

}
