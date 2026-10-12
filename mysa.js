// Mysa's BLE Wi-Fi setup protocol. Browser device access comes from an adapter.
// It implements Bluetooth pairing, network scanning, and Wi-Fi provisioning;
// cloud credential-file transfer for newer models is not implemented here.

// GATT service and characteristic UUIDs. Keep the full UUIDs easy to compare
// with protocol captures; the characteristic prefixes differ by only one digit.
const WIFI_SETUP = {
  service: "4d790000-7361-5769-4669-436f6e666967",
  configuration: "4d790001-7361-5769-4669-436f6e666967", // Write commands.
  status: "4d790002-7361-5769-4669-436f6e666967", // Read/notify; requires pairing.
  identify: "4d790003-7361-5769-4669-436f6e666967", // Read; meaning unknown.
};
const WIFI_SCAN = {
  service: "4d790000-7361-2053-5349-442b52535349",
  network: "4d790001-7361-2053-5349-442b52535349",
  count: "4d790002-7361-2053-5349-442b52535349", // Write to start, read the count.
};
const DEVICE_INFORMATION_SERVICE = "device_information";
const DEVICE_INFORMATION_FIELDS = [
  ["Manufacturer", 0x2a29],
  ["Model", 0x2a24],
  ["Serial", 0x2a25],
  ["Hardware", 0x2a27],
  ["Firmware", 0x2a26],
  ["Software", 0x2a28],
];
const OPTIONAL_SERVICES = [
  WIFI_SETUP.service,
  WIFI_SCAN.service,
  DEVICE_INFORMATION_SERVICE,
];

// Command bytes and notification status bytes are separate protocol enums,
// even where a command and its acknowledgement happen to have the same value.
const COMMAND = {
  START_CONFIG: 0x20,
  SSID: 0x21,
  PASSWORD: 0x22,
  END_CONFIG: 0x2f,
};
const STATUS = {
  START_CONFIG_READY: 0x20,
  SSID_RECEIVED: 0x21,
  PASSWORD_RECEIVED: 0x22,
  CONNECTING: 0x40,
  CONNECTION_ESTABLISHED: 0x41,
  CONNECTION_FAILED: 0x42,
  TIMEOUT: 0x80,
  INVALID_SEQUENCE: 0xfd,
  INTERNAL_ERROR: 0xff,
};
const STATUS_NAMES = new Map(
  Object.entries(STATUS).map(([name, code]) => [code, name]),
);
export const FAILURE_HINT = {
  [STATUS.CONNECTION_FAILED]:
    "The thermostat couldn't join the network. Check the password, that the network is 2.4 GHz with WPA2 (not WPA3-only) and that the signal reaches the thermostat.",
  [STATUS.TIMEOUT]:
    "The thermostat gave up waiting. Check the network name and signal, then try again.",
  [STATUS.INVALID_SEQUENCE]:
    "The thermostat lost track of the setup steps. Click Disconnect, then Reconnect and send again.",
  [STATUS.INTERNAL_ERROR]:
    "The thermostat reported an internal error. Reset it into setup mode and try again.",
};
// These terminal failures share one definition with their user-facing hints.
const FAILURE_STATUSES = new Set(Object.keys(FAILURE_HINT).map(Number));

// Scan requests and scan record types both use 0x01, but have different roles.
const START_NETWORK_SCAN = 0x01;
const NETWORK_RECORD = {
  TYPE: 0x01,
  HEADER_BYTES: 2, // Record type, then payload length.
  RSSI_BYTES: 1,
};
const LITTLE_ENDIAN = true;
const NETWORK_COUNT_BYTES = Int16Array.BYTES_PER_ELEMENT;
const IDENTIFY_VALUE_BYTES = Uint16Array.BYTES_PER_ELEMENT;

const MAX_SSID_UTF8_BYTES = 32;
const MIN_WPA2_PASSPHRASE_LENGTH = 8;
const MAX_WPA2_PASSPHRASE_LENGTH = 63;
const WPA2_HEX_KEY_LENGTH = 64;

// Client retry, pacing, and safety limits, not firmware guarantees.
const MILLISECONDS_PER_SECOND = 1_000;
const CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_MS = 1_500;
const ACK_TIMEOUT_MS = 15_000;
const PAIR_TIMEOUT_MS = 90_000;
const JOIN_TIMEOUT_MS = 90_000;
const SCAN_TIMEOUT_MS = 45_000;
const SCAN_OPERATION_TIMEOUT_MS = 10_000;
const SCAN_SETTLE_MS = 2_000;
const MAX_NETWORK_RECORDS = 256;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// Byte/text helpers preserve the bounds of DataViews returned by GATT reads.
function asBytes(value) {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function toHex(value) {
  return [...asBytes(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function decodeText(value) {
  return utf8Decoder.decode(value).replace(/\0+$/, "");
}

function readStatusCode(value) {
  // Only the first byte is a status. An empty read has no status code.
  return value.byteLength === 0 ? null : value.getUint8(0);
}

function statusName(code) {
  if (code === null) {
    return "empty status";
  }
  // In particular, the observed idle byte 0x00 has no established meaning.
  return STATUS_NAMES.get(code) ?? `unknown 0x${code.toString(16)}`;
}

function encodeStringCommand(command, text) {
  // [command:u8, length:u8, ASCII(Base64(UTF-8(text)))].
  // Length counts Base64 bytes only, excluding the two-byte header.
  // Base64 is not encryption; Bluetooth pairing provides link security.
  const base64 = btoa(String.fromCharCode(...utf8Encoder.encode(text)));
  const payload = utf8Encoder.encode(base64); // Base64 characters are ASCII.
  return Uint8Array.of(command, payload.length, ...payload);
}

function decodeNetworkRecord(value) {
  // [type:u8, length:u8, ASCII(Base64(UTF-8(SSID))), RSSI:i8].
  // Unlike string commands, length includes the final signed RSSI byte.
  const minimumBytes = NETWORK_RECORD.HEADER_BYTES + NETWORK_RECORD.RSSI_BYTES;
  const bytes = asBytes(value);
  const [recordType, payloadLength] = bytes;
  if (bytes.length < minimumBytes || recordType !== NETWORK_RECORD.TYPE) {
    throw new Error("Invalid network record");
  }
  if (
    payloadLength < NETWORK_RECORD.RSSI_BYTES ||
    bytes.length !== NETWORK_RECORD.HEADER_BYTES + payloadLength
  ) {
    throw new Error("Invalid network record length");
  }

  const base64Bytes = bytes.subarray(
    NETWORK_RECORD.HEADER_BYTES,
    -NETWORK_RECORD.RSSI_BYTES,
  );
  const ssidBytes = Uint8Array.from(
    atob(String.fromCharCode(...base64Bytes)),
    (character) => character.charCodeAt(0),
  );
  const rssiOffset = value.byteLength - NETWORK_RECORD.RSSI_BYTES;
  return {
    ssid: utf8Decoder.decode(ssidBytes),
    rssi: value.getInt8(rssiOffset), // Signed dBm, measured by the thermostat.
  };
}

function decodeNetworkCount(value) {
  if (value.byteLength !== NETWORK_COUNT_BYTES) {
    throw new Error("Invalid network count from the thermostat.");
  }
  const count = value.getInt16(0, LITTLE_ENDIAN);
  // Preserve the client's treatment of negative counts as "not ready";
  // no particular firmware sentinel value has been established.
  if (count < 0) {
    throw new Error("The thermostat is still scanning. Try again shortly.");
  }
  return count;
}

export function validateCredentials(ssid, password) {
  if (!ssid) {
    return "Enter the network name.";
  }
  if (utf8Encoder.encode(ssid).length > MAX_SSID_UTF8_BYTES) {
    return `Network names are at most ${MAX_SSID_UTF8_BYTES} bytes long.`;
  }
  // An empty password is allowed for open networks; the page asks for confirmation.
  if (password.length > 0 && password.length < MIN_WPA2_PASSPHRASE_LENGTH) {
    return `Wi-Fi (WPA2) passwords are at least ${MIN_WPA2_PASSPHRASE_LENGTH} characters.`;
  }
  const isHexKey =
    password.length === WPA2_HEX_KEY_LENGTH && /^[0-9a-f]+$/i.test(password);
  if (password.length > MAX_WPA2_PASSPHRASE_LENGTH && !isHexKey) {
    return `Wi-Fi (WPA2) passwords are at most ${MAX_WPA2_PASSPHRASE_LENGTH} characters.`;
  }
  return "";
}

class OperationTimeoutError extends Error {}

function withTimeout(operation, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new OperationTimeoutError(message)),
      timeoutMs,
    );
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function statusError(code) {
  const error = new Error(statusName(code));
  error.code = code; // The page uses this to select a Mysa-specific failure hint.
  return error;
}

/**
 * Owns the Mysa protocol state for one browser Bluetooth connection.
 * The caller serializes actions, validates credentials, and pairs before scanning
 * or provisioning. Callbacks report progress without coupling the client to a UI.
 *
 * @param {import("./browser-bluetooth.js").BluetoothConnection} bluetooth
 * @param {{ log?: (message: string) => void, onDisconnect?: () => void }} options
 */
export function createMysaDevice(
  bluetooth,
  { log = () => {}, onDisconnect = () => {} } = {},
) {
  let statusCharacteristic = null;
  let configurationCharacteristic = null;
  let paired = false;
  let connecting = false;
  let receivedStatuses = [];
  const statusWaiters = new Set();

  function isConnected() {
    return Boolean(
      bluetooth.connected &&
        statusCharacteristic &&
        configurationCharacteristic,
    );
  }

  function requireConnection() {
    if (!isConnected()) {
      throw new Error("Bluetooth connection lost");
    }
  }

  // Track notifications before writing: an acknowledgement can arrive before
  // the GATT write promise resolves. Each command waits from its own cursor.
  function onStatusNotification(event) {
    if (event.target !== statusCharacteristic) {
      return;
    }
    const value = event.target.value;
    const code = readStatusCode(value);
    log(`← ${statusName(code)} [${toHex(value)}]`);
    receivedStatuses.push(code);
    for (const waiter of [...statusWaiters]) {
      waiter.check();
    }
  }

  function waitForStatus(expectedStatus, firstStatusIndex, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const waiter = {
        check() {
          for (
            let index = firstStatusIndex;
            index < receivedStatuses.length;
            index++
          ) {
            const received = receivedStatuses[index];
            if (received === expectedStatus) {
              finish();
              return;
            }
            if (FAILURE_STATUSES.has(received)) {
              finish(statusError(received));
              return;
            }
          }
          // A disconnect can happen during the write, before this waiter exists.
          if (!isConnected()) {
            finish(new Error("Bluetooth connection lost"));
          }
        },
        fail: (error) => finish(error),
      };
      const timer = setTimeout(() => {
        const seconds = timeoutMs / MILLISECONDS_PER_SECOND;
        finish(
          new Error(`no ${statusName(expectedStatus)} within ${seconds} s`),
        );
      }, timeoutMs);

      function finish(error) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        statusWaiters.delete(waiter);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }

      statusWaiters.add(waiter);
      waiter.check(); // Also inspect notifications that arrived during the write.
    });
  }

  async function writeCommand(bytes, label) {
    requireConnection();
    const characteristic = configurationCharacteristic;
    log(`sending ${label}…`);
    if (characteristic.properties.write) {
      await characteristic.writeValueWithResponse(bytes);
    } else {
      await characteristic.writeValueWithoutResponse(bytes);
    }
    // Log only the label and length; packet contents can contain a password.
    log(`→ ${label} (${bytes.length} bytes)`);
  }

  async function writeAndWaitForStatus(bytes, label, expectedStatus) {
    const firstStatusIndex = receivedStatuses.length;
    await writeCommand(bytes, label);
    // ATT write success is not a Mysa protocol acknowledgement.
    await waitForStatus(expectedStatus, firstStatusIndex, ACK_TIMEOUT_MS);
  }

  // Connection lifecycle and optional metadata.
  function clearConnection() {
    statusCharacteristic?.removeEventListener(
      "characteristicvaluechanged",
      onStatusNotification,
    );
    statusCharacteristic = null;
    configurationCharacteristic = null;
    paired = false;
    for (const waiter of [...statusWaiters]) {
      waiter.fail(new Error("Bluetooth connection lost"));
    }
  }

  bluetooth.onDisconnect = () => {
    clearConnection();
    if (connecting) {
      return; // The connection retry loop owns failures while connecting.
    }
    log("disconnected");
    onDisconnect();
  };

  async function readDeviceInformation(server) {
    const rows = [["Bluetooth name", bluetooth.name]];
    try {
      const service = await server.getPrimaryService(
        DEVICE_INFORMATION_SERVICE,
      );
      for (const [name, uuid] of DEVICE_INFORMATION_FIELDS) {
        try {
          const characteristic = await service.getCharacteristic(uuid);
          rows.push([name, decodeText(await characteristic.readValue())]);
        } catch {
          // Optional: missing, or blocked by Web Bluetooth (e.g. serial number).
        }
      }
    } catch (error) {
      log(`device info service unavailable: ${error.message}`);
    }
    return rows;
  }

  async function logIdentifyValue(wifiService) {
    try {
      const characteristic = await wifiService.getCharacteristic(
        WIFI_SETUP.identify,
      );
      const value = await characteristic.readValue();
      const interpretation =
        value.byteLength === IDENTIFY_VALUE_BYTES
          ? `; uint16 LE: ${value.getUint16(0, LITTLE_ENDIAN)}`
          : "";
      // The value's meaning is unknown; it is not an established pairing code.
      log(`Identify (raw): [${toHex(value)}]${interpretation}`);
    } catch (error) {
      log(`identify read failed: ${error.message}`);
    }
  }

  async function choose(acceptAll) {
    const options = acceptAll
      ? { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES }
      : {
          filters: [
            { services: [WIFI_SETUP.service] },
            { namePrefix: "Mysa" },
            { namePrefix: "MYSA" },
            { namePrefix: "mysa" },
          ],
          optionalServices: OPTIONAL_SERVICES,
        };
    const changed = await bluetooth.choose(options);
    if (changed) {
      clearConnection();
    }
  }

  async function connect() {
    connecting = true;
    clearConnection();
    receivedStatuses = [];
    try {
      for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
        try {
          const attemptLabel = attempt > 1 ? ` (attempt ${attempt})` : "";
          log(`connecting to "${bluetooth.label}"${attemptLabel}`);
          const server = await bluetooth.connect();
          const service = await server.getPrimaryService(WIFI_SETUP.service);
          const status = await service.getCharacteristic(WIFI_SETUP.status);
          const configuration = await service.getCharacteristic(
            WIFI_SETUP.configuration,
          );
          statusCharacteristic = status;
          configurationCharacteristic = configuration;
          status.addEventListener(
            "characteristicvaluechanged",
            onStatusNotification,
          );
          await status.startNotifications();
          log(
            `config characteristic: write=${configuration.properties.write} writeWithoutResponse=${configuration.properties.writeWithoutResponse}`,
          );
          const rows = await readDeviceInformation(server);
          await logIdentifyValue(service);
          requireConnection();
          return rows;
        } catch (error) {
          log(`connect failed: ${error.name}: ${error.message}`);
          clearConnection();
          bluetooth.disconnect();
          if (
            error.name === "NotFoundError" &&
            /service/i.test(error.message)
          ) {
            throw new Error(
              "this device isn't a Mysa in setup mode (no Wi-Fi setup service)",
            );
          }
          if (attempt < CONNECT_ATTEMPTS) {
            await sleep(CONNECT_RETRY_MS);
          }
        }
      }
      throw new Error("couldn't connect. Move closer and click Reconnect.");
    } finally {
      connecting = false;
    }
  }

  async function pair() {
    // Reading protected status triggers OS/browser pairing or reuses an existing
    // bond. It is independent of the printed HomeKit setup code.
    paired = false;
    log("pairing: the thermostat should now show a code");
    requireConnection();
    const characteristic = statusCharacteristic;
    const seconds = PAIR_TIMEOUT_MS / MILLISECONDS_PER_SECOND;
    const value = await withTimeout(
      characteristic.readValue(),
      PAIR_TIMEOUT_MS,
      `no answer within ${seconds} s`,
    );
    requireConnection();
    if (statusCharacteristic !== characteristic) {
      throw new Error("Bluetooth connection lost");
    }
    paired = true;
    const description = value.byteLength
      ? `${statusName(readStatusCode(value))} [${toHex(value)}]`
      : "(empty)";
    log(`paired; status ${description}`);
  }

  async function scanNetworks() {
    const server = bluetooth.server;
    const deadline = Date.now() + SCAN_TIMEOUT_MS;

    // Bound every GATT operation as well as the whole scan. GATT promises cannot
    // be cancelled, so a timed-out read must disconnect before another scan.
    async function scanOperation(operation) {
      requireConnection();
      if (bluetooth.server !== server) {
        throw new Error("Bluetooth connection lost");
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error("Network scan took too long. Try again.");
      }
      return withTimeout(
        operation(),
        Math.min(SCAN_OPERATION_TIMEOUT_MS, remainingMs),
        "The thermostat did not answer. Reconnect and try again.",
      );
    }

    try {
      if (!paired) {
        throw new Error("Pair with the thermostat first.");
      }
      const service = await scanOperation(() =>
        server.getPrimaryService(WIFI_SCAN.service),
      );
      const countCharacteristic = await scanOperation(() =>
        service.getCharacteristic(WIFI_SCAN.count),
      );
      const networkCharacteristic = await scanOperation(() =>
        service.getCharacteristic(WIFI_SCAN.network),
      );

      // No scan-completion notification is established. Send the trigger and
      // allow time for results; this never writes Wi-Fi credentials.
      await scanOperation(() =>
        countCharacteristic.writeValueWithResponse(
          Uint8Array.of(START_NETWORK_SCAN),
        ),
      );
      await sleep(SCAN_SETTLE_MS);
      const count = decodeNetworkCount(
        await scanOperation(() => countCharacteristic.readValue()),
      );
      const limit = Math.min(count, MAX_NETWORK_RECORDS);
      const networksBySsid = new Map();
      let skipped = 0;
      for (let index = 0; index < limit; index++) {
        const value = await scanOperation(() =>
          networkCharacteristic.readValue(),
        );
        try {
          const network = decodeNetworkRecord(value);
          const previous = networksBySsid.get(network.ssid);
          if (!previous || network.rssi > previous.rssi) {
            networksBySsid.set(network.ssid, network);
          }
        } catch {
          skipped++;
          log(`skipped unreadable network record ${index + 1}`);
        }
      }
      requireConnection();
      if (bluetooth.server !== server) {
        throw new Error("Bluetooth connection lost");
      }
      const networks = [...networksBySsid.values()].sort(
        (left, right) =>
          right.rssi - left.rssi || left.ssid.localeCompare(right.ssid),
      );
      log(
        `network scan: ${count} records, ${networks.length} names displayed, ${skipped} skipped`,
      );
      return { networks, count, limit, skipped };
    } catch (error) {
      if (error instanceof OperationTimeoutError && bluetooth.connected) {
        bluetooth.disconnect();
      }
      throw error;
    }
  }

  async function sendWifi(ssid, password, onJoining = () => {}) {
    // Follow the transaction explicitly: START → SSID → PASSWORD → END.
    // Each of the first three commands needs its own status acknowledgement.
    await writeAndWaitForStatus(
      Uint8Array.of(COMMAND.START_CONFIG),
      "START_CONFIG",
      STATUS.START_CONFIG_READY,
    );
    await writeAndWaitForStatus(
      encodeStringCommand(COMMAND.SSID, ssid),
      `SSID "${ssid}"`,
      STATUS.SSID_RECEIVED,
    );
    await writeAndWaitForStatus(
      encodeStringCommand(COMMAND.PASSWORD, password),
      `PASSWORD (${password.length} chars)`,
      STATUS.PASSWORD_RECEIVED,
    );

    const firstStatusIndex = receivedStatuses.length;
    await writeCommand(Uint8Array.of(COMMAND.END_CONFIG), "END_CONFIG");
    onJoining();
    // CONNECTING is only progress. Only CONNECTION_ESTABLISHED confirms the
    // reported Wi-Fi join; it says nothing about internet, HomeKit, or cloud setup.
    await waitForStatus(
      STATUS.CONNECTION_ESTABLISHED,
      firstStatusIndex,
      JOIN_TIMEOUT_MS,
    );
    log("done: the thermostat reports it joined the network");
  }

  return {
    get hasDevice() {
      return bluetooth.hasDevice;
    },
    get connected() {
      return isConnected();
    },
    get paired() {
      return paired;
    },
    choose,
    connect,
    disconnect: () => bluetooth.disconnect(),
    pair,
    scanNetworks,
    sendWifi,
  };
}
