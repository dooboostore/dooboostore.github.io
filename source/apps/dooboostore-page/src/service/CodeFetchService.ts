import { RequestResponse } from '@dooboostore/simple-boot-http-server/models/RequestResponse';
import { Config } from '@dooboostore/simple-boot-http-server-ssr/proxy/SymbolIntentApiServiceProxy';
export namespace CodeFetchService {
  export const SYMBOL = Symbol.for("CodeFetchService");
  export type FetchRequest = {path: string}
  export type FetchResponse = {rawData: string}
}

export interface CodeFetchService {
  fetch(request: CodeFetchService.FetchRequest, data?: RequestResponse | ((config: Config<CodeFetchService.FetchRequest>) => Promise<CodeFetchService.FetchResponse>)): Promise<CodeFetchService.FetchResponse>;
}