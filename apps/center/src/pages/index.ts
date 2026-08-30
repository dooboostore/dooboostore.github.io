import RootRouter from './RootRouter';
import HomePage from './home/HomePage';
import EnglishListPage from './english/EnglishListPage';
import EnglishPlayerPage from './english/EnglishPlayerPage';
import StockFlightPage from './stock-flight/StockFlightPage';
import LottoPage from './lotto/LottoPage';
import CoordinateSimulationPage from './coordinate-simulation/CoordinateSimulationPage';
import BuybackPage from './buyback/BuybackPage';
import StockBrainCheckerPage from './stock-brain-checker/StockBrainCheckerPage';
import StockNptiPage from './stock-npti/StockNptiPage';
import StockCategoryRankingPage from './stock-category-ranking/StockCategoryRankingPage';

export const pageFactories = [
  RootRouter,
  HomePage,
  EnglishListPage,
  EnglishPlayerPage,
  StockFlightPage,
  LottoPage,
  CoordinateSimulationPage,
  BuybackPage,
  StockBrainCheckerPage,
  StockNptiPage,
  StockCategoryRankingPage,
];