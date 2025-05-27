# Stata MCP Server (macOS)

Claude Desktop과 통합되는 Stata .do 파일 관리 및 실행을 위한 Model Context Protocol (MCP) 서버입니다.

## 기능

### 📁 파일 관리
- **browse_do_files**: 디렉토리의 .do 파일 목록 조회
- **read_do_file**: .do 파일 읽기
- **write_do_file**: .do 파일 생성 또는 덮어쓰기 (자동 백업 지원)

### ✏️ 파일 편집
- **edit_do_file**: .do 파일의 특정 섹션 편집
  - 변수 추가 (`add_variable`)
  - 분석 코드 추가 (`add_analysis`) 
  - 사용자 정의 섹션 삽입 (`insert_section`)

### 🚀 자동화
- **generate_do_template**: AI를 활용한 .do 파일 템플릿 생성
- **run_do_file**: Stata에서 .do 파일 실행 (macOS 지원)
- **run_do_selected_lines**: 선택된 라인만 실행 ⭐ NEW!

## 설치 완료 ✅

다음 구성으로 설치가 완료되었습니다:

- **프로젝트 경로**: `/Users/myoungkyulee/projects/stata-mcp-server`
- **Stata 경로**: `/Applications/Stata/StataBE.app/Contents/MacOS/StataBE`
- **작업 디렉토리**: `/Users/myoungkyulee/Documents/Stata`
- **Claude Desktop 설정**: `/Users/myoungkyulee/Library/Application Support/Claude/claude_desktop_config.json`

## 사용 방법

### 1. Claude Desktop 재시작
Claude Desktop을 완전히 종료하고 다시 시작하세요.

### 2. Claude Desktop에서 사용

```
"test.do 파일을 읽어서 보여줘"

"교육과 소득의 관계를 분석하는 do 파일을 만들어줘"

"현재 디렉토리의 모든 do 파일 목록을 보여줘"

"analysis.do 파일에 로지스틱 회귀분석을 추가해줘"

"test_sample.do 파일의 10번째부터 15번째 라인만 실행해줘"

"regression.do 파일의 회귀분석 부분만 따로 실행해줘"
```

### 3. 선택된 라인 실행 기능 ⭐

이제 do 파일의 특정 라인들만 선택해서 실행할 수 있습니다:

```
"analysis.do 파일의 5번째부터 10번째 라인만 실행해줘"
"데이터 로드 부분(라인 8-12)만 실행해서 테스트해줘"
```

이 기능은 다음과 같이 작동합니다:
1. 지정된 라인 범위를 추출
2. 임시 .do 파일 생성 (필요한 설정 자동 추가)
3. Stata에서 임시 파일 실행
4. 결과 반환 후 임시 파일 정리

## Do 파일 템플릿 구조

```stata
/*******************************************************************************
* 프로젝트: [분석 설명]
* 작성일: [현재 날짜]
* 작성자: Stata MCP Server (LLM Generated)
* 목적: [분석 목적]
*******************************************************************************/

* 초기 설정
clear all
set more off
capture log close
log using "logfile.log", replace

* 데이터 로드
* use "your_data.dta", clear

* 데이터 확인
describe
summarize

* 변수 생성 및 전처리
* generate new_var = .

* 기술통계
* tabulate var1

* 주요 분석
* regress y x1 x2 x3

* 결과 저장
* outreg2 using "results.doc", replace

log close
exit
```

## 테스트

서버가 정상 작동하는지 확인:

```bash
cd /Users/myoungkyulee/projects/stata-mcp-server
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

## 백업 시스템

- 파일 수정 시 자동 백업 생성
- 백업 위치: `$STATA_WORKSPACE/.stata-backups/`
- 형식: `filename.do.YYYY-MM-DDTHH-MM-SS-sssZ.bak`

## 문제 해결

### 일반적인 문제

1. **Claude Desktop에서 인식되지 않음**
   - Claude Desktop 완전 재시작
   - 설정 파일 경로 확인: `/Users/myoungkyulee/Library/Application Support/Claude/claude_desktop_config.json`

2. **Stata 실행 실패**
   - Stata 경로 확인: `/Applications/Stata/StataBE.app/Contents/MacOS/StataBE`
   - Stata 라이선스 확인

3. **권한 오류**
   - Documents/Stata 디렉토리 권한 확인
   - 파일 읽기/쓰기 권한 확인

### 로그 확인

```bash
# 서버 로그
cd /Users/myoungkyulee/projects/stata-mcp-server
node dist/index.js 2> server.log

# Stata 실행 로그
# .log 파일이 각 .do 파일과 함께 생성됨
```

## 개발

### 스크립트
```bash
npm run build      # TypeScript 컴파일
npm run dev        # 개발 모드 (watch)
npm run start      # 서버 시작
npm run clean      # 빌드 파일 정리
```

## 환경 변수

- **STATA_PATH**: Stata 실행 파일 경로
- **STATA_WORKSPACE**: Stata 작업 디렉토리

## 라이선스

MIT License

---

**Made with ❤️ for Sociology Research Team**

**Stata MCP Server 설치 완료!** 🎉

Claude Desktop을 재시작하고 사용해보세요.