import { Sim } from '@dooboostore/simple-boot';
import { ConstructorType } from '@dooboostore/core';

export namespace OllamaService {
  export const SYMBOL = Symbol.for('OllamaService');
}

export interface OllamaServiceType {
  isAvailable(): Promise<boolean>;
  analyzeSentence(sentence: string): Promise<string>;
  clearCache(): void;
}

// 팩토리: Accommodation 패턴
export default (container: symbol): ConstructorType<OllamaServiceType> => {
  @Sim({ symbol: OllamaService.SYMBOL, container: container })
  class OllamaServiceImpl implements OllamaServiceType {
    private ollamaUrl = 'http://localhost:11434';
    private model = 'gemma4:latest';
    private analysisCache: Map<string, string> = new Map(); // 메모리 캐시
    private readonly CACHE_KEY = 'ollama_analysis_cache'; // localStorage 키
    private readonly CACHE_VERSION = 1; // 캐시 버전 (호환성 관리용)

    constructor() {
      // localStorage에서 캐시 로드
      this.loadCacheFromStorage();
    }

    /**
     * localStorage에서 캐시 로드
     */
    private loadCacheFromStorage(): void {
      try {
        const stored = localStorage.getItem(this.CACHE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          // 버전 확인
          if (data.version === this.CACHE_VERSION && data.cache) {
            this.analysisCache = new Map(Object.entries(data.cache));
            // removed debug log
          } else {
            // removed debug log
            this.clearCache();
          }
        }
      } catch (e) {
        console.error('[OllamaService] Failed to load cache from localStorage:', e);
        this.analysisCache.clear();
      }
    }

    /**
     * 캐시를 localStorage에 저장
     */
    private saveCacheToStorage(): void {
      try {
        const cacheObject = Object.fromEntries(this.analysisCache);
        const data = {
          version: this.CACHE_VERSION,
          timestamp: Date.now(),
          cache: cacheObject,
        };
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
        // removed debug log
      } catch (e) {
        console.error('[OllamaService] Failed to save cache to localStorage:', e);
      }
    }

    /**
     * Check if Ollama server is available
     */
    async isAvailable(): Promise<boolean> {
      try {
        const response = await fetch(`${this.ollamaUrl}/api/tags`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        return response.ok;
      } catch (e) {
        console.error('Ollama server not available:', e);
        return false;
      }
    }

    /**
     * Analyze English sentence with word-by-word translation, structure, content, and examples
     * Returns cached result if available (from memory or localStorage)
     */
    async analyzeSentence(sentence: string): Promise<string> {
      // 메모리 캐시에서 확인
      if (this.analysisCache.has(sentence)) {
        return this.analysisCache.get(sentence)!;
      }

      const prompt = `${sentence} 단어별 문장 번역 및 구조, 내용, 예시 분석해줘, 최대한 현지인이 사용하는 자연스러운 예시 및 느낌으로`;

      try {
        const response = await fetch(`${this.ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            prompt: prompt,
            stream: false,
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json();
        const result = data.response || '';
        
        // 메모리 캐시에 저장
        this.analysisCache.set(sentence, result);
        
        // localStorage에 저장
        this.saveCacheToStorage();
        
        // removed debug log
        return result;
      } catch (e) {
        console.error('Failed to analyze sentence with Ollama:', e);
        throw e;
      }
    }

    /**
     * Clear the analysis cache (both memory and localStorage)
     */
    clearCache(): void {
      this.analysisCache.clear();
      localStorage.removeItem(this.CACHE_KEY);
    }
  }
  return OllamaServiceImpl;
};
