# dooboostore.github.io
https://dooboostore.github.io/


# git submodule setting
```shell
git submodule init
git submodule update
```


# node setting
```shell
# 1. nvm이 없다면 설치 (이미 있다면 생략)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 터미널 재실행 또는 아래 명령어로 nvm 적용
source ~/.bashrc  # 사용 중인 셸에 따라 ~/.zshrc 일 수 있음

# 2. 최신 LTS 버전 Node.js 설치 및 사용
nvm install --lts
nvm use --lts

# 3. Node 버전 변경 확인 (v18 또는 v20 이상이어야 함)
node -v
```

# pnpm
```shell
# Node 버전을 올렸으니 pnpm을 다시 활성화/설치
corepack enable
# 또는
npm install -g pnpm

# 프로젝트 디렉토리에서 설치 재시도
pnpm install
```