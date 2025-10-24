# Breadcrumb Component

네비게이션 경로를 표시하는 breadcrumb 컴포넌트입니다. 단일 항목과 드롭다운 선택이 가능한 다중 항목을 지원합니다.

## 사용법

### 1. 컴포넌트 import

```typescript
import { BreadcrumbComponent } from '@src/component/breadcrumb';
```

### 2. 컴포넌트 사용

```typescript
// 컴포넌트 인스턴스 생성
const breadcrumbComponent = new BreadcrumbComponent();

// 부모 컴포넌트에서 사용
this.addChild(breadcrumbComponent);
```

### 3. TypeScript에서 데이터 설정

```typescript
import { BreadcrumbComponent, BreadcrumbItem, BreadcrumbData } from '@src/component/breadcrumb';

// 컴포넌트 참조 가져오기
const breadcrumbComponent = this.getChildren(BreadcrumbComponent)[0];

// 단일 항목들로 구성된 breadcrumb
const simpleItems: BreadcrumbData[] = [
  { text: 'dooboostore', icon: '🏠', link: '/' },
  { text: 'packages', icon: '📦', link: '/packages' },
  { text: 'simple-boot', icon: '⚡' } // 현재 페이지는 링크 없음
];

// 드롭다운이 포함된 breadcrumb
const complexItems: BreadcrumbData[] = [
  { text: 'dooboostore', icon: '🏠', link: '/' },
  [
    { text: 'packages', icon: '📦', link: '/packages' },
    { text: 'docs', icon: '📚', link: '/docs' },
    { text: 'examples', icon: '💡', link: '/examples' }
  ],
  { text: 'simple-boot', icon: '⚡' }
];

// 컴포넌트에 데이터 설정
breadcrumbComponent.setProps({
  items: complexItems,
  onNavigate: (link: string) => {
    console.log('Navigate to:', link);
    // 실제 네비게이션 로직 구현
    window.location.href = link;
  }
});
```

## 타입 정의

```typescript
interface BreadcrumbItem {
  text: string;      // 표시될 텍스트
  icon?: string;     // 선택적 아이콘 (이모지 또는 텍스트)
  link?: string;     // 선택적 링크 URL
}

type BreadcrumbData = BreadcrumbItem | BreadcrumbItem[];

interface BreadcrumbProps {
  items: BreadcrumbData[];
  onNavigate?: (link: string) => void;
}
```

## 특징

- **단일 항목**: 일반적인 breadcrumb 항목
- **다중 항목**: 배열로 전달하면 드롭다운 선택 메뉴 표시
- **아이콘 지원**: 각 항목에 선택적으로 아이콘 추가 가능
- **링크 처리**: `onNavigate` 콜백으로 커스텀 네비게이션 로직 구현
- **반응형**: 다양한 화면 크기에 대응
- **다크 테마**: 자동으로 다크 테마 지원

## 스타일링

CSS 변수를 통해 커스터마이징 가능:

```css
:root {
  --primary-color: #667eea;
  --text-primary: #1f2937;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --background-color: #ffffff;
  --surface-color: #f8fafc;
  --border-color: #e5e7eb;
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
```