import "reflect-metadata";
// console.log('Project ----------', require.resolve("reflect-metadata"));
// console.log('Project ---', Object.keys(require.cache).filter(p => p.includes("reflect-metadata")));
// if (!(Reflect as any).__MY_MARK__) {
//   (Reflect as any).__MY_MARK__ = Math.random();
// }

// console.log("Project Reflect mark:", (Reflect as any).__MY_MARK__);
// import {IntentManager} from '@dooboostore/simple-boot/intent/IntentManager';
// import { ApiRrouter } from "@back-end/api/ApiRrouter";
// import { CacheManager } from "@dooboostore/simple-boot/cache/CacheManager";
// console.log('Project intentManager---> ', IntentManager)
// console.log('Project Metadata:', Reflect.getMetadata('hello', IntentManager));
// console.log('Project IntentManager resolve',IntentManager, require.resolve('@dooboostore/simple-boot/intent/IntentManager'))
// console.log('Project IntentManager parameter', Reflect.getMetadata('design:paramtypes', IntentManager));
// console.log('Project IntentManager parameter', Reflect.getMetadata('design:paramtypes', ApiRrouter));
// console.log('Project IntentManager parameter', Reflect.getMetadata('design:paramtypes', CacheManager));
import { CrossDomainHeaderEndPoint } from "@dooboostore/simple-boot-http-server/endpoints/CrossDomainHeaderEndPoint";
import { SimpleBootHttpSSRServer } from "@dooboostore/simple-boot-http-server-ssr/SimpleBootHttpSSRServer";
import { HttpSSRServerOption } from "@dooboostore/simple-boot-http-server-ssr/option/HttpSSRServerOption";
import { environment } from "./environments/environment";
import { NotFoundError } from "@dooboostore/simple-boot-http-server/errors/NotFoundError";
import Factory, { MakeSimFrontOption } from "@src/bootfactory";
import {
  FactoryAndParams,
  SSRFilter,
} from "@dooboostore/simple-boot-http-server-ssr/filters/SSRFilter";
import {SSRLinkDomDomFilter} from "@dooboostore/simple-boot-http-server-ssr/filters/SSRLinkDomDomFilter";
import {SSRDomParserFilter} from "@dooboostore/simple-boot-http-server-ssr/filters/SSRDomParserFilter";
import { RootRouter } from "@back-end/root.router";
import { IntentSchemeFilter } from "@dooboostore/simple-boot-http-server/filters/IntentSchemeFilter";
import { SimpleBootHttpSSRFactory } from "@dooboostore/simple-boot-http-server-ssr/SimpleBootHttpSSRFactory";
import { Runnable } from "@dooboostore/core/runs/Runnable";
import { SimpleBootHttpServer } from "@dooboostore/simple-boot-http-server/SimpleBootHttpServer";
import { ResourceFilter } from "@dooboostore/simple-boot-http-server/filters/ResourceFilter";
import { services } from "@back-end/service";
import { RequestLogEndPoint } from "@back-end/endpoints/RequestLogEndPoint";
import { CloseLogEndPoint } from "@back-end/endpoints/CloseLogEndPoint";
import { ErrorLogEndPoint } from "@back-end/endpoints/ErrorLogEndPoint";
import {PathUtils} from '@dooboostore/core-node/path/PathUtils'
import { GlobalAdvice } from "@back-end/advices/GlobalAdvice";
class Server implements Runnable<void, void> {
  async run() {
    const ssrOption: FactoryAndParams = {
      frontDistPath: environment.frontDistPath,
      frontDistIndexFileName: environment.frontDistIndexFileName,
      factorySimFrontOption: (window: any) => MakeSimFrontOption(window),
      factory: Factory as SimpleBootHttpSSRFactory,
      using: [...services],
      ssrExcludeFilter: (rr) => /^\/api\//.test(rr.reqUrl), // Exclude API routes from SSR
      poolOption: {
        max: 50,
        min: 50
      },
    };

    const datasResourceFilter = new ResourceFilter(PathUtils.resolve(process.cwd(),'../../../'),[
      {
        request: (rr) => {
          return rr.reqUrlPathName.startsWith('/datas/')
        },
        dist: (rr) => {
          // console.log('---------?');
          // prefix 제거 후 /dictionary/{...}에서 {...}만 추출
          // const path = rr.reqUrlPathName.replace(/^\/dooboostore-develop.github.io\/packages/, "");
          // const m = rr.reqUrlPathName.match(/^\/datas\/dictionary\/(.+)$/);
          // let s = `${(m ? m[1] : '')}.json`;
          // console.log('-ss-------',decodeURIComponent(rr.reqUrlPathName));
          return decodeURIComponent(rr.reqUrlPathName);
        },
        // response: (rr, app): any => {
        //   const path = rr.reqUrlPathName.replace(/^\/dooboostore-develop.github.io\/packages/, "");
        //   console.log('-',`https://dooboostore-develop.github.io/packages${path}`);
        //   return fetch(`https://dooboostore-develop.github.io/packages/${path}`);
        // }
      },
    ])
    // const repositoryResourceFilter = new ResourceFilter([
    //   {
    //     request:()=>true,
    //     dist:(): any => {
    //       return '';
    //     }
    //   }
    // ]);
    const resourceFilter = new ResourceFilter(environment.frontDistPath, [
      "assets/privacy.html",
      "assets/.*",
      "\.js$",
      "\.map$",
      "\.ico$",
      "\.png$",
      "\.jpg$",
      "\.jpeg$",
      "\.gif$",
      "offline\.html$",
      "webmanifest$",
      "manifest\.json",
      "service-worker\.js$",
      "googlebe4b1abe81ab7cf3\.html$",
      { request: "robots.txt", dist: "assets/robots.txt" },
      { request: "Ads.txt", dist: "assets/Ads.txt" },
      { request: "ads.txt", dist: "assets/Ads.txt" },
    ]);


    // const ssrFilter = new SSRFilter(ssrOption);
    const ssrFilter = new SSRDomParserFilter(ssrOption);
    // const ssrFilter = new SSRLinkDomDomFilter(ssrOption);

    const option = new HttpSSRServerOption(
      {
        listen: environment.httpServerConfig.listen,
        noSuchRouteEndPointMappingThrow: () => new NotFoundError(),
        globalAdvice: new GlobalAdvice(),
        requestEndPoints: [
          new RequestLogEndPoint(),
          new CrossDomainHeaderEndPoint({
            accessControlExposeHeaders: "Set-Cookie",
            accessControlAllowHeaders: "*",
            accessControlAllowMethods: "*",
            accessControlAllowOrigin: "*",
          }),
        ],
        closeEndPoints: [new CloseLogEndPoint()],
        errorEndPoints: [new ErrorLogEndPoint()],
        filters: [datasResourceFilter, resourceFilter, ssrFilter, IntentSchemeFilter],
      },
      {
        rootRouter: RootRouter,
      },
    );

    option.listen.hostname = "0.0.0.0";
    option.listen.port = 8082;
    option.listen.listeningListener = (server: SimpleBootHttpServer) => {
      console.log(`http server startUP! listening on ${server.option.address}`);
    };

    const ssr = new SimpleBootHttpSSRServer(option);
    await ssr.run();
    return ssr;
  }
}

new Server().run().then((ssr) => {
  console.log(`server started!!`);
});
