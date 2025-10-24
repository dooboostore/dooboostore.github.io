import {
  FieldType,
  FlatJoinKeyType,
  FlatJoinSlashKeyExcludeStartWithUnderBar,
} from "@dooboostore/core/types";
import { Expression } from "@dooboostore/core/expression/Expression";

export namespace MenuConfig {
  export type PackageMenu ={category: 'framework' | 'library' | 'core' | 'other'};
  export const isPackageMenu = (menu: any): menu is PackageMenu => {
    return (
      menu &&
      typeof menu === "object" &&
      "category" in menu &&
      ["framework", "library", "core", "other"].includes(menu.category)
    );
  };
  export type MenuInfo<T = any> = {
    _data?: T;
    [key: string]: MenuInfo<any> | T | undefined; // key의 타입을 더 유연하게 만듭니다.
  };

  export type FindPathResponse = {
    menuPath: string;
    path: string;
    menuInfo: MenuInfo;
  };


  export const menuConfig = { // menuConfig의 타입을 MenuInfo로 지정합니다.
    "": {},
    worlds: {
      "${world}": {},
    },
    '@dooboostore': {
      "": {} satisfies MenuInfo,
      core: {_data: {category:'core'}} satisfies MenuInfo<PackageMenu>,
      "core-node": {_data: {category:'core'}} satisfies MenuInfo<PackageMenu>,
      "core-web": {_data: {category:'core'}} satisfies MenuInfo<PackageMenu>,
      "dom-parser": {_data: {category:'library'}} satisfies MenuInfo<PackageMenu>,
      "dom-render": {_data: {category:'library'}} satisfies MenuInfo<PackageMenu>,
      "simple-boot": {_data: {category:'framework'}} satisfies MenuInfo<PackageMenu>,
      "simple-boot-front": {_data: {category:'framework'}} satisfies MenuInfo<PackageMenu>,
      "simple-boot-http-server": {_data: {category:'framework'}} satisfies MenuInfo<PackageMenu>,
      "simple-boot-http-server-ssr": {_data: {category:'framework'}} satisfies MenuInfo<PackageMenu>,
      swt: {_data: {category:'library'}} satisfies MenuInfo<PackageMenu>,
    } satisfies MenuInfo
  };
  // const menuData: {[key in `/${FlatJoinKeyType<typeof menuConfig, "/">}`]?: any} = {
  //   "/packages/core": {category: 'core'} satisfies PackageMenu,
  //   "/packages/core-web": {category: 'core'} satisfies PackageMenu,
  //   "/packages/dom-render": {category: 'library'} satisfies PackageMenu,
  //   "/packages/simple-boot": {category: 'framework'} satisfies PackageMenu,
  //   "/packages/simple-boot-front": {category: 'framework'} satisfies PackageMenu,
  //   "/packages/simple-boot-http-server": {category: 'framework'} satisfies PackageMenu,
  //   "/packages/simple-boot-http-server-ssr": {category: 'framework'} satisfies PackageMenu,
  //   "/packages/swt": {category: 'library'} satisfies PackageMenu,
  // }





  export const path = (
    k: `/${keyof FlatJoinSlashKeyExcludeStartWithUnderBar<typeof menuConfig>}` ,
    bindData?: any,
  ): FindPathResponse => {
    const keys = k.split("/");
    keys.shift(); // '' 제거 /
    let current: any = menuConfig;
    for (const key of keys) {
      if (key in current) {
        current = current[key];
      } else {
        throw new Error("not found menu");
        // return null;
      }
    }
    const data = {
      menuPath: k,
      path: bindData ? Expression.bindExpression(k, bindData) : k,
      menuInfo: current,
    };
    console.log("----------->", data);
    return data;
  };
  // const z = path('/')
}

// path('worlds/${world}')
// path('')

// menuConfig['worlds']['${world}']

// import { Role } from '@metas/egrit-class-api/codes/Codes';
//
// import { FlatJoinSlashKeyExcludeStartWithUnderBar } from '@wonriedu/core-ts/types/utils/types';
// import { RouterStore } from 'next-app';
// import React, { ReactNode } from 'react';
// import { Params } from 'next/dist/shared/lib/router/utils/route-matcher';
// import { IronSessionService } from 'next-app/service/session/IronSessionService';
// import { BagIcon } from '@wonriedu/design-system/components/icons/BagIcon';
// import { BookOpenIcon } from '@wonriedu/design-system/components/icons/BookOpenIcon';
// import { GraphDonutIcon } from '@wonriedu/design-system/components/icons/GraphDonutIcon';
// import { PencilIcon } from '@wonriedu/design-system/components/icons/PencilIcon';
// import { UserIcon } from '@wonriedu/design-system/components/icons/UserIcon';
// import { UserGroupIcon } from '@wonriedu/design-system/components/icons/UserGroupIcon';
//
// export type MenuConfigFlatKey = `/${keyof FlatJoinSlashKeyExcludeStartWithUnderBar<typeof menuConfig>}` | '/';
// export type MenuSetType = { menu: MenuType; entries: MenuType[]; pathName: string; pathKeyName: MenuConfigFlatKey };
// export type EventTaxonomyDataType =
//   | object
//   | ((data: { params: Params; searchParams: Params; session?: IronSessionService.SessionDataType }) => object);
// type EventaxonomyRoute = { type: RouterStore.StoreItem['type']; name: string; data: EventTaxonomyDataType };
// type EventTaxonomyType = {
//   routes?: EventaxonomyRoute[];
// };
// export type MenuType = {
//   _title?: string;
//   _icon?: ReactNode;
//   _hidden?: boolean;
//   _eventTaxonomy?: EventTaxonomyType;
//   _hasRoles?: Role[];
//   _group?: string;
// } & {
//   [key: string]: string | ReactNode | EventTaxonomyType | Role[] | MenuType;
// };
//
// export const menuConfig = {
//   _title: 'root',
//   _eventTaxonomy: {
//     routes: [
//       { type: 'start', name: 'root-start', data: {} } as EventaxonomyRoute,
//       { type: 'complete', name: 'root-complete', data: {} } as EventaxonomyRoute
//     ]
//   },
//
//   auths: {
//     login: {},
//     ['reset-password']: {},
//     ['find-id']: {}
//   } satisfies MenuType,
//
//   policy: {
//     ['personal-infomation']: {},
//     terms: {}
//   } satisfies MenuType,
//
//   teacher: {
//     dashboard: {
//       _title: '학습 현황',
//       _icon: <PencilIcon $size="ds-icon-number-xs" $inverse={false} />,
//       _group: '수업',
//       'all-assignments': {
//         _title: '전체 과제 현황'
//       },
//       'all-correctness': {
//         _title: '전체 문제별 정답률'
//       },
//       problem: {
//         _title: '문제 상세'
//       }
//     },
//     student: {
//       _hidden: true,
//       '[academyStudentId]': {}
//     },
//     ['class-management']: {
//       _title: '클래스',
//       _group: '관리',
//       _icon: <UserGroupIcon $size="ds-icon-number-xs" $inverse={false} />,
//       '[classId]': {
//         _title: '클래스 상세'
//       }
//     },
//     ['task-management']: {
//       _title: '과제',
//       _group: '수업',
//       _icon: <BookOpenIcon $size="ds-icon-number-xs" $inverse={false} />,
//       assign: {
//         _title: '과제 배정하기'
//       },
//       create: {
//         _title: '과제 생성'
//       },
//       '[taskId]': {
//         _title: '과제 상세',
//         problems: {
//           _title: '문제 보기'
//         },
//         'sample-problems': {
//           _title: '문제 보기'
//         }
//       }
//     },
//     ['student-management']: {
//       _title: '학생',
//       _group: '관리',
//       _icon: <BagIcon $size="ds-icon-number-xs" $inverse={false} />
//     },
//     ['teacher-management']: {
//       _title: '선생님',
//       _group: '관리',
//       _icon: <UserIcon $size="ds-icon-number-xs" $inverse={false} />,
//       _hasRoles: [Role.ROLE_ACADEMY_TEACHER_MASTER, Role.ROLE_ACADEMY_TEACHER_MANAGER, Role.ROLE_ACADEMY_ADMIN]
//     }
//   } satisfies MenuType,
//   student: {
//     // _eventTaxonomy: {
//     //   routes: [
//     //     { type: 'start', data: { name: 'student-start' } } as EventaxonomyRoute,
//     //     { type: 'complete', data: { name: 'student-complete' } } as EventaxonomyRoute
//     //   ]
//     // },
//     task: {
//       _title: '내과제',
//       _icon: <PencilIcon $size="ds-icon-number-xs" $inverse={false} />,
//       '[allocatedDatetime]': {
//         _title: '과제 상세'
//         // problems: {
//         //   _title: '문제 보기'
//         // }
//       }
//     },
//     review: {
//       _title: '복습',
//       _icon: <BookOpenIcon $size="ds-icon-number-xs" $inverse={false} />,
//       incorrect: {},
//       vulnerable: {}
//     }
//   },
//   api: {
//     auths: {
//       ['session-refresh']: {
//         _title: '세션 갱신'
//       },
//       logout: {
//         _title: '로그아웃'
//       }
//     }
//   }
// } satisfies MenuType;
//
// export const childrenMenu = (menu: MenuType): MenuType[] => {
//   return Array.from(Object.entries(menu))
//     .filter(([key, value]) => !key.startsWith('_'))
//     .map(([key, value]) => value as MenuType);
// };
// export const pathByMenu = (paramMenu: MenuType): MenuSetType | undefined => {
//   let paths: string[] = [];
//   const loop = (loopMenu: MenuType) => {
//     for (const [key, value] of Object.entries(loopMenu)) {
//       if (key.startsWith('_')) {
//         continue;
//       }
//       const tMenu = value as MenuType;
//       if (paramMenu === tMenu) {
//         paths.push(key);
//         return true;
//       } else {
//         const sw = loop(value as MenuType);
//         if (sw) {
//           paths.push(key);
//           return true;
//         }
//       }
//     }
//   };
//   if (loop(menuConfig)) {
//     return menu(`/${paths.reverse().join('/')}` as MenuConfigFlatKey);
//   } else {
//     return undefined;
//   }
// };
//
// export const menuByPathname = (pathname: string): MenuSetType | undefined => {
//   return menu(pathname as MenuConfigFlatKey);
// };
// export const menu = (
//   pathKey: MenuConfigFlatKey,
//   config?: {
//     filterMenuType?: (menuType: MenuType) => boolean;
//     pathVariable?: Record<string, string | number | undefined>;
//   }
// ): MenuSetType | undefined => {
//   const entries: MenuType[] = [];
//   let targetMenu: MenuType = menuConfig;
//   entries.push(targetMenu);
//   if (pathKey === '/') {
//     return { menu: targetMenu, entries: entries, pathName: '/', pathKeyName: '/' };
//   }
//
//   const paths = [];
//   const pathKeys = pathKey.split('/').filter(it => !!it);
//   for (const it of pathKeys) {
//     const dynamic = Array.from(Object.keys(targetMenu)).find(it => it.startsWith('[') && it.endsWith(']'));
//     const tMenu = (targetMenu as any)[it] ?? (targetMenu as any)[dynamic ?? it];
//     if (tMenu && config?.filterMenuType) {
//       if (!config.filterMenuType(tMenu)) {
//         break;
//       }
//     }
//     entries.push(tMenu);
//     targetMenu = tMenu;
//     paths.push(dynamic ?? it);
//   }
//
//   if (targetMenu === menuConfig) {
//     return undefined;
//   }
//
//   const pathName = pathKey
//     .split('/')
//     .map(it => {
//       if (it.startsWith('[') && it.endsWith(']') && config?.pathVariable) {
//         return config.pathVariable[it.slice(1, -1)];
//       } else {
//         return it;
//       }
//     })
//     .join('/');
//   return {
//     menu: targetMenu,
//     entries: entries,
//     pathName: pathName,
//     pathKeyName: `/${paths.join('/')}` as MenuConfigFlatKey
//   };
// };
//
// // menu('/student/mypage/[code]');
