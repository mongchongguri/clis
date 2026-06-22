use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    env,
    ffi::c_void,
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::FILETIME,
    NetworkManagement::{
        IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2},
        Ndis::IfOperStatusUp,
    },
    System::{
        SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
        Threading::GetSystemTimes,
    },
};

const MAX_LOG_LINES: usize = 800;
const MAX_COMMAND_LENGTH: usize = 500;
const MAX_TOKEN_COUNT: usize = 64;

#[derive(Default)]
struct AppState {
    tasks: Mutex<HashMap<String, ProcessEntry>>,
    system_cpu: Mutex<Option<CpuTimes>>,
    system_network: Mutex<Option<NetworkSample>>,
}

struct ProcessEntry {
    child: Arc<Mutex<Child>>,
    status: RuntimeStatus,
    logs: VecDeque<LogEntry>,
}

#[derive(Clone, Copy, Debug)]
struct CpuTimes {
    idle: u64,
    total: u64,
}

#[cfg(windows)]
#[derive(Clone, Copy, Debug)]
struct NetworkSample {
    online: bool,
    rx_bytes: u64,
    tx_bytes: u64,
    timestamp_ms: u128,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct RuntimeStatus {
    task_id: String,
    running: bool,
    pid: Option<u32>,
    port: Option<u16>,
    started_at: Option<u64>,
    exited_at: Option<u64>,
    exit_code: Option<i32>,
    error: Option<String>,
    last_output: Option<String>,
    last_error_output: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LogEntry {
    task_id: String,
    stream: String,
    line: String,
    timestamp: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CommandValidation {
    ok: bool,
    message: String,
    executable: Option<String>,
    args: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct TerminalAvailability {
    kind: String,
    label: String,
    available: bool,
    path: Option<String>,
    message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct SystemMetrics {
    cpu_percent: f32,
    memory_percent: f32,
    memory_used_bytes: u64,
    memory_total_bytes: u64,
    network_online: bool,
    network_rx_bytes_per_sec: u64,
    network_tx_bytes_per_sec: u64,
}

#[derive(Clone, Debug)]
struct ParsedCommand {
    executable: String,
    args: Vec<String>,
    cwd: PathBuf,
}

#[tauri::command]
fn validate_command(cwd: String, command: String) -> Result<CommandValidation, String> {
    let parsed = validate_and_parse(&cwd, &command)?;
    Ok(CommandValidation {
        ok: true,
        message: "실행 가능".to_string(),
        executable: Some(parsed.executable),
        args: parsed.args,
    })
}

#[tauri::command]
fn start_task(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    cwd: String,
    command: String,
) -> Result<RuntimeStatus, String> {
    let parsed = validate_and_parse(&cwd, &command)?;

    {
        let tasks = state.tasks.lock().map_err(|_| "상태 잠금에 실패했습니다.".to_string())?;
        if let Some(entry) = tasks.get(&task_id) {
            if entry.status.running {
                return Err("이미 실행 중입니다.".to_string());
            }
        }
    }

    let mut process = build_command(&parsed);
    let mut child = process
        .spawn()
        .map_err(|error| format!("실행 명령 실행 실패: {error}"))?;

    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    let status = RuntimeStatus {
        task_id: task_id.clone(),
        running: true,
        pid: Some(pid),
        port: None,
        started_at: Some(now_epoch()),
        exited_at: None,
        exit_code: None,
        error: None,
        last_output: None,
        last_error_output: None,
    };

    {
        let mut tasks = state.tasks.lock().map_err(|_| "상태 잠금에 실패했습니다.".to_string())?;
        tasks.insert(
            task_id.clone(),
            ProcessEntry {
                child: child.clone(),
                status: status.clone(),
                logs: VecDeque::new(),
            },
        );
    }

    emit_status(&app, &status);

    if let Some(stdout) = stdout {
        spawn_reader(app.clone(), task_id.clone(), "stdout", stdout);
    }
    if let Some(stderr) = stderr {
        spawn_reader(app.clone(), task_id.clone(), "stderr", stderr);
    }
    spawn_waiter(app, task_id, child);

    Ok(status)
}

#[tauri::command]
fn stop_task(state: State<'_, AppState>, task_id: String) -> Result<RuntimeStatus, String> {
    let mut tasks = state.tasks.lock().map_err(|_| "상태 잠금에 실패했습니다.".to_string())?;
    let entry = tasks
        .get_mut(&task_id)
        .ok_or_else(|| "해당 작업을 찾을 수 없습니다.".to_string())?;

    if !entry.status.running {
        return Ok(entry.status.clone());
    }

    let pid = entry.status.pid;
    if let Some(pid) = pid {
        kill_process_tree(pid);
    }

    if let Ok(mut child) = entry.child.lock() {
        let _ = child.kill();
    }

    entry.status.running = false;
    entry.status.pid = None;
    entry.status.port = None;
    entry.status.started_at = None;
    entry.status.exited_at = None;
    entry.status.exit_code = None;
    entry.status.error = None;
    Ok(entry.status.clone())
}

#[tauri::command]
fn get_task_status(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Option<RuntimeStatus>, String> {
    let tasks = state.tasks.lock().map_err(|_| "상태 잠금에 실패했습니다.".to_string())?;
    Ok(tasks.get(&task_id).map(|entry| entry.status.clone()))
}

#[tauri::command]
fn get_task_logs(state: State<'_, AppState>, task_id: String) -> Result<Vec<LogEntry>, String> {
    let tasks = state.tasks.lock().map_err(|_| "상태 잠금에 실패했습니다.".to_string())?;
    Ok(tasks
        .get(&task_id)
        .map(|entry| entry.logs.iter().cloned().collect())
        .unwrap_or_default())
}

#[tauri::command]
fn get_terminal_availability() -> Vec<TerminalAvailability> {
    ["git_bash", "windows_terminal", "powershell"]
        .iter()
        .map(|kind| terminal_availability(kind))
        .collect()
}

#[tauri::command]
fn get_system_metrics(state: State<'_, AppState>) -> Result<SystemMetrics, String> {
    read_system_metrics(&state)
}

#[tauri::command]
fn open_localhost_port(port: u16) -> Result<(), String> {
    if port == 0 {
        return Err("???????ы듃 踰덊샇?낅땲??".to_string());
    }
    open_external_url(&format!("http://localhost:{port}"))
}

#[tauri::command]
fn open_terminal(cwd: String, terminal_kind: String) -> Result<(), String> {
    let cwd = PathBuf::from(cwd.trim());
    if cwd.as_os_str().is_empty() || !cwd.exists() || !cwd.is_dir() {
        return Err("터미널을 열 폴더가 존재하지 않습니다.".to_string());
    }

    let availability = terminal_availability(&terminal_kind);
    let terminal_path = availability
        .path
        .ok_or_else(|| format!("{}을(를) 열 수 없습니다: {}", availability.label, availability.message))?;

    let mut command = Command::new(terminal_path);
    command
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    match terminal_kind.as_str() {
        "git_bash" => {
            command.arg(format!("--cd={}", cwd.display()));
        }
        "windows_terminal" => {
            command.args(["-d", cwd.to_string_lossy().as_ref(), "cmd.exe"]);
        }
        "powershell" => {
            command
                .stdin(Stdio::inherit())
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit());
            command.args([
                "-NoLogo",
                "-NoExit",
                "-Command",
                &format!("Set-Location -LiteralPath '{}'", escape_powershell_literal(&cwd)),
            ]);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NEW_CONSOLE: u32 = 0x00000010;
                command.creation_flags(CREATE_NEW_CONSOLE);
            }
        }
        _ => return Err("지원하지 않는 터미널입니다.".to_string()),
    }

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("터미널 실행 실패: {error}"))
}

fn open_external_url(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        let mut command = Command::new("cmd");
        command
            .args(["/C", "start", "", url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let status = command
            .status()
            .map_err(|error| format!("URL ?닿린 ?ㅽ뙣: {error}"))?;

        if status.success() {
            return Ok(());
        }
        return Err(format!("URL ?닿린 ?ㅽ뙣: {status}"));
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("URL ?닿린 ?ㅽ뙣: {error}"))
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("URL ?닿린 ?ㅽ뙣: {error}"))
    }
}

fn build_command(parsed: &ParsedCommand) -> Command {
    let executable = platform_executable(&parsed.executable, &parsed.cwd);
    let mut command = Command::new(executable);
    command
        .args(&parsed.args)
        .current_dir(&parsed.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

fn platform_executable(executable: &str, cwd: &Path) -> PathBuf {
    let raw = PathBuf::from(executable);
    if raw.components().count() > 1 || raw.extension().is_some() {
        return raw;
    }

    #[cfg(windows)]
    {
        if executable.eq_ignore_ascii_case("gradlew") {
            let bat = cwd.join("gradlew.bat");
            if bat.exists() {
                return bat;
            }
        }

        if matches!(
            executable.to_ascii_lowercase().as_str(),
            "npm" | "npx" | "pnpm" | "yarn" | "mvn" | "mvnw" | "gradle" | "gradlew"
        ) {
            return PathBuf::from(format!("{executable}.cmd"));
        }
    }

    raw
}

fn terminal_availability(kind: &str) -> TerminalAvailability {
    let (label, path) = match kind {
        "git_bash" => ("Git Bash", resolve_git_bash()),
        "windows_terminal" => ("Terminal", resolve_windows_terminal()),
        "powershell" => ("PowerShell", resolve_powershell()),
        _ => {
            return TerminalAvailability {
                kind: kind.to_string(),
                label: "Unknown".to_string(),
                available: false,
                path: None,
                message: "지원하지 않는 터미널입니다.".to_string(),
            }
        }
    };

    match path {
        Some(path) => TerminalAvailability {
            kind: kind.to_string(),
            label: label.to_string(),
            available: true,
            message: format!("{} 사용 가능", path.display()),
            path: Some(path.to_string_lossy().to_string()),
        },
        None => TerminalAvailability {
            kind: kind.to_string(),
            label: label.to_string(),
            available: false,
            path: None,
            message: format!("{label} 실행 파일을 찾을 수 없습니다."),
        },
    }
}

fn resolve_git_bash() -> Option<PathBuf> {
    first_existing([
        env_path("ProgramFiles", ["Git", "git-bash.exe"]),
        env_path("ProgramFiles(x86)", ["Git", "git-bash.exe"]),
        Some(PathBuf::from(r"C:\Program Files\Git\git-bash.exe")),
    ])
    .or_else(|| find_in_path("git-bash.exe"))
}

fn resolve_windows_terminal() -> Option<PathBuf> {
    find_in_path("wt.exe").or_else(|| {
        first_existing([
            env_path("LOCALAPPDATA", ["Microsoft", "WindowsApps", "wt.exe"]),
            Some(PathBuf::from(
                r"C:\Users\Default\AppData\Local\Microsoft\WindowsApps\wt.exe",
            )),
        ])
    })
}

fn resolve_powershell() -> Option<PathBuf> {
    find_in_path("powershell.exe").or_else(|| {
        first_existing([
            env_path("SystemRoot", ["System32", "WindowsPowerShell", "v1.0", "powershell.exe"]),
            Some(PathBuf::from(
                r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
            )),
        ])
    })
}

fn first_existing<const N: usize>(paths: [Option<PathBuf>; N]) -> Option<PathBuf> {
    paths.into_iter().flatten().find(|path| path.exists())
}

fn env_path<const N: usize>(name: &str, parts: [&str; N]) -> Option<PathBuf> {
    let mut path = PathBuf::from(env::var_os(name)?);
    for part in parts {
        path.push(part);
    }
    Some(path)
}

fn find_in_path(executable: &str) -> Option<PathBuf> {
    let path_value = env::var_os("PATH")?;
    env::split_paths(&path_value)
        .map(|directory| directory.join(executable))
        .find(|candidate| candidate.exists())
}

fn escape_powershell_literal(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}

fn spawn_reader<R>(app: AppHandle, task_id: String, stream_name: &'static str, reader: R)
where
    R: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines().map_while(Result::ok) {
            let normalized_line = strip_ansi_codes(&line);
            let log = LogEntry {
                task_id: task_id.clone(),
                stream: stream_name.to_string(),
                line: line.clone(),
                timestamp: now_epoch(),
            };
            let port = detect_port(&normalized_line);

            {
                let state = app.state::<AppState>();
                let lock_result = state.tasks.lock();
                if let Ok(mut tasks) = lock_result {
                    if let Some(entry) = tasks.get_mut(&task_id) {
                        entry.status.last_output = Some(line.clone());
                        if stream_name == "stderr" {
                            entry.status.last_error_output = Some(line.clone());
                        }
                        if port.is_some() {
                            entry.status.port = port;
                        }
                        entry.logs.push_back(log.clone());
                        while entry.logs.len() > MAX_LOG_LINES {
                            entry.logs.pop_front();
                        }
                    }
                }
            }

            let _ = app.emit("task://output", &log);
            if port.is_some() {
                if let Some(status) = current_status(&app, &task_id) {
                    emit_status(&app, &status);
                }
            }
        }
    });
}

fn spawn_waiter(app: AppHandle, task_id: String, child: Arc<Mutex<Child>>) {
    thread::spawn(move || loop {
        let exit_status = {
            let mut child = match child.lock() {
                Ok(child) => child,
                Err(_) => return,
            };
            match child.try_wait() {
                Ok(Some(status)) => Some(Ok(status)),
                Ok(None) => None,
                Err(error) => Some(Err(error)),
            }
        };

        match exit_status {
            Some(Ok(status)) => {
                let next = update_finished_status(&app, &task_id, status.code(), None);
                if let Some(status) = next {
                    emit_status(&app, &status);
                }
                return;
            }
            Some(Err(error)) => {
                let next = update_finished_status(&app, &task_id, None, Some(error.to_string()));
                if let Some(status) = next {
                    emit_status(&app, &status);
                }
                return;
            }
            None => thread::sleep(Duration::from_millis(500)),
        }
    });
}

fn update_finished_status(
    app: &AppHandle,
    task_id: &str,
    exit_code: Option<i32>,
    error: Option<String>,
) -> Option<RuntimeStatus> {
    let state = app.state::<AppState>();
    let mut tasks = state.tasks.lock().ok()?;
    let entry = tasks.get_mut(task_id)?;
    entry.status.running = false;
    entry.status.exited_at = Some(now_epoch());
    entry.status.exit_code = exit_code;
    entry.status.error = match error {
        Some(error) => Some(error),
        None => exit_code.and_then(|code| {
            if code == 0 {
                None
            } else {
                let detail = entry
                    .status
                    .last_error_output
                    .as_deref()
                    .or(entry.status.last_output.as_deref());
                Some(match detail {
                    Some(detail) if !detail.trim().is_empty() => {
                        format!("종료 코드 {code}: {detail}")
                    }
                    _ => format!("종료 코드 {code}로 실패했습니다."),
                })
            }
        }),
    };
    Some(entry.status.clone())
}

fn current_status(app: &AppHandle, task_id: &str) -> Option<RuntimeStatus> {
    let state = app.state::<AppState>();
    let tasks = state.tasks.lock().ok()?;
    tasks.get(task_id).map(|entry| entry.status.clone())
}

fn emit_status(app: &AppHandle, status: &RuntimeStatus) {
    let _ = app.emit("task://status", status);
}

#[cfg(windows)]
fn read_system_metrics(state: &State<'_, AppState>) -> Result<SystemMetrics, String> {
    let mut idle = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();

    let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) };
    if ok == 0 {
        return Err("CPU 사용량을 읽을 수 없습니다.".to_string());
    }

    let current = CpuTimes {
        idle: filetime_to_u64(idle),
        total: filetime_to_u64(kernel).saturating_add(filetime_to_u64(user)),
    };

    let cpu_percent = {
        let mut previous = state
            .system_cpu
            .lock()
            .map_err(|_| "시스템 상태 잠금에 실패했습니다.".to_string())?;
        let cpu = previous
            .map(|prev| {
                let idle_delta = current.idle.saturating_sub(prev.idle);
                let total_delta = current.total.saturating_sub(prev.total);
                if total_delta == 0 {
                    0.0
                } else {
                    ((total_delta.saturating_sub(idle_delta)) as f32 / total_delta as f32 * 100.0)
                        .clamp(0.0, 100.0)
                }
            })
            .unwrap_or(0.0);
        *previous = Some(current);
        cpu
    };

    let mut memory = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    let ok = unsafe { GlobalMemoryStatusEx(&mut memory) };
    if ok == 0 {
        return Err("메모리 사용량을 읽을 수 없습니다.".to_string());
    }

    let memory_total_bytes = memory.ullTotalPhys;
    let memory_used_bytes = memory_total_bytes.saturating_sub(memory.ullAvailPhys);

    Ok(SystemMetrics {
        cpu_percent,
        memory_percent: memory.dwMemoryLoad as f32,
        memory_used_bytes,
        memory_total_bytes,
        ..read_network_metrics(state)?
    })
}

#[cfg(not(windows))]
fn read_system_metrics(_state: &State<'_, AppState>) -> Result<SystemMetrics, String> {
    Err("시스템 모니터링은 현재 Windows에서만 지원합니다.".to_string())
}

#[cfg(windows)]
fn filetime_to_u64(value: FILETIME) -> u64 {
    ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
}

#[cfg(windows)]
fn read_network_metrics(state: &State<'_, AppState>) -> Result<SystemMetrics, String> {
    let current = read_network_sample();
    let mut previous = state
        .system_network
        .lock()
        .map_err(|_| "?ㅽ듃?뚰겕 ?곹깭 ?좉툑???ㅽ뙣?덉뒿?덈떎.".to_string())?;

    let (rx_per_sec, tx_per_sec) = previous
        .map(|prev| {
            let elapsed_ms = current.timestamp_ms.saturating_sub(prev.timestamp_ms);
            if elapsed_ms == 0 {
                return (0, 0);
            }

            let rx = current
                .rx_bytes
                .saturating_sub(prev.rx_bytes)
                .saturating_mul(1_000)
                / elapsed_ms as u64;
            let tx = current
                .tx_bytes
                .saturating_sub(prev.tx_bytes)
                .saturating_mul(1_000)
                / elapsed_ms as u64;
            (rx, tx)
        })
        .unwrap_or((0, 0));

    *previous = Some(current);

    let internet_online = current.online && has_internet_connectivity();

    Ok(SystemMetrics {
        cpu_percent: 0.0,
        memory_percent: 0.0,
        memory_used_bytes: 0,
        memory_total_bytes: 0,
        network_online: internet_online,
        network_rx_bytes_per_sec: rx_per_sec,
        network_tx_bytes_per_sec: tx_per_sec,
    })
}

#[cfg(windows)]
fn has_internet_connectivity() -> bool {
    const INTERNET_PROBES: [([u8; 4], u16); 3] = [
        ([1, 1, 1, 1], 443),
        ([8, 8, 8, 8], 443),
        ([208, 67, 222, 222], 443),
    ];
    const INTERNET_PROBE_TIMEOUT: Duration = Duration::from_millis(450);

    INTERNET_PROBES.iter().any(|(octets, port)| {
        let address = SocketAddr::from((*octets, *port));
        TcpStream::connect_timeout(&address, INTERNET_PROBE_TIMEOUT).is_ok()
    })
}

#[cfg(windows)]
fn read_network_sample() -> NetworkSample {
    let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
    let result = unsafe { GetIfTable2(&mut table) };
    if result != 0 || table.is_null() {
        return NetworkSample {
            online: false,
            rx_bytes: 0,
            tx_bytes: 0,
            timestamp_ms: now_millis(),
        };
    }

    let mut online = false;
    let mut rx_bytes = 0u64;
    let mut tx_bytes = 0u64;

    unsafe {
        let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize);
        for row in rows {
            if row.OperStatus == IfOperStatusUp {
                online = true;
                rx_bytes = rx_bytes.saturating_add(row.InOctets);
                tx_bytes = tx_bytes.saturating_add(row.OutOctets);
            }
        }
        FreeMibTable(table as *const c_void);
    }

    NetworkSample {
        online,
        rx_bytes,
        tx_bytes,
        timestamp_ms: now_millis(),
    }
}

#[cfg(windows)]
fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn validate_and_parse(cwd: &str, command: &str) -> Result<ParsedCommand, String> {
    let cwd = PathBuf::from(cwd.trim());
    if cwd.as_os_str().is_empty() {
        return Err("폴더를 지정해야 합니다.".to_string());
    }
    reject_untrusted_mount_path(&cwd)?;
    if !cwd.exists() || !cwd.is_dir() {
        return Err("실행 폴더가 존재하지 않습니다.".to_string());
    }

    let command = command.trim();
    if command.is_empty() {
        return Err("실행 명령을 입력해야 합니다.".to_string());
    }
    if command.len() > MAX_COMMAND_LENGTH {
        return Err("실행 명령이 너무 깁니다.".to_string());
    }
    if has_forbidden_shell_operator(command) {
        return Err("파이프, 리다이렉션, 명령 연결자는 허용하지 않습니다.".to_string());
    }

    let tokens = parse_command_line(command)?;
    if tokens.is_empty() {
        return Err("실행 명령을 해석할 수 없습니다.".to_string());
    }
    if tokens.len() > MAX_TOKEN_COUNT {
        return Err("실행 명령 인자가 너무 많습니다.".to_string());
    }

    let executable = normalize_executable(&tokens[0]);
    if !is_allowed_executable(&executable) {
        return Err(format!("{} 실행은 허용 목록에 없습니다.", tokens[0]));
    }
    for token in &tokens {
        if has_forbidden_shell_operator(token) {
            return Err("실행 명령 인자에 허용되지 않는 문자가 있습니다.".to_string());
        }
    }

    Ok(ParsedCommand {
        executable,
        args: tokens.into_iter().skip(1).collect(),
        cwd,
    })
}

#[cfg(windows)]
fn reject_untrusted_mount_path(cwd: &Path) -> Result<(), String> {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;

    for path in cwd.ancestors() {
        let Ok(metadata) = std::fs::symlink_metadata(path) else {
            continue;
        };

        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(format!(
                "이 폴더 경로에 Windows가 신뢰하지 않을 수 있는 탑재 지점이 포함되어 있습니다. 프로젝트를 실제 로컬 폴더로 옮긴 뒤 다시 실행해주세요. 문제 경로: {}",
                path.display()
            ));
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn reject_untrusted_mount_path(_cwd: &Path) -> Result<(), String> {
    Ok(())
}

fn parse_command_line(input: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaping = false;

    for character in input.trim().chars() {
        if escaping {
            current.push(character);
            escaping = false;
            continue;
        }
        if character == '\\' && quote == Some('"') {
            escaping = true;
            continue;
        }
        if matches!(character, '"' | '\'') && quote.is_none() {
            quote = Some(character);
            continue;
        }
        if quote == Some(character) {
            quote = None;
            continue;
        }
        if quote.is_none() && character.is_whitespace() {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            continue;
        }
        current.push(character);
    }

    if quote.is_some() {
        return Err("따옴표가 닫히지 않았습니다.".to_string());
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    Ok(tokens)
}

fn normalize_executable(executable: &str) -> String {
    let normalized = executable
        .trim_start_matches(".\\")
        .trim_start_matches("./")
        .to_ascii_lowercase();

    normalized
        .strip_suffix(".cmd")
        .or_else(|| normalized.strip_suffix(".bat"))
        .or_else(|| normalized.strip_suffix(".exe"))
        .unwrap_or(&normalized)
        .to_string()
}

fn is_allowed_executable(executable: &str) -> bool {
    matches!(
        executable,
        "npm"
            | "npx"
            | "pnpm"
            | "yarn"
            | "node"
            | "deno"
            | "bun"
            | "cargo"
            | "python"
            | "python3"
            | "py"
            | "go"
            | "java"
            | "mvn"
            | "mvnw"
            | "gradle"
            | "gradlew"
            | "dotnet"
    )
}

fn has_forbidden_shell_operator(input: &str) -> bool {
    ["&&", "||", "|", ">", "<", ";", "`", "$(", "\n", "\r"]
        .iter()
        .any(|pattern| input.contains(pattern))
}

fn detect_port(line: &str) -> Option<u16> {
    let patterns = [
        r"(?i)(?:https?://)?(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|0\.0\.0\.0|\[::1\]|\[::\]|::1):(\d{2,5})",
        r"(?i)\b(?:port|listen(?:ing)?|server|local|network|address|url)\b[^\d]{0,30}(\d{2,5})\b",
        r"(?i)\b(?:started|ready|running|available|serving)\b.{0,50}\b(?:on|at)\b[^\d]{0,30}(\d{2,5})\b",
    ];

    for pattern in patterns {
        if let Some(port) = detect_port_by_pattern(line, pattern) {
            return Some(port);
        }
    }
    None
}

fn strip_ansi_codes(line: &str) -> String {
    Regex::new(r"\x1b\[[0-?]*[ -/]*[@-~]")
        .map(|regex| regex.replace_all(line, "").into_owned())
        .unwrap_or_else(|_| line.to_string())
}

fn detect_port_by_pattern(line: &str, pattern: &str) -> Option<u16> {
    let regex = Regex::new(pattern).ok()?;
    let captures = regex.captures(line)?;
    parse_port(captures.get(1)?.as_str())
}

fn parse_port(value: &str) -> Option<u16> {
    let port = value.parse::<u16>().ok()?;
    if port > 0 {
        Some(port)
    } else {
        None
    }
}

fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let mut command = Command::new("taskkill");
        command.args(["/PID", &pid.to_string(), "/T", "/F"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let _ = command.output();
    }
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            validate_command,
            start_task,
            stop_task,
            get_task_status,
            get_task_logs,
            get_terminal_availability,
            get_system_metrics,
            open_localhost_port,
            open_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{detect_port, strip_ansi_codes};

    #[test]
    fn detects_ports_from_common_dev_server_output() {
        let cases = [
            ("  Local:   http://localhost:5173/", Some(5173)),
            ("  Network: http://192.168.0.10:3000/", Some(3000)),
            ("ready - started server on 0.0.0.0:3001", Some(3001)),
            ("Listening on port 8080", Some(8080)),
            ("Server running at http://127.0.0.1:1420", Some(1420)),
            ("Tomcat started on port 8081 (http)", Some(8081)),
            ("\u{1b}[32m➜\u{1b}[39m  \u{1b}[1mLocal\u{1b}[22m:   \u{1b}[36mhttp://localhost:\u{1b}[1m3000\u{1b}[22m/\u{1b}[39m", Some(3000)),
            ("No port in this line", None),
        ];

        for (line, expected) in cases {
            assert_eq!(detect_port(&strip_ansi_codes(line)), expected, "{line}");
        }
    }
}
