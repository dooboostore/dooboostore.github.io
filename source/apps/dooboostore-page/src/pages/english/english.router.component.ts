import { Router } from '@dooboostore/simple-boot/decorators/route/Router';
import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { Component } from '@dooboostore/simple-boot-front/decorators/Component';
import template from './english.router.component.html';
import styles from './english.router.component.css';
import { ComponentRouterBase } from '@dooboostore/simple-boot-front/component/ComponentRouterBase';
import { EnglishRouteComponent } from './english.route.component';
import { ChildrenSet, event, query } from '@dooboostore/dom-render/components/ComponentBase';
import { RawSet } from '@dooboostore/dom-render/rawsets/RawSet';
import { RoutingDataSet } from '@dooboostore/simple-boot/route/RouterManager';
import { OnCreateRenderDataParams } from '@dooboostore/dom-render/lifecycle/OnCreateRenderData';
import { OnCreatedOutletDebounce } from '@dooboostore/dom-render/components/ComponentRouterBase';
import { ValidUtils } from '@dooboostore/core-web/valid/ValidUtils';
import { SimFrontOption } from '@dooboostore/simple-boot-front/option/SimFrontOption';
import { ApiService } from '@dooboostore/simple-boot/fetch/ApiService';
import { PlayerRouteComponent } from '@src/pages/english/player/player.route.component';
import { OnCreateRender } from '@dooboostore/dom-render/lifecycle/OnCreateRender';
import { window } from 'rxjs';
import { VideoItem, VideoItemService } from '@src/service/english/VideoItemService';
import { VoiceService } from '@src/service/VoiceService';
import { environment } from '@back-end/environments/environment';

export type FavoriteWord = {
  text: string;
  meaning: string;
  addedAt: number;
};

export type Item = { name: string; type?: string; img: string; link?: string };

@Sim
@Router({
  path: '/english',
  route: {
    '': '/',
    '/': EnglishRouteComponent,
    '/{name}': PlayerRouteComponent,
    '/{name}/': PlayerRouteComponent

  },
  routers: []
})
@Component({
  template,
  styles
})
export class EnglishRouterComponent extends ComponentRouterBase implements OnCreatedOutletDebounce, OnCreateRender {
  favoriteWords: FavoriteWord[] = [];
  showFavorites = false;

  // Current item info
  currentItemName?: string;
  currentItem?: VideoItem;
  // items?: Item[];
  isInSubRoute = false; // Track if we're in a sub-route

  name='zzz'
  constructor(
    private config: SimFrontOption,
    private videoItemService: VideoItemService,
    private voiceService: VoiceService
  ) {
    super({ sameRouteNoApply: true });
  }


  onCreateRenderData(data: OnCreateRenderDataParams): void {
    super.onCreateRenderData(data);
    console.log('english.router.component onCreateRenderData-------');

  }

  onCreateRender(...param: any[]): void {
    console.log('english.router.component onCreateRender-------');
  }

  async onInitRender(param: any, rawSet: RawSet) {
    await super.onInitRender(param, rawSet);
    this.name = new Date().toISOString();
    console.log('english.router.component onInitRender-------');
    // Load favorite words from localStorage
    this.loadFavoriteWords();

    // Initialize speech synthesis voices
    this.initializeSpeechSynthesis();


  }

  async onRouting(r: RoutingDataSet): Promise<void> {
    await super.onRouting(r);

    this.currentItemName = decodeURIComponent(r.routerModule.pathData?.name??'');
    this.currentItem = this.currentItemName ? await this.videoItemService.item(this.currentItemName) : undefined;


    if (this.config?.window) {
      const doc = this.config.window.document;
      const setMetaByProperty = (property: string, content: string) => {
        const d = doc.querySelector(`meta[property="${property}"]`);
        doc.querySelector(`meta[property="${property}"]`)?.setAttribute('content', content);
      };
      const setMetaByName = (name: string, content: string) => {
        doc.querySelector(`meta[name="${name}"]`)?.setAttribute('content', content);
      };
      const setLink = (rel: string, href: string) => {
        doc.querySelector(`link[rel="${rel}"]`)?.setAttribute('href', href);
      };
      const setTitle = (title: string) => {
        doc.title = title;
      };
      let pageTitle = 'English Learning';
      let pageDescription = 'Learn English with videos, movies, and interactive content.';
      let pageUrl = environment.host + this.config.window.window.location.pathname;
      let pageImage = 'assets/images/dooboostore.png'

      if (this.currentItem) {
        // Page-specific SEO content
        pageTitle = this.currentItem.name;
        pageDescription = this.currentItem.name
        pageImage = this.currentItem.img;
        // Set Title, Description, Canonical URL
      }
      console.log('Setting SEO tags:', { pageTitle, pageDescription, pageUrl, pageImage });
      setTitle(pageTitle);
      setMetaByName('description', pageDescription);
      setLink('canonical', pageUrl);

      // Set Open Graph (OG) tags for social sharing
      setMetaByProperty('og:title', pageTitle);
      setMetaByProperty('og:description', pageDescription);
      setMetaByProperty('og:image', pageImage);
      setMetaByProperty('og:url', pageUrl);
      setMetaByProperty('og:type', 'website')
    }




    if (ValidUtils.isBrowser()) {
      // Get current item name from route
      // console.log('------->', r, this.currentItemName);
      // Check if we're in a sub-route (has name parameter)
      this.isInSubRoute = !!this.currentItemName;
    }
  }

  onCreatedThisChild(child: any, data: OnCreateRenderDataParams) {
    super.onCreatedThisChild(child, data);
  }

  onCreatedThisChildDebounce(childrenSet: ChildrenSet[]) {
    super.onCreatedThisChildDebounce(childrenSet);
  }

  onDrThisUnBind() {
    super.onDrThisUnBind();
    this.onDestroyRender();
  }

  onDestroyRender(data?: any) {
    super.onDestroyRender(data);
  }

  onCreatedOutletDebounce(a: any) {
    // Prism.highlightAll() 전체 하이라이트 제거
  }

  // Load favorite words from localStorage
  private loadFavoriteWords() {
    if (!ValidUtils.isBrowser()) return;

    try {
      const stored = localStorage.getItem('english-favorite-words');
      if (stored) {
        this.favoriteWords = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load favorite words:', error);
      this.favoriteWords = [];
    }
  }

  // Save favorite words to localStorage
  private saveFavoriteWords() {
    if (!ValidUtils.isBrowser()) return;

    try {
      localStorage.setItem('english-favorite-words', JSON.stringify(this.favoriteWords));
    } catch (error) {
      console.error('Failed to save favorite words:', error);
    }
  }

  // Add word to favorites
  addToFavorites = (word: string, meaning: string) => {

    // Check if word already exists
    const exists = this.favoriteWords.some(fav => fav.text.toLowerCase() === word.toLowerCase());
    if (exists) {
      console.log('Word already in favorites:', word);
      return false;
    }

    // Add new favorite word
    const newFavorite: FavoriteWord = {
      text: word,
      meaning: meaning,
      addedAt: Date.now()
    };

    this.favoriteWords.unshift(newFavorite); // Add to beginning
    this.saveFavoriteWords();

    console.log('Added to favorites:', word);
    return true;
  };

  // Remove word from favorites
  removeFavorite(word: string) {
    this.favoriteWords = this.favoriteWords.filter(fav => fav.text.toLowerCase() !== word.toLowerCase());
    this.saveFavoriteWords();
    console.log('Removed from favorites:', word);
  }

  // Check if word is in favorites
  isWordFavorite = (word: string): boolean => {
    return this.favoriteWords.some(fav => fav.text.toLowerCase() === word.toLowerCase());
  };

  // Toggle favorites panel
  toggleFavorites() {
    this.showFavorites = !this.showFavorites;
  }

  private initializeSpeechSynthesis() {
    // VoiceService handles initialization automatically
    console.log('🎤 Voice service initialized in router');
  }

  // Speak word using TTS
  speakWord(word: string) {
    if (!ValidUtils.isBrowser()) return;
    
    this.voiceService.speakWord(word);
  }

  // Handle word click in favorites
  onFavoriteWordClick(word: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.speakWord(word);
  }

  // Get arguments to pass to child components
  getChildArguments() {
    return {
      addToFavorites: this.addToFavorites,
      removeFavorite: this.removeFavorite.bind(this),
      isWordFavorite: this.isWordFavorite
    };
  }
}
