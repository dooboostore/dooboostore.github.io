import { Sim } from "@dooboostore/simple-boot/decorators/SimDecorator";
import { ApiService } from "@dooboostore/simple-boot/fetch/ApiService";
import { environment } from '@back-end/environments/environment';
export type VideoItem = { name: string; type?: string; img: string; link?: string };
@Sim
export class VideoItemService {
  constructor(private apiService: ApiService) {

  }

  async items(): Promise<VideoItem[]>{
    return await this.apiService.get<VideoItem[]>({
      target: new URL(`${environment.host}/datas/english/items.json`)
    }).then(it => it.reverse());
  }

  async item(name: string): Promise<VideoItem | undefined>{
    const items = await this.items();
    return items.find(item => item.name === name);
  }

}