import {
  attribute,
  ChildrenSet,
  ComponentBase,
  query,
} from "@dooboostore/dom-render/components/ComponentBase";
import { Component } from "@dooboostore/simple-boot-front/decorators/Component";
import { ClipBoardUtils } from "@dooboostore/core-web/clipboard/ClipBoardUtils";
import { RawSet } from "@dooboostore/dom-render/rawsets/RawSet";
import codeSnippetContainerTemplate from "./code-snippet-container.component.html";
import codeSnippetContainerStyles from "./code-snippet-container.component.css";
import codeSnippetTemplate from "./code-snippet.component.html";
import codeSnippetStyles from "./code-snippet.component.css";
import codeSnippetCodeTemplate from "./code-snippet-code.component.html";
import codeSnippetCodeStyles from "./code-snippet-code.component.css";
import codeSnippetResultTemplate from "./code-snippet-result.component.html";
import codeSnippetResultStyles from "./code-snippet-result.component.css";
import { ValidUtils } from "@dooboostore/core/valid/ValidUtils";
export namespace CodeSnippet {
  export type CodeSnippetContainerAttribute = {
    // activeName: string;
  };

  type CodeType = "bash" | "javascript" | "typescript" | "text";


  @Component({
    selector: "code-snippet-container",
    template: codeSnippetContainerTemplate,
    styles: codeSnippetContainerStyles,
  })
  export class CodeSnippetContainerComponent extends ComponentBase<CodeSnippetContainerAttribute> {
    @query(".tabs")
    tabsElement?: HTMLElement;

    private activeSnippetUuid?: string;
    private childSnippetComponents?: CodeSnippetComponent[];
    private tabButtonsElements?: HTMLElement[];

    async onInitRender(param: any, rawSet: RawSet) {
      await super.onInitRender(param, rawSet);
    }

    @query({selector: ".tab-btn", refreshRawSetRendered: true})
    findTabButtonsElements(elements: HTMLElement[], data: {all: HTMLElement[]}) {
      this.tabButtonsElements = data.all;
      const active = this.childSnippetComponents?.find((it) => it.active) ?? this.childSnippetComponents?.[0];
      // console.log('--------->', active, this.tabButtonsElements);
      if (active) {
        this.tabButtonsElements.forEach((it) => {
          if (it.dataset.uuid === active.uuid) {
            it.classList.add("active");
            this.activateSnippet(active.uuid);
          } else {
            it.classList.remove("active");
          }
        });
      }
    }

    onCreatedThisChildDebounce(childrenSet: ChildrenSet[]) {
      super.onCreatedThisChildDebounce(childrenSet);
      this.childSnippetComponents = this.getChildren(CodeSnippetComponent);
    }

    private activateSnippet(uuid?: string) {
      this.activeSnippetUuid = uuid;
      this.tabButtonsElements?.forEach((it) => {
        if (it.dataset.uuid === uuid) {
          it.classList.add("active");
        } else {
          it.classList.remove("active");
        }
      });
      const snippets = this.getChildren(CodeSnippetComponent);
      // 모든 스니펫 숨기기
      snippets.forEach((snippet) => {
        snippet.hide();
      });

      // 선택된 스니펫만 보이기
      const activeSnippet = snippets.find((s) => s.uuid === uuid);
      if (activeSnippet) {
        activeSnippet.show();
      }
      // 탭 상태 업데이트
      // this.buildTabs();
    }

    getActiveCodeSnipet() {
      const snippets = this.getChildren(CodeSnippetComponent);
      const activeSnippet = snippets.find(
        (s) => s.uuid === this.activeSnippetUuid,
      );
      return activeSnippet;
    }

    copyCode(e: Element) {
      this.getActiveCodeSnipet()?.copyCode();
      e.classList.add("copied");
      setTimeout(() => {
        e.classList.remove("copied");
      }, 1500);
    }
  }
  //////////////////////////


  export type CodeSnippetAttribute = {
    name: string;
    active?: string | null;

  };


  @Component({
    selector: "code-snippet",
    template: codeSnippetTemplate,
    styles: codeSnippetStyles,
  })
  export class CodeSnippetComponent extends ComponentBase<CodeSnippetAttribute> {
    @attribute("name")
    name?: string = "";

    @attribute({
      name: "active",
      converter: (d) => ValidUtils.isNotNullUndefined(d),
    })
    active?: boolean = false;
    //
    // @attribute("type")
    // type?: "bash" | "javascript" | "typescript" = "javascript";
    //

    @query(".code-snippet")
    codeSnippetElement?: HTMLElement;
    @query(".language-result-indicator")
    languageResultIndicatElement?: HTMLElement;
    @query(".language-type-indicator")
    languageTypeIndicatoElement?: HTMLElement;
    private type?: CodeType = "text";
    private hasResult: boolean = false;

    constructor() {
      super({ onlyParentType: CodeSnippetContainerComponent });
    }

    async onInitRender(param: any, rawSet: RawSet) {
      await super.onInitRender(param, rawSet);
      // Prism 하이라이트 적용
      // const prism = (this.domRenderConfig?.window as any)?.Prism;
      // if (prism && this.codeElement) {
      //   prism.highlightElement(this.codeElement);
      // }
    }

    onCreatedThisChildDebounce(childrenSet: ChildrenSet[]) {
      super.onCreatedThisChildDebounce(childrenSet);
      // console.log("snippet", this.children);
      let firstChild = this.getFirstChild(CodeSnippetCodeComponent);
      this.type = firstChild?.type;
      this.hasResult = !!this.getFirstChild(CodeSnippetResultComponent);
      // console.log('--', this.type);
    }

    copyCode() {
      this.getFirstChild(CodeSnippetCodeComponent)?.copyCode();
    }

    show() {
      if (this.codeSnippetElement) {
        this.codeSnippetElement.style.display = "block";
        if (this.languageResultIndicatElement)
        this.languageResultIndicatElement.style.display ="block"
        if (this.languageTypeIndicatoElement)
        this.languageTypeIndicatoElement.style.display ="block"
        this.active = true;
      }
    }

    hide() {
      if (this.codeSnippetElement) {
        this.codeSnippetElement.style.display = "none";
        if (this.languageResultIndicatElement)
          this.languageResultIndicatElement.style.display ="none"
        if (this.languageTypeIndicatoElement)
          this.languageTypeIndicatoElement.style.display ="none"
        this.active = false;
      }
    }

    toggleResultVisible() {
      // console.log('toogle',this.hasResult);
      if (this.hasResult) {
        this.getFirstChild(CodeSnippetResultComponent)?.toggleVisible();
      }
    }
  }

  ///////////////////////////////////

  export type CodeSnippetCodeAttribute = {
    type: CodeType;
  };

  @Component({
    selector: "code-snippet-code",
    template: codeSnippetCodeTemplate,
    styles: codeSnippetCodeStyles,
  })
  export class CodeSnippetCodeComponent extends ComponentBase<CodeSnippetCodeAttribute> {

    @attribute("type")
    type?: "bash" | "javascript" | "typescript" | "text" = "text";

    @query(".code-snippet-pre")
    codeSnippetPreElement?: HTMLElement;

    @query("code")
    codeElement?: HTMLElement;

    constructor() {
      super({ onlyParentType: CodeSnippetComponent });
    }

    async onInitRender(param: any, rawSet: RawSet) {
      const prism = (this.domRenderConfig?.window as any)?.Prism;
      // console.log("snippetCode1",this.type, prism, this.codeElement, this.codeElement?.innerHTML);
      await super.onInitRender(param, rawSet);
      // console.log("snippetCode2",this.type, prism, this.codeElement, this.codeElement?.innerHTML);
      setTimeout(() =>{
      // Prism 하이라이트 적용
      //   console.log('this.codeElement', this.codeSnippetPreElement,this.codeSnippetPreElement?.innerHTML);
      if (prism && this.codeElement) {
        // this.codeElement.innerHTML = this.codeElement.innerHTML.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
        // this.codeElement.innerHTML = this.codeElement.innerHTML.replaceAll('&gt;','>');
        prism.highlightElement(this.codeElement, prism.languages.haml, 'haml');
      }
      }, 1)
    }

    copyCode() {
      if (
        this.rawSet?.dataSet.render?.innerHTML &&
        this.domRenderConfig?.window
      ) {
        ClipBoardUtils.writeText(
          this.rawSet.dataSet.render.innerHTML,
          this.domRenderConfig.window,
        );
      }
    }
  }

  export type CodeSnippetResultAttribute = {
    type: CodeType;
  };

  @Component({
    selector: "code-snippet-result",
    template: codeSnippetResultTemplate,
    styles: codeSnippetResultStyles,
  })
  export class CodeSnippetResultComponent extends ComponentBase<CodeSnippetResultAttribute> {
    @attribute("name")
    name?: string = "";

    @attribute({
      name: "open",
      converter: (d) => ValidUtils.isNotNullUndefined(d),
    })
    open?: boolean = false;

    @attribute("type")
    type?: "bash" | "javascript" | "typescript" | "text" = "text";

    @query(".code-snippet-pre")
    codeSnippetPreElement?: HTMLElement;

    @query("code")
    codeElement?: HTMLElement;

    constructor() {
      super({ onlyParentType: CodeSnippetComponent });
    }

    async onInitRender(param: any, rawSet: RawSet) {
      const prism = (this.domRenderConfig?.window as any)?.Prism;
      // console.log("snippetCode1",this.type, prism, this.codeElement, this.codeElement?.innerHTML);
      await super.onInitRender(param, rawSet);
      // console.log("snippetCode2",this.type, prism, this.codeElement, this.codeElement?.innerHTML);
      if (this.open) {
        this.show();
      } else {
        this.hide();
      }
      setTimeout(()=>{
        // Prism 하이라이트 적용
        if (prism && this.codeElement) {
          prism.highlightElement(this.codeElement);
        }

      }, 10)
    }

    toggleVisible() {
      // console.log('--?', this.open, this.codeSnippetPreElement);
      if (this.open) {
        this.hide();
      } else {
        this.show();
      }
    }
    show() {
      if (this.codeSnippetPreElement) {
        this.codeSnippetPreElement.style.display = "block";
        this.open = true;
      }
    }
    hide() {
      if (this.codeSnippetPreElement) {
        this.codeSnippetPreElement.style.display = "none";
        this.open = false;
      }
    }

  }
}
