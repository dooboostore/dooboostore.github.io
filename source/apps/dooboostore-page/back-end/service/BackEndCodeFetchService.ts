import { CodeFetchService } from "@src/service/CodeFetchService";
import {Sim} from '@dooboostore/simple-boot/decorators/SimDecorator'
import { RequestResponse } from '@dooboostore/simple-boot-http-server/models/RequestResponse';
import {FileUtils} from '@dooboostore/core-node/file/FileUtils'
import {ConvertUtils} from '@dooboostore/core/convert/ConvertUtils'
import {PathUtils} from '@dooboostore/core-node/path/PathUtils'
@Sim({
  symbol: CodeFetchService.SYMBOL,
})
export class BackEndCodeFetchService implements CodeFetchService{
  async fetch(request: CodeFetchService.FetchRequest, data?: RequestResponse): Promise<CodeFetchService.FetchResponse> {
    const rawData = await FileUtils.readStringAsync(PathUtils.resolve('../../packages', request.path));
    // return { rawData: ConvertUtils.escapeHTML(rawData, {targets:['$','<','>','&']}) };
    return { rawData: 'vavasweodjkdfsj' };
    // return {rawData:'aasdas<div>asdasd</div>dasds${}asdasd${###}#}#adas dasdasdasdasdasdasdasdasdasdasdasdasdasdasdasdasdasdasdasdasdasd'};
  }

}