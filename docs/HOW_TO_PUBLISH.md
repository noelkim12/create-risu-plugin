# create-risu-plugin npm 배포 가이드

이 문서는 `create-risu-plugin` CLI 툴을 npm에 배포하여 사용자들이 `npx create-risu-plugin` 명령어로 사용할 수 있도록 하는 전체 과정을 설명합니다.

## 📋 목차

1. [사전 준비사항](#1-사전-준비사항)
2. [Git 저장소 설정](#2-git-저장소-설정)
3. [npm 계정 설정](#3-npm-계정-설정)
4. [package.json 최종 확인](#4-packagejson-최종-확인)
5. [첫 배포 (Initial Publish)](#5-첫-배포-initial-publish)
6. [업데이트 배포](#6-업데이트-배포)
7. [배포 확인](#7-배포-확인)
8. [문제 해결](#8-문제-해결)

---

## 1. 사전 준비사항

### ✅ 필수 도구 설치

```bash
# Node.js 및 npm 버전 확인
node --version   # v14.0.0 이상 권장
npm --version    # v6.0.0 이상 권장

# Git 설치 확인
git --version
```

### ✅ 프로젝트 구조 확인

```
create-risu-plugin/
├── bin/
│   └── index.js           # CLI 진입점
├── lib/
│   └── createProject.js   # 메인 로직
├── templates/
│   ├── raw/               # Raw 템플릿
│   └── sample/            # Sample 템플릿 (선택)
├── docs/
│   └── HOW_TO_PUBLISH.md  # 이 문서
├── package.json
├── README.md
└── .gitignore
```

---

## 2. Git 저장소 설정

### 2-1. Git 초기화

```bash
# 프로젝트 루트에서 실행
cd d:\dev\risu-cli-builder

# Git 초기화 (이미 했다면 스킵)
git init

# .gitignore 파일 생성 (아직 없다면)
```

### 2-2. `.gitignore` 파일 생성

```bash
# .gitignore 내용
node_modules/
*.log
.DS_Store
.env
dist/
.vscode/
```

### 2-3. GitHub 저장소 생성

1. **GitHub에서 새 저장소 생성**
   - Repository name: `create-risu-plugin` (또는 원하는 이름)
   - Public 또는 Private 선택
   - **"Initialize this repository with:"는 모두 체크 해제** (이미 로컬에 파일이 있으므로)

2. **로컬 저장소 연결**

```bash
# GitHub에서 제공하는 remote URL 사용
git remote add origin https://github.com/YOUR_USERNAME/create-risu-plugin.git

# 또는 SSH 사용
git remote add origin git@github.com:YOUR_USERNAME/create-risu-plugin.git
```

### 2-4. 첫 커밋 및 푸시

```bash
# 모든 파일 추가
git add .

# 커밋
git commit -m "feat: initial commit - CLI scaffold builder"

# main 브랜치로 푸시
git branch -M main
git push -u origin main
```

---

## 3. npm 계정 설정

### 3-1. npm 계정 생성 (없는 경우)

1. [npmjs.com](https://www.npmjs.com/) 방문
2. **Sign Up** 클릭
3. 계정 정보 입력:
   - Username (영문, 소문자, 숫자, 하이픈만 가능)
   - Email
   - Password

### 3-2. 이메일 인증

- npm에서 보낸 인증 이메일 확인
- 인증 링크 클릭

### 3-3. npm 로그인

```bash
# 터미널에서 npm 로그인
npm login

# 입력 요청:
# Username: your-username
# Password: ********
# Email: your-email@example.com

# 로그인 확인
npm whoami
# 출력: your-username
```

### 3-4. 2FA (Two-Factor Authentication) 설정 (권장)

```bash
# npm 계정 보안을 위해 2FA 활성화 (선택사항이지만 강력 권장)
npm profile enable-2fa auth-and-writes
```

---

## 4. package.json 최종 확인

### 4-1. 필수 필드 확인

```json
{
  "name": "create-risu-plugin",
  "version": "1.0.0",
  "description": "CLI tool to scaffold RisuAI plugin projects",
  "main": "lib/createProject.js",
  "bin": {
    "create-risu-plugin": "./bin/index.js"
  },
  "type": "module",
  "keywords": [
    "risu-ai",
    "risu",
    "plugin",
    "cli",
    "scaffold",
    "generator",
    "template"
  ],
  "author": "Your Name <your-email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/create-risu-plugin.git"
  },
  "bugs": {
    "url": "https://github.com/YOUR_USERNAME/create-risu-plugin/issues"
  },
  "homepage": "https://github.com/YOUR_USERNAME/create-risu-plugin#readme",
  "engines": {
    "node": ">=14.0.0",
    "npm": ">=6.0.0"
  },
  "files": [
    "bin/",
    "lib/",
    "templates/"
  ],
  "dependencies": {
    "inquirer": "^9.0.0",
    "chalk": "^5.0.0",
    "execa": "^9.0.0",
    "fs-extra": "^11.0.0"
  }
}
```

### 4-2. 중요 필드 설명

| 필드 | 설명 | 필수 |
|------|------|------|
| `name` | npm 패키지 이름 (고유해야 함) | ✅ |
| `version` | 시맨틱 버전 (1.0.0) | ✅ |
| `bin` | CLI 명령어 정의 | ✅ |
| `files` | npm에 포함할 파일/폴더 | ✅ |
| `keywords` | 검색 최적화 | ⭐ 권장 |
| `repository` | GitHub 저장소 URL | ⭐ 권장 |
| `author` | 작성자 정보 | ⭐ 권장 |
| `license` | 라이선스 (MIT 권장) | ⭐ 권장 |

### 4-3. 패키지명 중복 확인

```bash
# npm에 이미 존재하는 패키지명인지 확인
npm search create-risu-plugin

# 또는 npm view로 확인
npm view create-risu-plugin

# 만약 이미 존재한다면:
# - 다른 이름으로 변경 (예: @your-username/create-risu-plugin)
# - 또는 scoped package 사용
```

---

## 5. 첫 배포 (Initial Publish)

### 5-1. 배포 전 체크리스트

```bash
# ✅ 1. 의존성 설치 확인
npm install

# ✅ 2. CLI 동작 테스트 (로컬)
node bin/index.js

# ✅ 3. 로컬 테스트 (npm link)
npm link
create-risu-plugin  # 실제 명령어 테스트
npm unlink -g create-risu-plugin

# ✅ 4. package.json 검증
npm pkg fix

# ✅ 5. 불필요한 파일 제외 확인
npm pack --dry-run
# 출력된 파일 목록을 확인하여 불필요한 파일이 포함되지 않았는지 체크
```

### 5-2. npm 배포 실행

```bash
# 배포 (첫 배포)
npm publish

# Scoped package인 경우 (예: @username/create-risu-plugin)
npm publish --access public
```

### 5-3. 배포 성공 메시지 예시

```
npm notice
npm notice 📦  create-risu-plugin@1.0.0
npm notice === Tarball Contents ===
npm notice 1.2kB  package.json
npm notice 3.4kB  README.md
npm notice 543B   bin/index.js
npm notice 5.6kB  lib/createProject.js
npm notice === Tarball Details ===
npm notice name:          create-risu-plugin
npm notice version:       1.0.0
npm notice filename:      create-risu-plugin-1.0.0.tgz
npm notice package size:  12.3 kB
npm notice unpacked size: 45.6 kB
npm notice shasum:        abc123...
npm notice integrity:     sha512-xyz...
npm notice total files:   15
npm notice
+ create-risu-plugin@1.0.0
```

---

## 6. 업데이트 배포

### 6-1. 버전 업데이트 규칙 (Semantic Versioning)

```bash
# Patch (버그 수정): 1.0.0 → 1.0.1
npm version patch

# Minor (새 기능): 1.0.1 → 1.1.0
npm version minor

# Major (Breaking Change): 1.1.0 → 2.0.0
npm version major
```

### 6-2. 업데이트 배포 워크플로우

```bash
# 1. 코드 수정 후 커밋
git add .
git commit -m "feat: add new feature"

# 2. 버전 업데이트 (자동으로 git tag 생성)
npm version minor -m "feat: version %s - add new feature"

# 3. GitHub에 푸시
git push origin main --tags

# 4. npm 배포
npm publish

# 5. 배포 확인
npm view create-risu-plugin
```

### 6-3. 배포 전 체크리스트

- [ ] README.md 업데이트
- [ ] CHANGELOG 작성 (선택)
- [ ] 로컬 테스트 완료 (`npm link`)
- [ ] Git 커밋 완료
- [ ] 버전 업데이트 (`npm version`)

---

## 7. 배포 확인

### 7-1. npm 웹사이트에서 확인

1. [npmjs.com](https://www.npmjs.com/) 접속
2. 패키지 검색: `create-risu-plugin`
3. 패키지 페이지 확인:
   - README가 제대로 표시되는지
   - 버전 정보가 올바른지
   - 다운로드 명령어 확인

### 7-2. CLI 명령어로 확인

```bash
# 패키지 정보 조회
npm view create-risu-plugin

# 설치 테스트 (다른 디렉토리에서)
cd /tmp
npx create-risu-plugin

# 또는 전역 설치 테스트
npm install -g create-risu-plugin
create-risu-plugin
npm uninstall -g create-risu-plugin
```

### 7-3. 다운로드 통계 확인

```bash
# npm 다운로드 횟수 확인
npm view create-risu-plugin downloads

# 또는 웹사이트에서 확인
# https://www.npmjs.com/package/create-risu-plugin
```

---

## 8. 문제 해결

### ❌ 문제: "Package name already exists"

**원인**: 이미 동일한 이름의 패키지가 npm에 존재

**해결**:
```bash
# 1. 다른 이름으로 변경
# package.json의 name 필드 수정

# 2. Scoped package 사용
{
  "name": "@your-username/create-risu-plugin"
}

# 배포 시
npm publish --access public
```

### ❌ 문제: "You do not have permission to publish"

**원인**: npm 로그인이 안 되었거나 권한 부족

**해결**:
```bash
# 1. 로그인 확인
npm whoami

# 2. 다시 로그인
npm logout
npm login

# 3. 배포 재시도
npm publish
```

### ❌ 문제: "bin file not found" (npx 실행 시)

**원인**: `bin/index.js` 파일이 실행 권한이 없거나 shebang이 없음

**해결**:
```bash
# 1. bin/index.js 첫 줄에 shebang 추가
#!/usr/bin/env node

# 2. 실행 권한 부여 (Linux/Mac)
chmod +x bin/index.js

# 3. package.json에 bin 필드 확인
{
  "bin": {
    "create-risu-plugin": "./bin/index.js"
  }
}
```

### ❌ 문제: "templates not found" (실행 시)

**원인**: `files` 필드에 templates 폴더가 포함되지 않음

**해결**:
```json
// package.json
{
  "files": [
    "bin/",
    "lib/",
    "templates/"
  ]
}
```

### ❌ 문제: npm publish가 느리거나 실패

**원인**: 네트워크 문제 또는 큰 파일 포함

**해결**:
```bash
# 1. .npmignore 또는 .gitignore 확인
# 2. 불필요한 파일 제외
# 3. npm registry 변경 (Korea Mirror)
npm config set registry https://registry.npmjs.org/

# 4. 배포할 파일 확인
npm pack --dry-run
```

---

## 📝 추가 자료

### Semantic Versioning 가이드

- **MAJOR** (X.0.0): Breaking changes (기존 사용자에게 영향)
- **MINOR** (0.X.0): 새 기능 추가 (하위 호환성 유지)
- **PATCH** (0.0.X): 버그 수정 (하위 호환성 유지)

**예시**:
- `1.0.0` → `1.0.1`: 버그 수정
- `1.0.1` → `1.1.0`: 새 템플릿 추가
- `1.1.0` → `2.0.0`: CLI 인터페이스 변경

### npm Scripts 자동화 (선택사항)

```json
// package.json
{
  "scripts": {
    "prepublishOnly": "npm test && npm run lint",
    "version": "git add -A",
    "postversion": "git push && git push --tags"
  }
}
```

### GitHub Actions 자동 배포 (고급)

`.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## ✅ 체크리스트

배포 전 최종 확인:

- [ ] Git 저장소 생성 및 푸시 완료
- [ ] npm 계정 생성 및 로그인 완료
- [ ] package.json 모든 필드 작성 완료
- [ ] 로컬 테스트 (`npm link`) 완료
- [ ] 패키지명 중복 확인 완료
- [ ] `files` 필드에 필요한 파일 모두 포함
- [ ] `bin/index.js`에 shebang (`#!/usr/bin/env node`) 추가
- [ ] README.md 작성 완료
- [ ] .gitignore 설정 완료
- [ ] 첫 배포 실행 (`npm publish`)
- [ ] npx 명령어 테스트 완료

---

## 🎉 완료!

이제 전 세계 개발자들이 다음 명령어로 사용할 수 있습니다:

```bash
npx create-risu-plugin
```

**문의사항**:
- GitHub Issues: https://github.com/YOUR_USERNAME/create-risu-plugin/issues
- npm Package: https://www.npmjs.com/package/create-risu-plugin
