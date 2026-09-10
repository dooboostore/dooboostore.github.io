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
import StockTradingSimulationPage from './stock-trading-simulation/StockTradingSimulationPage';
import SimConfigForm from './stock-trading-simulation/components/SimConfigForm';
import SimCandleForm from './stock-trading-simulation/components/SimCandleForm';
import SimIndicatorForm from './stock-trading-simulation/components/SimIndicatorForm';
import TradeHistoryPopup from './stock-trading-simulation/components/TradeHistoryPopup';
import MathPage from './math/MathPage';
import MathVector from './math/components/MathVector';
import MathDot from './math/components/MathDot';
import MathNorm from './math/components/MathNorm';
import MathNormalize from './math/components/MathNormalize';
import MathRotate from './math/components/MathRotate';
import MathTrig from './math/components/MathTrig';
import MathProject from './math/components/MathProject';
import MathCross from './math/components/MathCross';

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
  StockTradingSimulationPage,
  SimConfigForm,
  SimCandleForm,
  SimIndicatorForm,
  TradeHistoryPopup,
  MathPage,
  MathVector,
  MathDot,
  MathNorm,
  MathNormalize,
  MathRotate,
  MathTrig,
  MathProject,
  MathCross,
];