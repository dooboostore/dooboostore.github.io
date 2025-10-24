import * as fs from 'fs';
import * as path from 'path';

type Script = { t: string; e: string; k?: string };

interface PapagoResponse {
  items: Array<{
    entry: string;
    subEntry?: string;
    matchType: string;
    hanjaEntry?: string;
    phoneticSigns: Array<{
      type: string;
      sign: string;
    }>;
    pos: Array<{
      type: string;
      meanings: Array<{
        meaning: string;
        examples: Array<{
          text: string;
          translatedText: string;
        }>;
        originalMeaning: string;
      }>;
    }>;
    source: string;
    url: string;
    mUrl: string;
    expDicTypeForm: string;
    locale: string;
    conjugationList?: Array<{
      type: string;
      value: string;
    }>;
    aliasConjugation?: string;
    aliasConjugationPos?: string;
    gdid: string;
    expEntrySuperscript?: string;
  }>;
  examples: Array<{
    source: string;
    matchType: string;
    translatedText: string;
    text: string;
  }>;
  isWordType: boolean;
}

async function fetchDictionary(word: string): Promise<PapagoResponse | null> {
  try {
    const response = await fetch(`https://papago.naver.com/apis/dictionary/search?source=en&target=ko&text=${encodeURIComponent(word)}&locale=ko`, {
      headers: {
        "accept": "application/json",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "authorization": "PPG ffbaf550-ce4b-4478-ae20-ee54a0e3cd60:osbmloqg5zsFG4HjQw9Q/g==",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "pragma": "no-cache",
        "priority": "u=1, i",
        "sec-ch-ua": "\"Chromium\";v=\"141\", \"Not?A_Brand\";v=\"8\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "timestamp": Date.now().toString(),
        "x-apigw-partnerid": "papago",
        "x-ppg-ctype": "WEB_PC",
        "cookie": "NNB=ZFCDE4DECVCWQ; _ga_8P4PY65YZ2=GS2.1.s1749365250$o1$g0$t1749365250$j60$l0$h0; ba.uuid=4c6155ad-568d-4b70-bfac-a51e7da4bbcf; ASID=3b0589f40000019827bcdb750000001d; bnb_tooltip_shown_finance_v1=true; nid_inf=1370703916; NID_AUT=E3buFB8QgJooSHIfzL7Ld+geTyrXmLCKy7w2At1G9XIsRwB68eLJj8JM9DfH7c10; papago_skin_locale=ko; NAC=wn8sB0wPLZZf; NV_WETR_LAST_ACCESS_RGN_M=\"MDkzMjAxMDU=\"; NV_WETR_LOCATION_RGN_M=\"MDkzMjAxMDU=\"; _ga=GA1.2.1705893687.1749365250; page_uid=jnVZfdqosTCssbXglmsssssst6o-246428; NACT=1; SRT30=1761476750; NID_SES=AAAB4ffLijGoCeoSUyeytwLIdqOeD9paRwnb3UmUHSc7x8tNZYTorVkVKys51qFqLiY9q0gw+ZbOFEFYDPFnXHjifA2SiCtfPgDVmoyzPt9V8G8tbSHBMfjitzK32Ddjt5gTkwjJg3StgeiBdQujQ+ZJVuJ9LTec2aXjQarEDxUtOph8b1RVXP2zMthyaO4UFAJJjur4ScE+rXwrPC7YpzIsbEtSSw+dtCrqB0VsoWEdgKCxk/1Ig/23QOk9PjkhVSX/s3N7zMQxwSQeXKSIiLwpQo5xA/LpD0x3SA3Ks/baUJT9zC+z44++fsCcSZlRYuTzYdC0Mtgjrp7jCzW4R/oRwRJqwKEZRg95FbOR2db6T9Y6li8xNls/qAxUGKZQrN3E5fIrNbHmWfFA1GtbyE8hUay4rnyfWNjIjFxJPIkCNFG8P6vytL9wWzEt2jDDXxLeWQkE2hmxQ7m6AyE+wGaac+5K3sDdJlSafRq6MXU3h1ZvKTp0noe7pAq7qOEPNrqjhO31jn5oIzuTZstZh+BQZZ3K2lptzB3j+hcmm0LKZVCG/CkG//SulveNq24F9m3iQsKBeTF4Xph3LAmFZVHYCs0+7FRovz6Q3RgMahA8UrPKnAJg2i25ELp31S7lJO7PM5ZO5764+O9Vs3mLbPuAz+U=; SRT5=1761483361; BUC=UXePLDUkIBERy-fDDmOQtKIT6kO2Uxc_LbUVhQwBMTE=",
        "Referer": "https://papago.naver.com/"
      },
      method: "GET"
    });

    if (!response.ok) {
      console.log(`Failed to fetch dictionary for word: ${word}`);
      return null;
    }

    const data = await response.json() as PapagoResponse;
    return data;
  } catch (error) {
    console.error(`Error fetching dictionary for word: ${word}`, error);
    return null;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processScripts() {
  // const scriptsPath = path.join(__dirname, '../../../../datas/english/scripts/The Intern (2015).json');
  // const scriptsPath = path.join(__dirname, '../../../../datas/english/scripts/제니 영어 인터뷰 lzWF94mipFY.json');
  const scriptsPath = path.join(__dirname, '../../../../datas/english/scripts/Anya Taylor-Joy Breaks Down 13 Looks, From Queen\'s Gambit to the Golden Globes | Life in Looks.json');
  const dictionaryDir = path.join(__dirname, '../../../../datas/english/dictionary');
  
  // Create dictionary directory if it doesn't exist
  if (!fs.existsSync(dictionaryDir)) {
    fs.mkdirSync(dictionaryDir, { recursive: true });
  }

  try {
    // Read the script file
    const scriptsData = fs.readFileSync(scriptsPath, 'utf-8');
    const scripts: Script[] = JSON.parse(scriptsData);
    
    console.log(`Processing ${scripts.length} scripts...`);
    
    // Extract all unique words
    const allWords = new Set<string>();
    
    scripts.forEach(script => {
      const words = script.e
        .split(/\s+/)
        .map(word => word.replace(/[,.":!?;()]/g, '').toLowerCase())
        .filter(word => word.length > 0 && /^[a-zA-Z']+$/.test(word)); // English letters and apostrophes
      
      words.forEach(word => allWords.add(word));
    });
    
    console.log(`Found ${allWords.size} unique words`);
    
    let processedCount = 0;
    const totalWords = allWords.size;
    
    for (const word of allWords) {
      const dictionaryPath = path.join(dictionaryDir, `${word}.json`);
      
      // Skip if dictionary file already exists
      if (fs.existsSync(dictionaryPath)) {
        processedCount++;
        console.log(`[${processedCount}/${totalWords}] Skipping ${word} (already exists)`);
        continue;
      }
      
      console.log(`[${processedCount + 1}/${totalWords}] Fetching dictionary for: ${word}`);
      
      const dictionaryData = await fetchDictionary(word);
      
      if (dictionaryData) {
        // Save dictionary data to file
        fs.writeFileSync(dictionaryPath, JSON.stringify(dictionaryData, null, 2), 'utf-8');
        console.log(`✓ Saved dictionary for: ${word}`);
      } else {
        console.log(`✗ Failed to fetch dictionary for: ${word}`);
      }
      
      processedCount++;
      
      // Add delay to avoid rate limiting
      await delay(500); // 500ms delay between requests
    }
    
    console.log(`\nCompleted processing ${processedCount} words!`);
    
  } catch (error) {
    console.error('Error processing scripts:', error);
  }
}

// Run the script
processScripts();