import RootRouter from './RootRouter';
import HomePage from './home/HomePage';
import Ros2Page from './ros2/Ros2Page';
import MlMarket from './ml/components/MlMarket';
import MlSplit from './ml/components/MlSplit';
import MlScaling from './ml/components/MlScaling';
import MlKnnReg from './ml/components/MlKnnReg';
import MlLinReg from './ml/components/MlLinReg';
import MlPolyReg from './ml/components/MlPolyReg';
import MlLogistic from './ml/components/MlLogistic';
import MlSgd from './ml/components/MlSgd';
import MlTree from './ml/components/MlTree';
import MlCvGrid from './ml/components/MlCvGrid';
import MlEnsemble from './ml/components/MlEnsemble';
import MlKMeans from './ml/components/MlKMeans';
import MlPca from './ml/components/MlPca';
import MlMlp from './ml/components/MlMlp';
import MlDeep from './ml/components/MlDeep';
import MlTrainNN from './ml/components/MlTrainNN';
import MlCnn from './ml/components/MlCnn';
import MlCnnViz from './ml/components/MlCnnViz';
import MlRnn from './ml/components/MlRnn';
import MlImdb from './ml/components/MlImdb';
import MlLstm from './ml/components/MlLstm';
import MlSupervised from './ml/components/MlSupervised';
import MlUnsupervised from './ml/components/MlUnsupervised';
import MlReinforcement from './ml/components/MlReinforcement';
import MlSelfSupervised from './ml/components/MlSelfSupervised';
import MlImitation from './ml/components/MlImitation';
import MlTransfer from './ml/components/MlTransfer';
import RosDistro from './ros2/components/RosDistro';
import RosInstall from './ros2/components/RosInstall';
import RosNode from './ros2/components/RosNode';
import RosPatterns from './ros2/components/RosPatterns';
import RosComm from './ros2/components/RosComm';
import RosParam from './ros2/components/RosParam';
import RosLaunch from './ros2/components/RosLaunch';
import RosDds from './ros2/components/RosDds';
import RosQos from './ros2/components/RosQos';
import RosCli from './ros2/components/RosCli';
import RosPkg from './ros2/components/RosPkg';
import RosBag from './ros2/components/RosBag';
import RosTf from './ros2/components/RosTf';
import RosSlam from './ros2/components/RosSlam';
import RosUrdf from './ros2/components/RosUrdf';
import RosEco from './ros2/components/RosEco';
import RosDesign from './ros2/components/RosDesign';
import RosMsgs from './ros2/components/RosMsgs';
import RosParamDict from './ros2/components/RosParamDict';
import RosControl from './ros2/components/RosControl';
import RosProvided from './ros2/components/RosProvided';
import RosSim from './ai/components/RosSim';
import AiPage from './ai/AiPage';
import EnglishListPage from './english/EnglishListPage';
import EnglishPlayerPage from './english/EnglishPlayerPage';
import TextEnglishListPage from './text-english/TextEnglishListPage';
import TextEnglishReaderPage from './text-english/TextEnglishReaderPage';
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
import MathInverse from './math/components/MathInverse';
import MathEigen from './math/components/MathEigen';
import MathQuadraticForm from './math/components/MathQuadraticForm';
import MathTranslate from './math/components/MathTranslate';
import MathDet from './math/components/MathDet';
import MathPCA from './math/components/MathPCA';
import MathLeastSquares from './math/components/MathLeastSquares';
import MathKabsch from './math/components/MathKabsch';
import MathRotationCompare from './math/components/MathRotationCompare';
import MathRotationMatrix from './math/components/MathRotationMatrix';
import MathSE3Chain from './math/components/MathSE3Chain';
import MathJacobian from './math/components/MathJacobian';
import MathPseudoinverse from './math/components/MathPseudoinverse';
import MathGraph from './math/components/MathGraph';
import MathKalman from './math/components/MathKalman';
import MathPidAngle from './math/components/MathPidAngle';
import MathFindGain from './math/components/MathFindGain';
import MathZieglerNichols from './math/components/MathZieglerNichols';
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
import PhysicalStaticTorque from './physical/components/PhysicalStaticTorque';
import PhysicalImu from './physical/components/PhysicalImu';
import PhysicalDof from './physical/components/PhysicalDof';
import PhysicalEncoder from './physical/components/PhysicalEncoder';
import PhysicalXm430 from './physical/components/PhysicalXm430';
import RamPricePage from './ram-price/RamPricePage';
import VisionPage from './vision/VisionPage';
import VisionSaturateWrap from './vision/components/VisionSaturateWrap';
import VisionColorSpace from './vision/components/VisionColorSpace';
import VisionFiltering from './vision/components/VisionFiltering';
import VisionMorphology from './vision/components/VisionMorphology';
import VisionPipeline from './vision/components/VisionPipeline';
import VisionPinhole from './vision/components/VisionPinhole';
import VisionIntrinsicK from './vision/components/VisionIntrinsicK';
import VisionLensDistortion from './vision/components/VisionLensDistortion';
import VisionCameraChain from './vision/components/VisionCameraChain';
import VisionPnP from './vision/components/VisionPnP';
import VisionReprojectionError from './vision/components/VisionReprojectionError';
import VisionMonocularAmbiguity from './vision/components/VisionMonocularAmbiguity';
import VisionDistanceSolutions from './vision/components/VisionDistanceSolutions';
import VisionHsvTuning from './vision/components/VisionHsvTuning';
import VisionContourFilter from './vision/components/VisionContourFilter';
import VisionEmaStabilize from './vision/components/VisionEmaStabilize';
import VisionDetectionRate from './vision/components/VisionDetectionRate';
import VisionPerfProfile from './vision/components/VisionPerfProfile';
import VisionCalibSetup from './vision/components/VisionCalibSetup';
import VisionCalibRms from './vision/components/VisionCalibRms';
import VisionCalibSanity from './vision/components/VisionCalibSanity';
import VisionCalibPnpUpgrade from './vision/components/VisionCalibPnpUpgrade';
import VisionRosPipeline from './vision/components/VisionRosPipeline';
import VisionCvBridge from './vision/components/VisionCvBridge';
import VisionBandwidthCalc from './vision/components/VisionBandwidthCalc';
import VisionQosCompare from './vision/components/VisionQosCompare';
import VisionPipelineIntegration from './vision/components/VisionPipelineIntegration';
import VisionBackProjection from './vision/components/VisionBackProjection';
import VisionPipelineValidation from './vision/components/VisionPipelineValidation';

export const pageFactories = [
  RootRouter,
  HomePage,
  Ros2Page,
  MlMarket,
  MlSplit,
  MlScaling,
  MlKnnReg,
  MlLinReg,
  MlPolyReg,
  MlLogistic,
  MlSgd,
  MlTree,
  MlCvGrid,
  MlEnsemble,
  MlKMeans,
  MlPca,
  MlMlp,
  MlDeep,
  MlTrainNN,
  MlCnn,
  MlCnnViz,
  MlRnn,
  MlImdb,
  MlLstm,
  MlSupervised,
  MlUnsupervised,
  MlReinforcement,
  MlSelfSupervised,
  MlImitation,
  MlTransfer,
  RosDistro,
  RosInstall,
  RosNode,
  RosPatterns,
  RosComm,
  RosParam,
  RosLaunch,
  RosDds,
  RosQos,
  RosCli,
  RosPkg,
  RosBag,
  RosTf,
  RosSlam,
  RosUrdf,
  RosEco,
  RosDesign,
  RosMsgs,
  RosParamDict,
  RosControl,
  RosProvided,
  RosSim,
  AiPage,
  EnglishListPage,
  EnglishPlayerPage,
  TextEnglishListPage,
  TextEnglishReaderPage,
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
  MathInverse,
  MathEigen,
  MathQuadraticForm,
  MathTranslate,
  MathDet,
  MathPCA,
  MathLeastSquares,
  MathKabsch,
  MathRotationCompare,
  MathRotationMatrix,
  MathSE3Chain,
  MathJacobian,
  MathPseudoinverse,
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
  MathZieglerNichols,
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
  PhysicalStaticTorque,
  PhysicalImu,
  PhysicalDof,
  PhysicalEncoder,
  PhysicalXm430,
  RamPricePage,
  VisionPage,
  VisionSaturateWrap,
  VisionColorSpace,
  VisionFiltering,
  VisionMorphology,
  VisionPipeline,
  VisionPinhole,
  VisionIntrinsicK,
  VisionLensDistortion,
  VisionCameraChain,
  VisionPnP,
  VisionReprojectionError,
  VisionMonocularAmbiguity,
  VisionDistanceSolutions,
  VisionHsvTuning,
  VisionContourFilter,
  VisionEmaStabilize,
  VisionDetectionRate,
  VisionPerfProfile,
  VisionCalibSetup,
  VisionCalibRms,
  VisionCalibSanity,
  VisionCalibPnpUpgrade,
  VisionRosPipeline,
  VisionCvBridge,
  VisionBandwidthCalc,
  VisionQosCompare,
  VisionPipelineIntegration,
  VisionBackProjection,
  VisionPipelineValidation,
];