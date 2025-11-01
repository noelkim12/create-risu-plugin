# 빠른 시작 가이드 - npm 배포

`create-risu-plugin`을 npm에 배포하여 `npx create-risu-plugin` 명령어로 사용할 수 있도록 하는 빠른 가이드입니다.

## 🚀 5분 안에 배포하기

### 1️⃣ Git 저장소 생성 (GitHub)

```bash
# 1. GitHub에서 새 저장소 생성
# Repository name: create-risu-plugin
# Public으로 설정

# 2. 로컬에서 Git 초기화 및 연결
cd d:\dev\risu-cli-builder
git init
git remote add origin https://github.com/noelkim12/create-risu-plugin.git

# 3. package.json의 repository URL 업데이트
# "url": "git+https://github.com/noelkim12/create-risu-plugin.git"

# 4. 첫 커밋 및 푸시
git add .
git commit -m "feat: initial commit - CLI scaffold builder"
git branch -M main
git push -u origin main
```

### 2️⃣ npm 로그인

```bash
# npm 계정이 없다면 https://www.npmjs.com/ 에서 가입

# 로그인
npm login
# Username: your-username
# Password: ********
# Email: your-email@example.com

# 로그인 확인
npm whoami
```

### 3️⃣ 패키지명 중복 확인

```bash
# 패키지명이 이미 존재하는지 확인
npm view create-risu-plugin

# 만약 존재한다면 package.json의 name 변경:
# "name": "@your-username/create-risu-plugin"
```

### 4️⃣ 로컬 테스트

```bash
# CLI 동작 테스트
npm link
create-risu-plugin

# 테스트 완료 후 unlink
npm unlink -g create-risu-plugin
```

### 5️⃣ npm 배포

```bash
# 배포
npm publish

# Scoped package인 경우 (@your-username/create-risu-plugin)
npm publish --access public
```

### 6️⃣ 배포 확인

```bash
# npx로 테스트 (다른 디렉토리에서)
cd /tmp
npx create-risu-plugin

# npm 웹사이트에서 확인
# https://www.npmjs.com/package/create-risu-plugin
```

---

## 🔄 업데이트 배포

```bash
# 1. 코드 수정 후 커밋
git add .
git commit -m "feat: add new feature"

# 2. 버전 업데이트
npm version minor  # 1.0.0 → 1.1.0

# 3. Git 푸시
git push origin main --tags

# 4. npm 배포
npm publish
```

---

## ✅ 체크리스트

배포 전 확인:

- [ ] `.gitignore` 파일 생성 완료
- [ ] `package.json` 필수 필드 작성
  - [ ] name, version, description
  - [ ] bin, files
  - [ ] repository, author, license
- [ ] `bin/index.js`에 shebang (`#!/usr/bin/env node`) 있음
- [ ] Git 저장소 생성 및 푸시
- [ ] npm 로그인 완료
- [ ] 로컬 테스트 (`npm link`) 완료
- [ ] 패키지명 중복 확인

---

## 📚 상세 가이드

더 자세한 내용은 [HOW_TO_PUBLISH.md](./HOW_TO_PUBLISH.md)를 참조하세요.

## ❓ 문제 해결

### "Package name already exists"

```bash
# Scoped package로 변경
# package.json
{
  "name": "@your-username/create-risu-plugin"
}

# 배포
npm publish --access public
```

### "bin file not found"

```bash
# bin/index.js 첫 줄에 shebang 추가
#!/usr/bin/env node

# package.json 확인
{
  "bin": {
    "create-risu-plugin": "./bin/index.js"
  }
}
```

### "templates not found"

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

---

## 🎉 완료!

이제 전 세계 개발자들이 사용할 수 있습니다:

```bash
npx create-risu-plugin
```
