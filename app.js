const SERVER_ENDPOINT = "http://127.0.0.1:3000/logs";

const tasks = [
  {
    id: "click-blue-button",
    type: "button_click",
    instruction: "아래 버튼을 한 번 클릭하세요.",
    buttonText: "TARGET BUTTON"
  },
  {
    id: "type-target-text",
    type: "text_input",
    instruction: "입력칸에 정확히 `CODEX 2026`을 입력하세요.",
    targetText: "CODEX 2026"
  },
  {
    id: "drag-card-to-target",
    type: "drag",
    instruction: "왼쪽 카드를 오른쪽 드롭 영역으로 드래그하세요.",
    dragText: "DRAG ME",
    dropText: "DROP HERE"
  }
];

const logData = {
  session: null,
  task: null,
  task_events: [],
  key_events: [],
  mouse_events: []
};

let recording = false;
let activeTask = null;
let lastMoveAt = 0;
let taskQueue = [];
let taskIndex = -1;

const status = document.getElementById("status");
const statusText = document.getElementById("statusText");
const output = document.getElementById("output");
const keyCount = document.getElementById("keyCount");
const mouseCount = document.getElementById("mouseCount");
const taskStatus = document.getElementById("taskStatus");
const lastKey = document.getElementById("lastKey");
const lastCoord = document.getElementById("lastCoord");
const toast = document.getElementById("toast");
const taskStage = document.getElementById("taskStage");
const instruction = document.getElementById("instruction");
const taskUi = document.getElementById("taskUi");
const saveBtn = document.getElementById("saveBtn");

function epoch() {
  return Date.now();
}

function isoNow() {
  return new Date().toISOString();
}

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeKey(event) {
  if (event.key === " ") return "Space";
  return event.key || event.code || "Unidentified";
}

function mouseButtonName(event) {
  const names = ["left", "middle", "right", "back", "forward"];
  return names[event.button] || `button${event.button}`;
}

function coords(event) {
  return [Math.round(event.clientX), Math.round(event.clientY)];
}

function setRecording(nextState) {
  recording = nextState;
  status.classList.toggle("recording", recording);
  statusText.textContent = recording ? "측정 중" : "대기 중";
  saveBtn.disabled = !recording;
  if (recording) taskStage.focus();
  render();
}

function pushTaskEvent(eventName, detail = {}) {
  logData.task_events.push({
    Event: eventName,
    Epoch: epoch(),
    Detail: detail
  });
  render();
}

function render() {
  keyCount.textContent = logData.key_events.length;
  mouseCount.textContent = logData.mouse_events.length;
  taskStatus.textContent = logData.session?.task_completed ? "완료" : activeTask ? "진행 중" : "없음";
  output.value = JSON.stringify(logData, null, 2);
}

function showToast(message) {
  toast.textContent = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.textContent = "";
  }, 2200);
}

function resetLog() {
  logData.session = null;
  logData.task = null;
  logData.task_events = [];
  logData.key_events = [];
  logData.mouse_events = [];
  activeTask = null;
  taskQueue = [];
  taskIndex = -1;
  lastKey.textContent = "-";
  lastCoord.textContent = "-";
  instruction.textContent = "측정 시작을 누르면 과제가 배정됩니다.";
  taskUi.innerHTML = "";
  setRecording(false);
}

function makeTaskQueue() {
  return [...tasks].sort(() => Math.random() - 0.5);
}

function assignNextTask() {
  if (!recording || !logData.session) return;
  taskIndex += 1;

  if (taskIndex >= taskQueue.length) {
    activeTask = null;
    logData.task = null;
    logData.session.all_tasks_completed = true;
    logData.session.completed_at = isoNow();
    instruction.textContent = "모든 과제가 끝났습니다. `측정 종료 + 서버 전송`을 눌러 저장하세요.";
    taskUi.innerHTML = "";
    pushTaskEvent("all tasks completed", { total_tasks: taskQueue.length });
    showToast("모든 과제 완료. 서버 전송 버튼을 눌러주세요.");
    render();
    return;
  }

  logData.session.current_task_index = taskIndex;
  logData.session.task_completed = false;
  assignTask(taskQueue[taskIndex]);
}

function assignTask(task) {
  activeTask = task;
  logData.task = {
    id: task.id,
    type: task.type,
    instruction: task.instruction,
    target_text: task.targetText || null,
    index: taskIndex,
    total: taskQueue.length || 1,
    assigned_at: isoNow()
  };

  instruction.textContent = `과제 ${taskIndex + 1}/${taskQueue.length}: ${task.instruction}`;
  taskUi.innerHTML = "";
  renderTask(task);
  pushTaskEvent("task assigned", { task_id: task.id, task_type: task.type });
}

function renderTask(task) {
  if (task.type === "button_click") {
    const button = document.createElement("button");
    button.className = "primary";
    button.textContent = task.buttonText;
    button.addEventListener("click", () => completeTask({ clicked: task.buttonText }));
    taskUi.append(button);
    return;
  }

  if (task.type === "text_input") {
    const input = document.createElement("input");
    input.className = "task-input";
    input.placeholder = task.targetText;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.addEventListener("input", () => {
      if (input.value === task.targetText) {
        completeTask({ typed_text: input.value });
      }
    });
    taskUi.append(input);
    input.focus();
    return;
  }

  if (task.type === "drag") {
    const row = document.createElement("div");
    row.className = "drag-row";

    const item = document.createElement("div");
    item.className = "drag-item";
    item.draggable = true;
    item.id = "dragItem";
    item.textContent = task.dragText;
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", "dragItem");
      pushTaskEvent("drag started", { task_id: task.id });
    });

    const dropZone = document.createElement("div");
    dropZone.className = "drop-zone";
    dropZone.textContent = task.dropText;
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("ready");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("ready");
    });
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("ready");
      dropZone.textContent = "DONE";
      completeTask({ dropped: true });
    });

    row.append(item, dropZone);
    taskUi.append(row);
  }
}

function completeTask(detail = {}) {
  if (!recording || !activeTask || logData.session?.task_completed) return;
  logData.session.task_completed = true;
  logData.session.last_task_completed_at = isoNow();
  pushTaskEvent("task completed", { task_id: activeTask.id, ...detail });
  showToast("과제 완료. 다음 과제로 넘어갑니다.");
  render();
  window.setTimeout(assignNextTask, 650);
}

function addKeyEvent(event, action) {
  if (!recording) return;
  logData.key_events.push({
    Event: action,
    Epoch: epoch(),
    Key: normalizeKey(event)
  });
  lastKey.textContent = normalizeKey(event);
  render();
}

function addMouseEvent(event, action) {
  if (!recording) return;
  const point = coords(event);
  logData.mouse_events.push({
    Event: action,
    Epoch: epoch(),
    Coordinates: point
  });
  lastCoord.textContent = `${point[0]}, ${point[1]}`;
  render();
}

function finalizeMeasurement() {
  if (!logData.session) return logData;

  if (!logData.session.ended_at) {
    logData.session.ended_at = isoNow();
  }

  if (!logData.session.finalized_at) {
    logData.session.finalized_at = isoNow();
    pushTaskEvent("measurement saved", {
      task_completed: Boolean(logData.session.task_completed),
      all_tasks_completed: Boolean(logData.session.all_tasks_completed)
    });
  }

  return logData;
}

async function sendJsonToServer(payload) {
  const response = await fetch(SERVER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`server responded with ${response.status}`);
  }

  return response.json().catch(() => ({}));
}

function downloadJson(payload = finalizeMeasurement()) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const sessionId = payload.session?.id || createSessionId();
  link.href = URL.createObjectURL(blob);
  link.download = `${sessionId}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  addKeyEvent(event, "pressed");
});

document.addEventListener("keyup", (event) => {
  addKeyEvent(event, "released");
});

document.addEventListener("mousemove", (event) => {
  const now = performance.now();
  if (now - lastMoveAt < 50) return;
  lastMoveAt = now;
  addMouseEvent(event, "movement");
});

document.addEventListener("mousedown", (event) => {
  addMouseEvent(event, `${mouseButtonName(event)} press`);
});

document.addEventListener("mouseup", (event) => {
  addMouseEvent(event, `${mouseButtonName(event)} release`);
});

document.getElementById("startBtn").addEventListener("click", () => {
  resetLog();
  logData.session = {
    id: createSessionId(),
    started_at: isoNow(),
    ended_at: null,
    monitor_width: window.screen.width,
    monitor_height: window.screen.height,
    task_completed: false,
    all_tasks_completed: false,
    current_task_index: -1,
    total_tasks: tasks.length,
    server_endpoint: SERVER_ENDPOINT
  };
  taskQueue = makeTaskQueue();
  taskIndex = -1;
  setRecording(true);
  assignNextTask();
  showToast("측정을 시작했습니다.");
});

document.getElementById("saveBtn").addEventListener("click", async () => {
  if (!logData.session) return;

  saveBtn.disabled = true;
  const payload = finalizeMeasurement();
  setRecording(false);

  try {
    const result = await sendJsonToServer(payload);
    showToast(`서버 전송 완료: ${result.file || "received"}`);
  } catch (error) {
    console.error(error);
    showToast("서버 전송 실패. 로컬 JSON 다운로드로 저장합니다.");
    downloadJson(payload);
  }
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  const payload = finalizeMeasurement();
  setRecording(false);
  downloadJson(payload);
});

document.getElementById("newTaskBtn").addEventListener("click", () => {
  if (!recording || !logData.session) {
    showToast("먼저 측정 시작을 눌러주세요.");
    return;
  }
  assignNextTask();
  showToast("다음 과제로 넘어갔습니다.");
});

document.getElementById("clearBtn").addEventListener("click", () => {
  resetLog();
  showToast("초기화했습니다.");
});

document.getElementById("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.value);
  showToast("JSON을 클립보드에 복사했습니다.");
});

resetLog();
