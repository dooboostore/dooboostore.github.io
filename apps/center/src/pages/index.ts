import RootRouter from './RootRouter';
import HomePage from './home/HomePage';
import EnglishListPage from './english/EnglishListPage';
import EnglishPlayerPage from './english/EnglishPlayerPage';
import StockFlightPage from './stock-flight/StockFlightPage';
import CoordinateSimulationPage from './coordinate-simulation/CoordinateSimulationPage';

export const pageFactories = [
  RootRouter,
  HomePage,
  EnglishListPage,
  EnglishPlayerPage,
  StockFlightPage,
  CoordinateSimulationPage
];