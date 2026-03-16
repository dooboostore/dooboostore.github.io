import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

// 출력 디렉토리
const OUTPUT_DIR = path.join(process.cwd(), '..', '..', '..', 'datas', 'youtube-persona', 'personas');
const PERSONAS_FILE = path.join(process.cwd(), '..', '..', '..', 'datas', 'youtube-persona', 'items.json');

interface Persona {
  persona: string;
  keywords: string[];
  categoryEmojis: string[];
}

interface VideoRecommendation {
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
}

interface PersonaResult {
  persona: string;
  keywords: string[];
  recommendations: VideoRecommendation[];
  timestamp: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createFreshBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  console.log('🚀 Creating fresh browser instance...');
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  // 완전히 새로운 컨텍스트 (캐시, 쿠키 없음)
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    // 캐시와 쿠키를 완전히 비활성화
    storageState: undefined
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
    (window as any).chrome = {
      runtime: {}
    };
  });

  const page = await context.newPage();
  
  return { browser, context, page };
}

async function searchKeywordInTab(context: BrowserContext, keyword: string, keywordIndex: number, totalKeywords: number): Promise<VideoRecommendation[]> {
  const page = await context.newPage();
  const videos: VideoRecommendation[] = [];
  
  // 전체 작업에 대한 타임아웃 (최대 30초)
  const timeoutPromise = new Promise<VideoRecommendation[]>((resolve) => {
    setTimeout(() => {
      console.log(`  [${keywordIndex + 1}/${totalKeywords}] ⏱️ Timeout - closing keyword tab`);
      resolve(videos);
    }, 50000);
  });
  
  const workPromise = (async (): Promise<VideoRecommendation[]> => {
    try {
      console.log(`  [${keywordIndex + 1}/${totalKeywords}] 🔍 Searching: ${keyword}`);
      
      // 검색 결과 페이지로 바로 이동
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // 검색 결과 대기
      await page.waitForSelector('ytd-video-renderer, ytd-rich-item-renderer', { timeout: 30000 });
      await delay(2000);
      
      // "동영상" 탭 클릭
      console.log(`  [${keywordIndex + 1}/${totalKeywords}] 📺 Clicking '동영상' tab...`);
      try {
        let tabClicked = false;
        
        // 방법 1: "동영상" 텍스트를 포함한 버튼 찾기
        const allButtons = await page.$$('button[role="tab"]');
        for (const button of allButtons) {
          const text = await button.textContent();
          if (text && text.trim() === '동영상') {
            await button.click();
            tabClicked = true;
            console.log(`  [${keywordIndex + 1}/${totalKeywords}] ✅ Clicked '동영상' tab (found by text)`);
            await delay(3000);
            break;
          }
        }
        
        // 방법 2: 위에서 실패하면 다른 셀렉터들 시도
        if (!tabClicked) {
          const videoTabSelectors = [
            'yt-chip-cloud-chip-renderer:has-text("동영상")',
            'yt-formatted-string:has-text("동영상")',
            '[title="동영상"]',
            'a[href*="sp=EgIQAQ"]' // 동영상 필터 URL 파라미터
          ];
          
          for (const selector of videoTabSelectors) {
            try {
              const tab = await page.$(selector);
              if (tab) {
                await tab.click();
                tabClicked = true;
                console.log(`  [${keywordIndex + 1}/${totalKeywords}] ✅ Clicked '동영상' tab (selector: ${selector})`);
                await delay(3000);
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        if (!tabClicked) {
          console.log(`  [${keywordIndex + 1}/${totalKeywords}] ⚠️ Could not find '동영상' tab, using default results`);
        }
      } catch (e: any) {
        console.log(`  [${keywordIndex + 1}/${totalKeywords}] ⚠️ Error clicking '동영상' tab: ${e.message}`);
      }
      
      // 스크롤해서 더 많은 영상 로드 (목표: 50개 이상)
      console.log(`  [${keywordIndex + 1}/${totalKeywords}] 📜 Scrolling to load more videos...`);
      let previousHeight = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 10; // 최대 10번 스크롤
      
      while (scrollAttempts < maxScrollAttempts) {
        // 현재 높이 확인
        const currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        
        // 더 이상 로드할 게 없으면 중단
        if (currentHeight === previousHeight) {
          console.log(`  [${keywordIndex + 1}/${totalKeywords}] ✅ No more content to load`);
          break;
        }
        
        previousHeight = currentHeight;
        
        // 페이지 끝까지 스크롤
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await delay(3000); // 로딩 대기
        
        scrollAttempts++;
        
        // 현재 로드된 영상 개수 확인
        const currentVideoCount = await page.$$eval('ytd-video-renderer', elements => elements.length);
        console.log(`  [${keywordIndex + 1}/${totalKeywords}] Scroll ${scrollAttempts}: ${currentVideoCount} videos loaded`);
        
        // 50개 이상 로드되면 중단
        if (currentVideoCount >= 50) {
          console.log(`  [${keywordIndex + 1}/${totalKeywords}] ✅ Loaded enough videos (${currentVideoCount})`);
          break;
        }
      }
      
      // 영상 링크 수집
      console.log(`  [${keywordIndex + 1}/${totalKeywords}] 📋 Collecting videos...`);
      const videoRenderers = await page.$$('ytd-video-renderer');
      console.log(`  [${keywordIndex + 1}/${totalKeywords}] Found ${videoRenderers.length} video renderers`);
      
      for (let i = 0; i < Math.min(videoRenderers.length, 50); i++) {
        try {
          const renderer = videoRenderers[i];
          
          // 1. 제목과 URL (a#video-title 안의 yt-formatted-string)
          const titleLink = await renderer.$('a#video-title');
          if (!titleLink) continue;
          
          const url = await titleLink.getAttribute('href');
          if (!url || !url.includes('/watch?v=')) continue;
          
          const videoIdMatch = url.match(/\/watch\?v=([^&]+)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : '';
          if (!videoId) continue;
          
          // 제목은 yt-formatted-string에서 가져오기
          const titleElement = await renderer.$('a#video-title yt-formatted-string');
          const title = titleElement ? (await titleElement.textContent())?.trim() || '' : '';
          if (!title) continue;
          
          // 2. 채널명과 채널 ID (ytd-channel-name #text-container yt-formatted-string a)
          let channel = '';
          let channelId = '';
          try {
            const channelLink = await renderer.$('ytd-channel-name #text-container yt-formatted-string a');
            if (channelLink) {
              channel = (await channelLink.textContent())?.trim() || '';
              const channelHref = await channelLink.getAttribute('href');
              if (channelHref) {
                // href는 "/@channelhandle" 또는 "/channel/UCxxxxx" 형식
                const channelMatch = channelHref.match(/\/@([^\/]+)|\/channel\/([^\/]+)/);
                if (channelMatch) {
                  channelId = channelMatch[1] || channelMatch[2] || '';
                }
              }
            }
          } catch (e) {
            // 무시
          }
          
          // 3. 채널 썸네일 (#channel-info a#channel-thumbnail yt-img-shadow img)
          let channelThumbnail = '';
          try {
            // 방법 1: #channel-info 안의 #channel-thumbnail img
            const channelThumbImg = await renderer.$('#channel-info a#channel-thumbnail yt-img-shadow img');
            if (channelThumbImg) {
              channelThumbnail = await channelThumbImg.getAttribute('src') || '';
            }
            
            // 방법 2: 더 간단한 셀렉터
            if (!channelThumbnail) {
              const channelThumbImg2 = await renderer.$('a#channel-thumbnail img#img');
              if (channelThumbImg2) {
                channelThumbnail = await channelThumbImg2.getAttribute('src') || '';
              }
            }
            
            // 방법 3: channelId가 UC로 시작하면 (채널 ID) 표준 URL 생성
            if (!channelThumbnail && channelId && channelId.startsWith('UC')) {
              channelThumbnail = `https://yt3.ggpht.com/ytc/${channelId}`;
            }
          } catch (e) {
            // 방법 4: 에러 발생 시에도 channelId로 시도
            if (channelId && channelId.startsWith('UC')) {
              channelThumbnail = `https://yt3.ggpht.com/ytc/${channelId}`;
            }
          }
          
          // 4. 썸네일 (여러 방법 시도)
          let thumbnail = '';
          try {
            // 방법 1: ytd-thumbnail a#thumbnail yt-image img
            const thumbnailImg = await renderer.$('ytd-thumbnail a#thumbnail yt-image img');
            if (thumbnailImg) {
              thumbnail = await thumbnailImg.getAttribute('src') || '';
            }
            
            // 방법 2: 더 간단한 경로
            if (!thumbnail) {
              const thumbnailImg2 = await renderer.$('ytd-thumbnail yt-image img');
              if (thumbnailImg2) {
                thumbnail = await thumbnailImg2.getAttribute('src') || '';
              }
            }
            
            // 방법 3: img 태그 직접 찾기
            if (!thumbnail) {
              const thumbnailImg3 = await renderer.$('ytd-thumbnail img.ytCoreImageHost');
              if (thumbnailImg3) {
                thumbnail = await thumbnailImg3.getAttribute('src') || '';
              }
            }
            
            // 방법 4: src가 없으면 videoId로 썸네일 URL 생성
            if (!thumbnail && videoId) {
              thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            }
          } catch (e) {
            // 방법 5: 에러 발생 시 videoId로 썸네일 URL 생성
            if (videoId) {
              thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            }
          }
          
          // 5. 메타데이터 (조회수, 업로드 시간)
          let viewCount = '';
          let publishedTime = '';
          try {
            // 방법 1: ytd-video-meta-block #metadata-line 안의 span들
            const metadataSpans = await renderer.$$('ytd-video-meta-block #metadata-line span.inline-metadata-item');
            if (metadataSpans.length >= 2) {
              viewCount = (await metadataSpans[0].textContent())?.trim() || '';
              publishedTime = (await metadataSpans[1].textContent())?.trim() || '';
            } else if (metadataSpans.length === 1) {
              // 하나만 있는 경우 (예: 조회수만 있거나 시간만 있는 경우)
              const text = (await metadataSpans[0].textContent())?.trim() || '';
              if (text.includes('조회수') || text.includes('회')) {
                viewCount = text;
              } else {
                publishedTime = text;
              }
            }
            
            // 방법 2: 위에서 못 가져왔으면 다른 경로 시도
            if (!viewCount && !publishedTime) {
              const metadataLine = await renderer.$('ytd-video-meta-block #metadata-line');
              if (metadataLine) {
                const allSpans = await metadataLine.$$('span.inline-metadata-item');
                if (allSpans.length >= 2) {
                  viewCount = (await allSpans[0].textContent())?.trim() || '';
                  publishedTime = (await allSpans[1].textContent())?.trim() || '';
                }
              }
            }
          } catch (e) {
            // 무시
          }
          
          // 6. 간략 내용 (description)
          let description = '';
          try {
            // 방법 1: metadata-snippet-text
            const descElement = await renderer.$('yt-formatted-string.metadata-snippet-text');
            if (descElement) {
              description = (await descElement.textContent())?.trim() || '';
            }
            
            // 방법 2: metadata-snippet-container 안에서 찾기
            if (!description) {
              const descElement2 = await renderer.$('.metadata-snippet-container yt-formatted-string.metadata-snippet-text');
              if (descElement2) {
                description = (await descElement2.textContent())?.trim() || '';
              }
            }
            
            // 방법 3: #description-text (hidden이 아닌 경우)
            if (!description) {
              const descElement3 = await renderer.$('yt-formatted-string#description-text');
              if (descElement3) {
                const isHidden = await descElement3.getAttribute('hidden');
                if (!isHidden) {
                  description = (await descElement3.textContent())?.trim() || '';
                }
              }
            }
          } catch (e) {
            // 무시
          }
          
          videos.push({
            title,
            channel,
            channelId,
            channelThumbnail,
            videoId,
            thumbnail,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            viewCount,
            publishedTime,
            description
          });
          
        } catch (e) {
          continue;
        }
      }
      
      console.log(`  [${keywordIndex + 1}/${totalKeywords}] ✅ Collected ${videos.length} videos`);
      return videos;
      
    } catch (error: any) {
      console.log(`  [${keywordIndex + 1}/${totalKeywords}] ⚠️ Error: ${error.message}`);
      return videos;
    }
  })();
  
  // 작업 완료 또는 타임아웃 중 먼저 끝나는 것 대기
  const result = await Promise.race([workPromise, timeoutPromise]);
  
  // 반드시 페이지 닫기
  try {
    await page.close();
  } catch (e) {
    console.log(`  [${keywordIndex + 1}/${totalKeywords}] ⚠️ Failed to close page`);
  }
  
  return result;
}

async function processPersona(persona: Persona): Promise<PersonaResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎭 Processing Persona: ${persona.persona}`);
  console.log(`${'='.repeat(80)}`);
  
  const { browser, context, page } = await createFreshBrowser();
  
  try {
    // 1. 유튜브 홈 페이지 접속
    console.log('🌐 Navigating to YouTube...');
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await delay(3000);
    
    // 2. 각 키워드를 병렬로 검색하고 결과 수집
    console.log(`\n🔎 Searching ${persona.keywords.length} keywords in parallel...`);
    
    const keywordPromises = persona.keywords.map((keyword, index) => {
      return searchKeywordInTab(context, keyword, index, persona.keywords.length);
    });
    
    // 모든 키워드 검색 완료 대기
    const keywordResults = await Promise.all(keywordPromises);
    
    // 모든 키워드의 결과를 하나로 합치기
    const allRecommendations: VideoRecommendation[] = [];
    keywordResults.forEach(videos => {
      allRecommendations.push(...videos);
    });
    
    // 중복 제거 (videoId 기준)
    const uniqueRecommendations = Array.from(
      new Map(allRecommendations.map(v => [v.videoId, v])).values()
    );
    
    console.log(`\n✅ All keywords completed!`);
    console.log(`   - Total videos collected: ${allRecommendations.length}`);
    console.log(`   - Unique videos: ${uniqueRecommendations.length}`);
    
    const result: PersonaResult = {
      persona: persona.persona,
      keywords: persona.keywords,
      recommendations: uniqueRecommendations,
      timestamp: new Date().toISOString()
    };
    
    console.log(`\n✅ Completed persona: ${persona.persona}`);
    console.log(`   - Keywords searched: ${persona.keywords.length}`);
    console.log(`   - Recommendations collected: ${uniqueRecommendations.length}`);
    
    return result;
    
  } catch (error: any) {
    console.error(`❌ Error processing persona "${persona.persona}": ${error.message}`);
    
    return {
      persona: persona.persona,
      keywords: persona.keywords,
      recommendations: [],
      timestamp: new Date().toISOString()
    };
    
  } finally {
    await context.close();
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

async function main() {
  console.log('🎬 YouTube Persona Recommendation Collector (Parallel Mode)');
  console.log('='.repeat(80));
  
  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // 페르소나 데이터 로드
  if (!fs.existsSync(PERSONAS_FILE)) {
    console.error(`❌ Personas file not found: ${PERSONAS_FILE}`);
    process.exit(1);
  }
  
  const personas: Persona[] = JSON.parse(fs.readFileSync(PERSONAS_FILE, 'utf-8'));
  console.log(`📋 Loaded ${personas.length} personas`);
  
  // 동시 처리할 페르소나 수 (너무 많으면 메모리 부족 가능)
  const CONCURRENT_PERSONAS = 3;
  
  const results: PersonaResult[] = [];
  
  // 페르소나를 배치로 나누어 병렬 처리
  for (let batchStart = 0; batchStart < personas.length; batchStart += CONCURRENT_PERSONAS) {
    const batch = personas.slice(batchStart, batchStart + CONCURRENT_PERSONAS);
    const batchNumber = Math.floor(batchStart / CONCURRENT_PERSONAS) + 1;
    const totalBatches = Math.ceil(personas.length / CONCURRENT_PERSONAS);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📦 Batch ${batchNumber}/${totalBatches}: Processing ${batch.length} personas in parallel...`);
    console.log(`${'='.repeat(80)}`);
    
    // 배치 내 페르소나들을 병렬로 처리
    const batchPromises = batch.map((persona, index) => {
      const globalIndex = batchStart + index;
      console.log(`[${globalIndex + 1}/${personas.length}] Starting: ${persona.persona}`);
      return processPersona(persona);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // 결과 저장 (개별 파일 - 배열 형태로)
    batchResults.forEach((result) => {
      const personaFileName = result.persona.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
      const personaFilePath = path.join(OUTPUT_DIR, `${personaFileName}.json`);
      
      // 배열 형태로 저장
      fs.writeFileSync(personaFilePath, JSON.stringify(result.recommendations, null, 2), 'utf-8');
      console.log(`💾 Saved: ${personaFileName}.json (${result.recommendations.length} videos)`);
    });
    
    // 배치 간 대기 (1초)
    if (batchStart + CONCURRENT_PERSONAS < personas.length) {
      console.log('\n⏳ Waiting 1 second before next batch...');
      await delay(1000);
    }
  }
  
  // 요약 출력
  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary');
  console.log('='.repeat(80));
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.persona}`);
    console.log(`   - Keywords: ${result.keywords.length}`);
    console.log(`   - Recommendations: ${result.recommendations.length}`);
    console.log(`   - File: ${result.persona.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50)}.json`);
  });
  
  console.log('\n🎉 All personas processed successfully!');
  console.log(`📁 Results saved in: ${OUTPUT_DIR}`);
}

main().catch(console.error);
