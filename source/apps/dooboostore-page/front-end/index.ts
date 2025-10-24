import 'reflect-metadata';
// console.log('----------', require.resolve("reflect-metadata"));
// console.log('---', Object.keys(require.cache).filter(p => p.includes("reflect-metadata")));
// if (!(Reflect as any).__MY_MARK__) {
//   (Reflect as any).__MY_MARK__ = Math.random();
// }
//
// console.log("Reflect mark:", (Reflect as any).__MY_MARK__);
import Factory, { MakeSimFrontOption } from '@src/bootfactory';
import { services } from './service';

const using = [...services]
Factory.create(MakeSimFrontOption(window), using).then(it => {
  it.run();
});
