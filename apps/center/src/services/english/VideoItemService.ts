import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export type VideoItem = { name: string; type?: string; img: string; link?: string };

export namespace VideoItemService {
  export const SYMBOL = Symbol.for('VideoItemService');
}

export interface VideoItemServiceType {
  items(): Promise<VideoItem[]>;
  item(name: string): Promise<VideoItem | undefined>;
}

export default (container: symbol): ConstructorType<VideoItemServiceType> => {
  @Sim({ symbol: VideoItemService.SYMBOL, container: container })
  class VideoItemServiceImpl implements VideoItemServiceType {
    public async items(): Promise<VideoItem[]> {
      const res = await fetch('/datas/english/items.json');
      const data: VideoItem[] = await res.json();
      return data.reverse();
    }
    public async item(name: string): Promise<VideoItem | undefined> {
      const items = await this.items();
      return items.find(item => item.name === name);
    }
  }
  return VideoItemServiceImpl;
};
