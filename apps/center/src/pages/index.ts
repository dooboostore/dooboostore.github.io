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
import StockCategoryPage from './stock-category/StockCategoryPage';
import StockIndicatorPage from './stock-indicator/StockIndicatorPage';
import StockChartPage from './stock-chart/StockChartPage';
import GpuRentalPage from './gpu-rental/GpuRentalPage';
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
import MathRank from './math/components/MathRank';
import MathEigen from './math/components/MathEigen';
import MathTranslate from './math/components/MathTranslate';
import MathDet from './math/components/MathDet';
import MathPCA from './math/components/MathPCA';
import MathKabsch from './math/components/MathKabsch';
import MathRotationCompare from './math/components/MathRotationCompare';
import MathRotationMatrix from './math/components/MathRotationMatrix';
import MathSE3Chain from './math/components/MathSE3Chain';
import MathJacobian from './math/components/MathJacobian';
import MathGraph from './math/components/MathGraph';
import MathKalman from './math/components/MathKalman';
import MathPidAngle from './math/components/MathPidAngle';
import MathFindGain from './math/components/MathFindGain';
import MathFourier from './math/components/MathFourier';
import MathEpicycle from './math/components/MathEpicycle';
import MathEuler from './math/components/MathEuler';
import MathE from './math/components/MathE';
import MathEConverge from './math/components/MathEConverge';
import MathPID from './math/components/MathPID';
import MathNaturalNumber from './math/components/MathNaturalNumber';
import MathRealNumber from './math/components/MathRealNumber';
import MathImaginaryNumber from './math/components/MathImaginaryNumber';
import MathComplex from './math/components/MathComplex';
import MathDerivative from './math/components/MathDerivative';
import MathIntegral from './math/components/MathIntegral';
import MathLaplace from './math/components/MathLaplace';
import MathTimeConstant from './math/components/MathTimeConstant';
import MathDampingRatio from './math/components/MathDampingRatio';
import MathControlMap from './math/components/MathControlMap';
import MathGain from './math/components/MathGain';
import MathLoop from './math/components/MathLoop';
import MathRootLocus from './math/components/MathRootLocus';
import PhysicalPage from './physical/PhysicalPage';
import PhysicalGearRatio from './physical/components/PhysicalGearRatio';
import PhysicalImu from './physical/components/PhysicalImu';
import PhysicalDof from './physical/components/PhysicalDof';
import RamPricePage from './ram-price/RamPricePage';

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
  StockCategoryPage,
  StockIndicatorPage,
  StockChartPage,
  GpuRentalPage,
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
  MathRank,
  MathEigen,
  MathTranslate,
  MathDet,
  MathPCA,
  MathKabsch,
  MathRotationCompare,
  MathRotationMatrix,
  MathSE3Chain,
  MathJacobian,
  MathGraph,
  MathKalman,
  MathFourier,
  MathEpicycle,
  MathEuler,
  MathE,
  MathEConverge,
  MathPID,
  MathPidAngle,
  MathFindGain,
  MathNaturalNumber,
  MathRealNumber,
  MathImaginaryNumber,
  MathComplex,
  MathDerivative,
  MathIntegral,
  MathLaplace,
  MathTimeConstant,
  MathDampingRatio,
  MathControlMap,
  MathGain,
  MathLoop,
  MathRootLocus,
  PhysicalPage,
  PhysicalGearRatio,
  PhysicalImu,
  PhysicalDof,
  RamPricePage,
];