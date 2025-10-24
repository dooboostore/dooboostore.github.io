import { CodeFetchService } from "@src/service/CodeFetchService";
import {Sim} from '@dooboostore/simple-boot/decorators/SimDecorator'
import { ApiService } from "@dooboostore/simple-boot/fetch/ApiService";
import {
  Config,
  SymbolIntentApiServiceProxy,
} from "@dooboostore/simple-boot-http-server-ssr/proxy/SymbolIntentApiServiceProxy";
import {ConvertUtils} from '@dooboostore/core/convert/ConvertUtils'
import { environment } from "@src/environments/environment";
@Sim({
  symbol: CodeFetchService.SYMBOL,
  proxy: SymbolIntentApiServiceProxy,
})
export class FrontEndCodeFetchService implements CodeFetchService {
  constructor(private apiService: ApiService) {
  }

  async fetch(request: CodeFetchService.FetchRequest, data?:((config: Config<CodeFetchService.FetchRequest>) => Promise<CodeFetchService.FetchResponse>)): Promise<CodeFetchService.FetchResponse> {
  const rawData = await this.apiService.get<string>({
    target: `${environment.packageGithubIoUrl}/${request.path}`,
    config: { transformText: true },
  });
  return { rawData: ConvertUtils.escapeHTML(rawData, {targets:['$','<','>','&']}) };
  }
}