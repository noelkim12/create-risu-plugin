# CADDY SUPPORT PLAN
1. 실시간 업데이트용 websocket 포트 설정 (숫자만, 미입력 시 13131)
2. Caddy 사용 여부 (Y/N)
- 프롬프트 출력 시 Caddy가 뭔지, 어디에 사용하는지 간단하게 설명 및 관련 가이드 markdown 문서 링크 제공
- Caddy 사용여부가 Y인 경우
    - 웹소켓 서버용 도메인 주소 입력받기
    - 프로젝트 루트 디렉토리에 caddy.config파일 작성 (caddy.config.template참조)
        - {{yourdomain}}을 입력받은 도메인으로 수정
        - {{yourport}}를 입력받은 포트로 수정
        - {{youremail}}을 입력받은 이메일로 수정
    - package.json 내부 내용 수정
        - npm run dev에 caddy run --config caddy.config 같이 실행하도록 추가
    - devmode 관련 플러그인 수정 (vite-plugin-devmode, webpack-plugin-devmode)
        - wssUrl을 입력받은 도메인으로 변경
        - wssUrl변경 시 caddy.config내의 엔드포인트를 고려하여 변경
- Caddy 사용여부가 N인 경우
    - 기존 프로세스 유지
3. 입력받은 포트 토대로 스크립트 수정
- 선택한 템플릿 내부의 대상 스크립트 수정
    - webpack-plugin-devmode.js 내부 defaultPort, actualPort 기본값 수정
    - dev-server.js 내부 DEFAULT_PORT 수정
4. 이 외 wss관련 수정이 필요한 내용이 있는지 체크크
