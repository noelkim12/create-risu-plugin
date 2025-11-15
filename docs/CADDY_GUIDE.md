# Caddy 가이드

Risu Plugin 개발 시 Caddy를 사용하여 HTTPS 환경에서 WebSocket 연결을 테스트하는 방법을 안내합니다.

## 목차
- [Caddy란?](#caddy란)
- [사용 시나리오](#사용-시나리오)
- [설치 방법](#설치-방법)
- [프로젝트 설정](#프로젝트-설정)
- [개발 워크플로우](#개발-워크플로우)
- [문제 해결](#문제-해결)

---

## Caddy란?

**Caddy**는 자동 HTTPS를 지원하는 현대적인 웹 서버입니다.

### 주요 특징
- ✅ **자동 HTTPS**: Let's Encrypt를 통한 자동 인증서 발급 및 갱신
- ✅ **간편한 설정**: JSON 또는 Caddyfile 형식의 직관적인 설정
- ✅ **WebSocket 지원**: 역방향 프록시를 통한 WebSocket 연결 지원
- ✅ **HTTP/2 및 HTTP/3**: 최신 프로토콜 기본 지원

### 공식 웹사이트
- 홈페이지: https://caddyserver.com/
- 문서: https://caddyserver.com/docs/
- GitHub: https://github.com/caddyserver/caddy

---

## 사용 시나리오

### 1. 로컬 개발 서버를 도메인으로 접근
```
기존: ws://localhost:13131
변경: wss://dev.example.com/ws
```

### 2. HTTPS 환경에서 WebSocket 연결 테스트
- HTTPS 페이지에서는 `ws://` 대신 `wss://` (WebSocket Secure) 필수
- Caddy를 사용하면 로컬 개발 서버를 `wss://`로 쉽게 변환

---

## 설치 방법

### Windows

#### 방법 1: 터미널에서 설치
```powershell
scoop install caddy
```

#### 방법 2: 직접 다운로드
1. [Caddy 다운로드 페이지](https://caddyserver.com/download)에서 Windows용 다운로드
2. 압축 해제 후 `caddy.exe`를 PATH에 추가


### Linux

#### Debian/Ubuntu
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

#### Fedora/RHEL/CentOS
```bash
dnf install 'dnf-command(copr)'
dnf copr enable @caddy/caddy
dnf install caddy
```

### 설치 확인
```bash
caddy version
```

---

## 프로젝트 설정

### 1. create-risu-plugin 실행 시 Caddy 선택

프로젝트 생성 중 다음 질문에 답변:

```
📘 Caddy란?
Caddy는 자동 HTTPS를 지원하는 TLS종단기 입니다
개발 중인 플러그인을 HTTPS 도메인에서 테스트할 때 유용합니다.

🔗 사용 시나리오:
- 로컬 개발 서버를 도메인으로 접근 (예: wss://dev.example.com/ws)
- HTTPS 환경에서 WebSocket 연결 테스트
- 팀원과 로컬 개발 환경 공유

? Caddy를 사용하시겠습니까? (y/N)
```

**Yes 선택 시:**
1. 도메인 입력 (예: `dev.example.com`)
2. 이메일 입력 (선택사항, 인증서 만료 알림용)

### 2. 생성된 파일 구조

```
my-plugin/
├── caddy.config              # Caddy 설정 파일 (자동 생성됨)
├── caddy.config.template     # Caddy 설정 템플릿
├── package.json             # npm run dev에 Caddy 명령어 추가됨
├── vite.config.js           # WebSocket URL이 wss://도메인/ws로 설정됨
└── scripts/
    ├── dev-server.js        # WebSocket 서버
    └── vite-plugin-devmode.js # Hot Reload 플러그인
```

### 3. caddy.config 예시

```json
{
  email your-email@example.com
}

dev.example.com {
  # WebSocket 엔드포인트만 프록시
  @ws path /ws*
  reverse_proxy @ws 127.0.0.1:13131

  # 응답 압축
  encode zstd gzip
}
```

---

## 개발 워크플로우

### 1. DNS 설정

도메인을 서버 IP로 연결:

#### A 레코드 추가 (예: Cloudflare)
```
Type: A
Name: dev (또는 @)
Content: [서버 IP 주소]
Proxy status: DNS only (프록시 비활성화)
```

### 2. 개발 서버 시작

```bash
npm run dev
```

자동으로 다음 서비스가 시작됩니다:
1. **WebSocket 서버** (`dev-server.js`) - 포트 13131
2. **Vite 빌드** (watch 모드)
3. **Caddy 서버** - 자동 HTTPS 인증서 발급

### 3. 브라우저에서 접근

```
https://dev.example.com
```

### 4. Hot Reload 확인

소스 코드 수정 시:
1. Vite가 자동으로 빌드
2. dev-server가 변경 감지
3. WebSocket을 통해 브라우저에 알림 (`wss://dev.example.com/ws`)
4. 브라우저가 자동으로 새로고침

---

## 문제 해결

### 1. Caddy 인증서 발급 실패

**증상:**
```
caddy: automatic HTTPS: TLS failed to get certificate
```

**해결 방법:**
- 도메인의 DNS A 레코드가 올바른 IP로 설정되어 있는지 확인
- 방화벽에서 80/443 포트가 열려있는지 확인
- 이메일 주소가 유효한지 확인

### 2. WebSocket 연결 실패

**증상:**
```
[Hot Reload] WebSocket error: ...
```

**해결 방법:**
1. dev-server가 정상 실행 중인지 확인
   ```bash
   # 별도 터미널에서 확인
   lsof -i :13131  # macOS/Linux
   netstat -ano | findstr :13131  # Windows
   ```

2. caddy.config의 포트가 일치하는지 확인
   ```json
   reverse_proxy @ws 127.0.0.1:13131
   ```

3. 브라우저 개발자 도구의 Network 탭에서 WebSocket 연결 상태 확인

### 3. Caddy 실행 권한 오류 (Linux/macOS)

**증상:**
```
permission denied
```

**해결 방법:**
```bash
# 80/443 포트 바인딩 권한 부여
sudo setcap CAP_NET_BIND_SERVICE=+eip $(which caddy)
```

### 4. 포트 충돌

**증상:**
```
address already in use
```

**해결 방법:**
1. 다른 포트로 변경
   ```bash
   # caddy.config
   reverse_proxy @ws 127.0.0.1:13132  # 포트 변경
   ```

2. package.json 수정 없이 프로젝트 생성 시 포트 변경 가능

---

## 추가 리소스

- [Caddy 공식 문서](https://caddyserver.com/docs/)
- [Caddy Reverse Proxy 가이드](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Let's Encrypt 문서](https://letsencrypt.org/docs/)

---

## 기여 및 피드백

문제가 발생하거나 개선 사항이 있으면 [GitHub Issues](https://github.com/noelkim12/create-risu-plugin/issues)에 남겨주세요.
