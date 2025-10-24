import 'reflect-metadata';
import { SimpleApplication } from "@dooboostore/simple-boot/SimpleApplication";
import { IndexRouterComponent } from "@src/pages/index.router.component";
import { SimOption } from "@dooboostore/simple-boot/SimOption";
import { HttpPageDownloader } from "@dooboostore/core-node/fetch/HttpPageDownloader";
import { FileUtils } from "@dooboostore/core-node/file/FileUtils";
import { Promises } from "@dooboostore/core/promise/Promises";
import * as fs from "fs";
import * as path from "path";
import { Sim } from "@dooboostore/simple-boot/decorators/SimDecorator";
const httpServer = require('http-server');
console.log("Starting SSG Generator...");

@Sim
class SSGGenerator {
  private baseUrl = "http://localhost:8082"; // 개발 서버 URL
  private pageDownloader = new HttpPageDownloader(this.baseUrl);

  async generateStaticSite(outputDir: string, routes: string[]) {
    // this.outputDir = outputDir;
    console.log("Generating static site...",outputDir);

    // 출력 디렉토리 확인/생성
    FileUtils.mkdirSync(outputDir, { recursive: true });

    // bundle 복사
    this.copyBundle(outputDir);

    // assets 복사
    this.copyAssets(outputDir);

    // 각 라우트에 대해 HTML 생성
    // for (let route of routes) {
    //   await this.pageDownloader.downloadAndSave(outputDir, route)
    //   await Promises.sleep(50)
    // }
    // await Promise.all(routes.map(it => this.pageDownloader.downloadAndSaveAll(outputDir, [it])))
    await this.pageDownloader.downloadAndSaveAll(outputDir, routes);

    // for (let mapElement of routes.map(it => this.pageDownloader.downloadAndSaveAll(outputDir, [it]))) {
    //   console.log('start', mapElement);
    //   await mapElement;
    // //   await new Promise((r)=> setTimeout(r, 5000));
    // }

    this.makeSiteMapAndCopy(outputDir, routes);

    console.log("Static site generation completed!");
  }

  private makeSiteMapAndCopy(outputDir: string, routes: string[]) {
    const publicUrl = "https://dooboostore.github.io";
    const today = new Date().toISOString().split('T')[0];

    const urls = routes.map(route => {
      const safeRoute = route.startsWith('/') ? route : `/${route}`;
      const loc = `${publicUrl}${safeRoute === '/' ? '' : safeRoute}`;
      return `
  <url>
    <loc>${loc.replaceAll('&',' and ')}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.5</priority>
  </url>`;
    }).join('');

    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

    const sitemapPath = path.join(outputDir, 'sitemap.xml');
    FileUtils.write(sitemapContent, { path: sitemapPath });
    console.log(`Generated sitemap: ${sitemapPath}`);
  }

  private copyBundle(outputDir: string) {
    const source = path.resolve(__dirname, "../dist-front-end/bundle.js");
    const destination = path.join(outputDir, "bundle.js");
    console.log(`Copying bundle from ${source} to ${destination}`);
    if (fs.existsSync(destination)) {
      fs.rmSync(destination, { recursive: true, force: true });
    }
    FileUtils.copySync(source, destination, { recursive: true });
  }

  private copyAssets(outputDir: string) {
    const source = path.resolve(__dirname, "../dist-front-end/assets");
    const destination = path.join(outputDir, "assets");
    console.log(`Copying assets from ${source} to ${destination}`);
    if (fs.existsSync(destination)) {
      fs.rmSync(destination, { recursive: true, force: true });
    }
    FileUtils.copySync(source, destination, { recursive: true });
  }
}

const app = new SimpleApplication(
  new SimOption({ rootRouter: IndexRouterComponent }),
);
const manager = app.run();

const routingMap = app.routerManager.routingMap();
console.log('routingMap', routingMap);
const paths = Array.from(Object.keys(routingMap)).filter(it => it==='/' || !it.endsWith('/'));
const englishItems = FileUtils.readJsonSync<{name: string}[]>(path.resolve(__dirname, "../../../../datas/english/items.json"))
const financeItems = FileUtils.readJsonSync<{symbol: string}[]>(path.resolve(__dirname, "../../../../datas/finance/items.json"))
const youtubePersonaItems = FileUtils.readJsonSync<{persona: string}[]>(path.resolve(__dirname, "../../../../datas/youtube-persona/items.json"))
englishItems.forEach(it => {
  paths.push(`/english/${it.name}`);
});
// paths.length = 0;
financeItems.forEach(it => {
  paths.push(`/finance/${it.symbol}`);
});
youtubePersonaItems.forEach(it => {
  paths.push(`/youtube-persona/${it.persona}`);
});

console.log("Available routes:", paths);

// SSG 실행
const outputDir = path.resolve(__dirname, "../dist-generator-page");
const generator = app.sim(SSGGenerator);
// console.log('vvvvvvvvvvv');
if (generator) {
  generator
    // .generateStaticSite(outputDir, paths.filter(it=>it==='/@dooboostore/simple-boot-front'))
    .generateStaticSite(outputDir, paths)
    .then(() => {
      console.log("SERVE:", process.env.SERVE);
      if (process.env.SERVE === "true") {
        // outputDir을 기준으로 http-server 실행
        httpServer.createServer({ root: outputDir, autoIndex: true }).listen(8080, () => {
          console.log('start http server');
        })
      }
    })
    .catch(console.error);
}
