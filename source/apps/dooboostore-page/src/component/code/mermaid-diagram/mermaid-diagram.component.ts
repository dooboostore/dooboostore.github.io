import {
  attribute,
  ComponentBase,
  query,
} from "@dooboostore/dom-render/components/ComponentBase";
import { Component } from "@dooboostore/simple-boot-front/decorators/Component";
import { ClipBoardUtils } from "@dooboostore/core-web/clipboard/ClipBoardUtils";
import template from "./mermaid-diagram.component.html";
import styles from "./mermaid-diagram.component.css";
import { RawSet } from "@dooboostore/dom-render/rawsets/RawSet";

export type MermaidDiagramAttribute = {
  title: string;
  // code: string;
  codeClass: string;
};
@Component({
  selector: "mermaid-diagram",
  template,
  styles,
})
export class MermaidDiagramComponent extends ComponentBase<MermaidDiagramAttribute> {
  @attribute("title")
  title?: string = "";

  @query("pre")
  codeElement?: HTMLElement;

  @attribute("codeClass")
  codeClass?: string = "";

  async onInitRender(param: any, rawSet: RawSet) {
    await super.onInitRender(param, rawSet);
    // console.log('--aa------', this.codesElement);
    // 해당 컴포넌트의 <code> 엘리먼트만 Prism으로 하이라이트 처리
    const mermaid = (this.domRenderConfig?.window as any)?.Mermaid;
    // console.log(
    //   "-------",
    //   mermaid,
    //   this.codeElement?.hasAttribute("data-mermaid-processed"),
    // );
    if (
      mermaid &&
      this.codeElement &&
      !this.codeElement.hasAttribute("data-mermaid-processed")
    ) {
      mermaid.init(undefined, this.codeElement);
      this.codeElement.setAttribute("data-mermaid-processed", "true");
      // mermaid.highlightElement(this.codeElement);
    }
  }

  copyCode(e: Element) {
    if (
      this.rawSet?.dataSet.render?.innerHTML &&
      this.domRenderConfig?.window
    ) {
      ClipBoardUtils.writeText(
        this.rawSet.dataSet.render.innerHTML,
        this.domRenderConfig.window,
      );
      e.classList.add("copied");
      setTimeout(() => {
        e.classList.remove("copied");
      }, 1500);
    }
    // console.log('-----', this.rawSet?.point.innerHTML);
  }
}
