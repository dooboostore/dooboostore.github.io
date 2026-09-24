import process from 'process';
import { main } from './index';

main().catch(error => {
  console.error('❌ Fatal:', error?.message ?? error);
  process.exit(1);
});
