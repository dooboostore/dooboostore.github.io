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
  const scriptsPath = path.join(__dirname, '../../../../datas/english/scripts/Jennie Is Obsessed With Her Met Gala Look | Met Gala 2025 With Emma Chamberlain | Vogue.json');
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