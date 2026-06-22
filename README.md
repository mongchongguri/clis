# Clis

Clis는 로컬 프로젝트 폴더별 실행 작업을 저장하고, 버튼으로 실행/중지/상태 확인을 할 수 있는 Tauri 기반 데스크톱 앱입니다.

예를 들어 프론트엔드 프로젝트 폴더를 등록하고 `npm run dev` 작업을 저장하면, Clis에서 바로 실행하고 PID, 포트, 시작 시간, 실행 상태를 확인할 수 있습니다.

## 주요 기능

- 프로젝트 폴더별 작업 등록
- 그룹별 작업 관리
- 작업 실행/중지
- 실행 중 PID, 포트, 시작 시간 표시
- 감지된 포트 클릭 시 `http://localhost:{port}` 열기
- Git Bash, PowerShell, Windows Terminal 열기
- 기본 터미널 설정
- 하단 터미널 로그 패널 접기/펼치기
- 라이트/다크 테마 전환
- CPU, MEMORY, 네트워크 상태, 실행 중 작업 수 표시
- 인터넷 속도 측정 및 상세 정보 팝오버
- 개발 모드와 설치된 앱의 로컬 데이터 저장소 분리

## 개발 환경 준비

Clis는 Tauri 앱이라 Node.js뿐 아니라 Rust/Cargo와 Windows 빌드 도구가 필요합니다.

필수 항목:

- Node.js
- Rust/Cargo
- Microsoft Visual Studio 2022 Build Tools
- Microsoft Edge WebView2 Runtime

Rust 설치:

```powershell
winget install --id Rustlang.Rustup -e
```

Visual Studio Build Tools 설치:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e
```

설치 후 새 터미널에서 확인합니다.

```powershell
node --version
npm --version
cargo --version
rustc --version
```

`cargo` 또는 `rustc`가 안 보이면 터미널을 완전히 닫고 다시 열어야 합니다.

## 개발 실행

의존성 설치:

```powershell
npm install
```

개발 앱 실행:

```powershell
npm run dev
```

개발 실행 시 Vite 개발 서버와 Tauri 앱이 같이 실행됩니다.

## 빌드

설치 파일과 실행 파일 생성:

```powershell
npm run build
```

빌드 결과는 프로젝트 내부의 `src-tauri/target/release` 아래에 생성됩니다.

주요 산출물:

```text
src-tauri/target/release/clis.exe
src-tauri/target/release/bundle/nsis/Clis_0.1.2_x64-setup.exe
src-tauri/target/release/bundle/msi/Clis_0.1.2_x64_en-US.msi
```

## 설치 방법

빌드 후 아래 파일 중 하나로 설치할 수 있습니다.

NSIS 설치 파일:

```text
src-tauri/target/release/bundle/nsis/Clis_0.1.2_x64-setup.exe
```

MSI 설치 파일:

```text
src-tauri/target/release/bundle/msi/Clis_0.1.2_x64_en-US.msi
```

일반적으로 개인 PC에서 간단히 설치할 때는 NSIS 설치 파일을 사용하면 됩니다. MSI는 Windows 표준 설치 패키지라 회사 배포, 정책 배포, 관리형 설치에 더 적합합니다.

## 사용 방법

1. 상단의 작업 추가 영역을 펼칩니다.
2. 작업 이름, 실행 폴더, 실행할 작업을 입력합니다.
3. 그룹을 선택하거나 직접 입력합니다.
4. 저장 후 작업 목록에서 실행 아이콘을 누릅니다.
5. 실행 중이면 스피너가 표시되고, 가운데 중지 아이콘으로 중지할 수 있습니다.
6. 포트가 감지되면 PORT 값이 표시됩니다.
7. PORT 값을 클릭하면 기본 브라우저로 `localhost` 주소가 열립니다.

작업 예시:

```text
npm run dev
npm run start
pnpm dev
yarn dev
cargo run
python app.py
```

## 터미널 사용

작업별로 터미널 열기 아이콘을 사용할 수 있습니다.

지원 터미널:

- 기본 터미널
- Git Bash
- PowerShell
- Windows Terminal

작업에 터미널을 따로 선택하지 않으면 기본 터미널 설정을 사용합니다.

## 데이터 저장

작업 목록, 그룹, 기본 터미널, 테마 같은 앱 데이터는 로컬에 저장됩니다.

개발 모드와 설치된 앱은 저장소를 분리해서 사용합니다.

```text
개발 모드: clis.dev.local.v1
설치 앱: clis.prod.local.v1
```

따라서 `npm run dev`로 실행한 데이터와 설치된 exe/msi 앱에서 사용하는 데이터는 서로 섞이지 않습니다.

앱을 재설치하더라도 일반적으로 로컬 앱 데이터는 삭제되지 않습니다. 단, 사용자가 앱 데이터 폴더나 브라우저/WebView 저장 데이터를 직접 삭제하면 저장된 작업도 사라질 수 있습니다.

## 포트 감지

Clis는 실행 로그에서 `localhost:3000`, `http://127.0.0.1:5173`, Vite의 `Local: http://localhost:3000/` 같은 형태를 감지해 포트를 표시합니다.

일부 도구가 포트 정보를 출력하지 않거나 특수한 형식으로 출력하면 포트가 표시되지 않을 수 있습니다.

## 보안 및 실행 제한

Clis는 로컬 명령 실행 앱이기 때문에 실행 가능한 명령을 제한합니다.

허용 실행 파일 예시:

- `npm`
- `npx`
- `pnpm`
- `yarn`
- `node`
- `deno`
- `bun`
- `cargo`
- `python`
- `python3`
- `py`
- `go`
- `java`
- `mvn`
- `mvnw`
- `gradle`
- `gradlew`
- `dotnet`

차단되는 패턴 예시:

- `&&`
- `||`
- `|`
- `>`
- `<`
- `;`
- 백틱
- `$(` 형태의 명령 치환

명령은 셸 문자열로 통째로 넘기지 않고 실행 파일과 인자로 분리해서 실행합니다.

## 아이콘 및 설치 화면

앱 아이콘은 `src-tauri/icons` 아래에서 관리합니다.

아이콘을 다시 생성하려면:

```powershell
python scripts/generate_app_icon.py
```

NSIS 설치 화면 이미지는 `src-tauri/installer` 아래의 BMP 파일을 사용합니다.

```text
src-tauri/installer/header.bmp
src-tauri/installer/sidebar.bmp
```

설치 화면 이미지를 다시 생성하려면:

```powershell
python scripts/generate_installer_assets.py
```

## 문제 해결

`cargo metadata` 또는 `cargo: command not found` 오류가 나면 Rust/Cargo가 설치되지 않았거나 현재 터미널 PATH에 반영되지 않은 상태입니다. Rust를 설치한 뒤 터미널을 새로 열어 다시 실행합니다.

`could not compile serde`, `thiserror` 같은 Rust crate 빌드 오류가 나면 Visual Studio Build Tools의 C++ 빌드 도구가 필요할 수 있습니다.

설치 파일이 백신에서 `TR/Dropper.Gen` 같은 이름으로 탐지될 수 있습니다. 개인 개발자가 만든 서명되지 않은 설치 파일은 오탐이 발생할 수 있습니다. 배포용으로 사용할 경우 코드 서명 인증서를 적용하는 것이 좋습니다.

PowerShell이 바로 꺼지면 앱이 릴리즈 빌드인지, 터미널 실행 옵션이 `-NoExit`로 적용되어 있는지 확인합니다.
