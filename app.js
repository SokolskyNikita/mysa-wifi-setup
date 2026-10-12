import {
  BluetoothConnection,
  isBluetoothSupported,
  supportProblem,
  watchBluetoothAvailability,
} from "./browser-bluetooth.js";
import { createMysaDevice, FAILURE_HINT, validateCredentials } from "./mysa.js";

const $ = (id) => document.getElementById(id);
const mysa = createMysaDevice(new BluetoothConnection(), {
  log,
  onDisconnect: onDisconnected,
});
let busy = false;

// Keep UI updates and action locking separate from the Bluetooth protocol.
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  const output = $("log");
  output.textContent += `[${timestamp}] ${message}\n`;
  output.scrollTop = output.scrollHeight;
}

function setText(id, text, className) {
  const element = $(id);
  element.textContent = text;
  element.className = className;
}

function setState(text, cls = "") {
  setText("state", text, `status ${cls}`);
}
function setPairState(text, cls = "") {
  setText("pairState", text, `status ${cls}`);
}
function setMsg(text, cls = "") {
  setText("sendMsg", text, `msg ${cls}`);
}

function showBanner(text) {
  $("banner").textContent = text;
  $("banner").hidden = !text;
}

function updateControls() {
  const supported = isBluetoothSupported();
  const isConnected = mysa.connected;
  $("connect").disabled = $("connectAll").disabled = !supported || busy;
  $("reconnect").hidden = !mysa.hasDevice || isConnected;
  $("reconnect").disabled = busy;
  $("disconnect").disabled = busy || !isConnected;
  $("pair").disabled = busy || !isConnected;
  $("send").disabled = busy || !isConnected;
  $("showNetworks").disabled = busy || !isConnected || !mysa.paired;
}

async function runAction(action) {
  if (busy) return;
  busy = true;
  updateControls();
  try {
    await action();
  } catch (error) {
    // Expected failures have more specific messages inside each action.
    setState(`failed: ${error.message}`, "err");
    log(`failed: ${error.name}: ${error.message}`);
    $("logBox").open = true;
  } finally {
    busy = false;
    updateControls();
  }
}

function showDeviceInfo(rows) {
  $("info").replaceChildren(
    ...rows.flatMap(([name, value]) => {
      const term = document.createElement("dt");
      term.textContent = name;
      const description = document.createElement("dd");
      description.textContent = value;
      return [term, description];
    }),
  );
  rows.forEach(([name, value]) => log(`${name}: ${value}`));
}

function clearNetworks() {
  $("networkRows").replaceChildren();
  $("networkList").hidden = true;
  $("networkMsg").textContent = "";
}

function onDisconnected() {
  clearNetworks();
  setState("disconnected");
  setPairState("not paired");
  updateControls();
}

async function choose(acceptAll) {
  try {
    await mysa.choose(acceptAll);
  } catch (error) {
    if (error.name === "NotFoundError") {
      log("no device chosen");
      setState(
        'no device chosen. Is the Bluetooth icon on the thermostat? Move closer, or try "Show all nearby devices".',
      );
    } else {
      log(`device chooser failed: ${error.name}: ${error.message}`);
      setState(error.message, "err");
    }
    return;
  }
  await connect();
}

async function connect() {
  clearNetworks();
  setState("connecting…");
  setPairState("not paired");
  try {
    showDeviceInfo(await mysa.connect());
    setState("connected", "ok");
    log("next: Pair (step 3)");
  } catch (error) {
    setState(error.message, "err");
    $("logBox").open = true;
  }
}

async function pair() {
  setPairState("waiting for the code…");
  try {
    await mysa.pair();
    setPairState("paired", "ok");
  } catch (error) {
    setPairState(`failed: ${error.message}`, "err");
    log(`pairing failed: ${error.name}: ${error.message}`);
    log(
      `tip: remove "Mysa" from this device's Bluetooth settings (Forget / Unpair), then Reconnect and Pair again (it sometimes takes 2-3 tries)`,
    );
  }
  return mysa.paired;
}

function signalQuality(rssi) {
  // General Wi-Fi guidance, not a Mysa-specific minimum or a connectivity test.
  if (rssi >= -70)
    return {
      level: "good",
      label: "Good",
      hint: "Likely sufficient for normal thermostat use.",
    };
  if (rssi > -80)
    return {
      level: "weak",
      label: "Weak",
      hint: "The connection may be unreliable. Improve Wi-Fi coverage if possible.",
    };
  return {
    level: "poor",
    label: "Poor",
    hint: "An unreliable connection is likely. Improve Wi-Fi coverage.",
  };
}

function showNetworkRows(networks) {
  $("networkRows").replaceChildren(
    ...networks.map(({ ssid, rssi }) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = ssid || "(Hidden network)";
      const signal = document.createElement("td");
      const quality = signalQuality(rssi);
      signal.className = `signal-${quality.level}`;
      signal.title = quality.hint;
      signal.textContent = `${rssi} dBm`;
      const label = document.createElement("span");
      label.className = "signal-label";
      label.textContent = quality.label;
      signal.append(label);
      row.append(name, signal);
      return row;
    }),
  );
  $("networkList").hidden = networks.length === 0;
}

async function showNetworks() {
  showNetworkRows([]);
  setText("networkMsg", "Checking networks seen by the thermostat…", "msg");
  try {
    const { networks, count, limit, skipped } = await mysa.scanNetworks();
    showNetworkRows(networks);
    const message = networks.length
      ? `${networks.length} network name${networks.length === 1 ? "" : "s"} seen, strongest signal first.`
      : skipped
        ? "The thermostat returned networks, but their names could not be read. Try again."
        : "No networks found. Try again in a moment.";
    const extra = `${count > limit ? ` Showing results from the first ${limit} records.` : ""}${skipped ? ` ${skipped} unreadable record${skipped === 1 ? "" : "s"} skipped.` : ""}`;
    setText(
      "networkMsg",
      message + extra,
      `msg${skipped && !networks.length ? " err" : ""}`,
    );
  } catch (error) {
    const message =
      error.name === "NotFoundError"
        ? "Network listing is unavailable on this thermostat."
        : error.message;
    setText("networkMsg", message, "msg err");
    log(`network listing failed: ${error.name}: ${error.message}`);
  }
}

async function sendWifi() {
  const ssid = $("ssid").value;
  const password = $("pw").value;
  const problem = validateCredentials(ssid, password);
  if (problem) {
    setMsg(problem, "err");
    return;
  }
  if (
    !password &&
    !confirm("No password entered. Only continue if this is an open network.")
  )
    return;
  setMsg("");
  if (!mysa.paired && !(await pair())) {
    setMsg("Pair first (step 3).", "err");
    return;
  }
  try {
    setState("sending…");
    await mysa.sendWifi(ssid, password, () => {
      setState("thermostat is joining Wi-Fi…");
      setMsg("Waiting for the thermostat to join the network (up to 90 s)…");
    });
    setState("on Wi-Fi", "ok");
    setMsg(
      `Done: the thermostat joined "${ssid}". If your model supports HomeKit, you can now add it to Apple Home or Home Assistant (HomeKit Device integration) with its setup code.`,
      "ok",
    );
    $("pw").value = "";
  } catch (error) {
    setState("failed", "err");
    setMsg(
      FAILURE_HINT[error.code] ||
        `Failed: ${error.message}. Check the technical log below, then try again.`,
      "err",
    );
    log(`failed: ${error.message}`);
    $("logBox").open = true;
  }
}

// Page initialization and non-Bluetooth actions.
async function copyLog() {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard access is unavailable in this browser.");
    await navigator.clipboard.writeText($("log").textContent);
    $("copyLog").textContent = "Copied";
    setTimeout(() => {
      $("copyLog").textContent = "Copy log";
    }, 1500);
  } catch (error) {
    log(`copy failed: ${error.message}`);
  }
}

function initialize() {
  const problem = supportProblem();
  if (problem) {
    showBanner(problem);
    setState("unavailable", "err");
  } else {
    watchBluetoothAvailability((available) => {
      showBanner(
        available
          ? ""
          : "Bluetooth looks turned off or missing on this device. Turn it on, then try again.",
      );
    });
  }

  $("connect").onclick = () => runAction(() => choose(false));
  $("connectAll").onclick = () => runAction(() => choose(true));
  $("reconnect").onclick = () => runAction(() => mysa.hasDevice && connect());
  $("disconnect").onclick = () => runAction(() => mysa.disconnect());
  $("pair").onclick = () => runAction(pair);
  $("send").onclick = () => runAction(sendWifi);
  $("showNetworks").onclick = () => runAction(showNetworks);
  $("showPw").onchange = (event) => {
    $("pw").type = event.target.checked ? "text" : "password";
  };
  $("copyLog").onclick = copyLog;
  updateControls();
}

initialize();
