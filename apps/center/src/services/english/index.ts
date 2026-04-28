import VoiceServiceFactory from './VoiceService';
import DictionaryServiceFactory from './DictionaryService';
import AutoTranslationServiceFactory from './AutoTranslationService';
import VideoItemServiceFactory from './VideoItemService';

export { VoiceService } from './VoiceService';
export { DictionaryService } from './DictionaryService';
export { AutoTranslationService } from './AutoTranslationService';
export { VideoItemService } from './VideoItemService';

export const englishServiceFactories = [
  VoiceServiceFactory,
  DictionaryServiceFactory,
  AutoTranslationServiceFactory,
  VideoItemServiceFactory
];

export default (container: symbol) => {
  return englishServiceFactories.map(factory => factory(container));
};
