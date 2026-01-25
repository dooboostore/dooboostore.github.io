import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { ApiService } from '@dooboostore/simple-boot/fetch/ApiService';
import { environment } from '@back-end/environments/environment';

export type Persona = {
  persona: string;
  keywords: string[];
  categoryEmojis: string[];
};

export type VideoRecommendation = {
  title: string;
  channel: string;
  channelId: string;
  channelThumbnail: string;
  videoId: string;
  thumbnail: string;
  url: string;
  viewCount: string;
  publishedTime: string;
  description: string;
};

@Sim
export class YoutubePersonaService {
  constructor(private apiService: ApiService) {
  }

  async personas(): Promise<Persona[]> {
    return await this.apiService.get<Persona[]>({
      target: new URL(`${environment.host}/datas/youtube-persona/items.json`)
    });
  }

  async persona(personaName: string): Promise<Persona | undefined> {
    const personas = await this.personas();
    return personas.find(p => p.persona === personaName);
  }

  async videos(personaName: string): Promise<VideoRecommendation[]> {
    const fileName = personaName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    return await this.apiService.get<VideoRecommendation[]>({
      target: new URL(`${environment.host}/datas/youtube-persona/personas/${fileName}.json`)
    });
  }
}
