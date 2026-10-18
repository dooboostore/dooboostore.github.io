import VoiceServiceFactory from './VoiceService';
import DictionaryServiceFactory from './DictionaryService';
import AutoTranslationServiceFactory from './AutoTranslationService';
import VideoItemServiceFactory from './VideoItemService';
import TextTranslationServiceFactory from './TextTranslationService';

export { VoiceService } from './VoiceService';
export { DictionaryService } from './DictionaryService';
export { AutoTranslationService } from './AutoTranslationService';
export { VideoItemService } from './VideoItemService';
export { TextTranslationService } from './TextTranslationService';

export const englishServiceFactories = [
  VoiceServiceFactory,
  DictionaryServiceFactory,
  AutoTranslationServiceFactory,
  VideoItemServiceFactory,
  TextTranslationServiceFactory
];

export default (container: symbol) => {
  return englishServiceFactories.map(factory => factory(container));
};
