import { englishServiceFactories } from './english';
// 다른 서비스팩토리가 있다면 아래처럼 import
// import { xxxServiceFactories } from './xxx';

// 기존 호환성을 위해 필요한 개별 심볼도 유지
import { VideoItemService } from './english/VideoItemService';
import { AutoTranslationService } from './english/AutoTranslationService';
import { DictionaryService } from './english/DictionaryService';
import { VoiceService } from './english/VoiceService';
import { OllamaService } from './OllamaService';
import { StockService } from './stock/StockService';
import { LottoService } from './lotto/LottoService';
import { BuybackService } from './buyback/BuybackService';
import { TossService } from './toss/TossService';

import OllamaServiceFactory from './OllamaService';
import StockServiceFactory from './stock/StockService';
import LottoServiceFactory from './lotto/LottoService';
import BuybackServiceFactory from './buyback/BuybackService';
import TossServiceFactory from './toss/TossService';

// 모든 서비스팩토리 집합: 확장에 따라 추가
export const serviceFactories: ((s: symbol) => any)[] = [
  ...englishServiceFactories,
  OllamaServiceFactory,
  StockServiceFactory,
  LottoServiceFactory,
  BuybackServiceFactory,
  TossServiceFactory,
  // ...xxxServiceFactories, // 추가 가능
];

export const defineServices = async (container: symbol) => {
  serviceFactories.forEach(factory => factory(container));
};

export {
  VideoItemService,
  AutoTranslationService,
  DictionaryService,
  VoiceService,
  OllamaService,
  StockService,
  LottoService,
  BuybackService,
  TossService,
};
