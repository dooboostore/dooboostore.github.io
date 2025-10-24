import {
  attribute,
  ComponentBase,
} from "@dooboostore/dom-render/components/ComponentBase";
import { Component } from "@dooboostore/simple-boot-front/decorators/Component";
import template from "./breadcrumb.component.html";
import styles from "./breadcrumb.component.css";
import { RawSet } from "@dooboostore/dom-render/rawsets/RawSet";
import { RandomUtils } from "@dooboostore/core/random/RandomUtils";

export interface BreadcrumbItem<T = any> {
  text: string;
  icon?: string;
  // class?: string;
  link?: string;
  data?: T;
}
export const isBreadcrumbItem = (item: BreadcrumbData): item is BreadcrumbItem => {
  return typeof item === 'object' && 'text' in item;
}

export interface BreadcrumbDropdown {
  selectedIndex?: number;
  items: BreadcrumbItem[];
}
export const isBreadcrumbDropdown = (item: BreadcrumbData): item is BreadcrumbDropdown => {
  return typeof item === 'object' && 'items' in item;
}

export type BreadcrumbData = BreadcrumbItem | BreadcrumbDropdown;

type BreadcrumbItemInComponent = BreadcrumbItem & { uuid: string };
type BreadcrumbDropdownInComponent = {
  selectedIndex?: number;
  items: BreadcrumbItemInComponent[];
  selected?: BreadcrumbItemInComponent;
};
type BreadcrumbDataInComponent = BreadcrumbItemInComponent | BreadcrumbDropdownInComponent;

export interface BreadcrumbProps {
  items: BreadcrumbData[];
  onNavigate?: (item: BreadcrumbItem) => void;
}
export type Attribute = {
  value?: BreadcrumbData[];
  onNavigate?: (item: BreadcrumbItem) => void;
}
@Component({ selector: "breadcrumb", template, styles })
export class BreadcrumbComponent extends ComponentBase<Attribute> {
  public items: BreadcrumbDataInComponent[] = [];
  @attribute("onNavigate")
  private onNavigate?: (item: BreadcrumbItem) => void;

  constructor() {
    super();
  }



  async onInitRender(param: any, rawSet: RawSet) {
    await super.onInitRender(param, rawSet);
    // console.log('--------->', this.items);
  }

  @attribute("value")
  setValue(value?:  BreadcrumbData[]) {
    if (!value) return;
    // console.log('---------v', value);
    this.items = value.map(it => {
      if (this.isBreadcrumbDropdown(it)) {
        const items = it.items.map(sit => ({...sit, uuid: RandomUtils.uuid()}));
        const dropdown: BreadcrumbDropdownInComponent = {
          selectedIndex: it.selectedIndex,
          items,
          selected: it.selectedIndex !== undefined ? items[it.selectedIndex] : undefined
        };
        return dropdown;
      } else {
        return {...it, uuid: RandomUtils.uuid()}
      }
    })
  }
  setProps(props: BreadcrumbProps) {
    this.setValue(props.items);
    this.onNavigate = props.onNavigate;
  }

  handleItemClick(item: BreadcrumbItem, event: Event) {
    event.preventDefault();
    if (this.onNavigate && item) {
      this.onNavigate(item);
    }
  }

  handleSelectChange(selectedValues: (string | null)[], item: BreadcrumbDropdownInComponent) {
    // console.log('----handleSelectChange-------', selectedValues, item);
    const selectedLink = selectedValues[0];
    const findItem = this.findItemByUUID(selectedLink)
    if (selectedLink && this.onNavigate && findItem) {
      item.selected = findItem;
      this.onNavigate(findItem);
    } else {
      item.selected = undefined;
    }
  }

  flatItems(): BreadcrumbItemInComponent[] {
    const z = this.items?.map(it => {
      if (this.isDropdownInComponent(it)) {
        return it.items??[];
      } else {
        return [it];
      }
    })??[]
    return z.flat();
  }

  findItemByUUID(uuid: string | null): BreadcrumbItemInComponent | undefined {
    if (uuid) {
      const items = this.flatItems();
      return items.find((it) => it.uuid === uuid);
    }
  }

  isItem(item: BreadcrumbDataInComponent): item is BreadcrumbItemInComponent {
    return !this.isDropdownInComponent(item);
  }

  isBreadcrumbDropdown(item: BreadcrumbData): item is BreadcrumbDropdown {
    return typeof item === 'object' && 'items' in item;
  }

  isDropdownInComponent(item: BreadcrumbDataInComponent): item is BreadcrumbDropdownInComponent {
    return typeof item === 'object' && 'items' in item;
  }

  getSingleItem(item: BreadcrumbDataInComponent): BreadcrumbItem {
    if (this.isDropdownInComponent(item)) {
      return item.selected || item.items[0];
    } else {
      return item;
    }
  }

  getArrayItems(item: BreadcrumbDataInComponent): BreadcrumbItemInComponent[] {
    if (this.isDropdownInComponent(item)) {
      return item.items??[];
    } else {
      return [item];
    }
  }
}
