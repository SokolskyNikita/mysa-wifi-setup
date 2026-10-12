function getOperatingSystem() {
  const userAgent = navigator.userAgent;

  if (/Android/.test(userAgent)) return "android";
  if (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  if (/CrOS/.test(userAgent)) return "chromeos";
  if (/Mac/.test(userAgent)) return "mac";
  if (/Win/.test(userAgent)) return "windows";
  if (/Linux/.test(userAgent)) return "linux";

  return "other";
}

export class BluetoothConnection {
  #device = null;

  #handleDisconnect = (event) => {
    const device = this.#device;

    if (event.target !== device || device.gatt.connected) return;
    this.onDisconnect();
  };

  constructor() {
    this.onDisconnect = () => {};
  }

  get hasDevice() {
    return Boolean(this.#device);
  }

  get name() {
    return this.#device?.name || "(none)";
  }

  get label() {
    return this.#device?.name || this.#device?.id || "";
  }

  get connected() {
    return Boolean(this.#device?.gatt?.connected);
  }

  get server() {
    return this.#device?.gatt;
  }

  async choose(options) {
    const device = await navigator.bluetooth.requestDevice(options);

    if (device === this.#device) return false;

    if (this.#device) {
      this.#device.removeEventListener(
        "gattserverdisconnected",
        this.#handleDisconnect,
      );
      this.#device.gatt?.disconnect();
    }

    this.#device = device;
    device.addEventListener("gattserverdisconnected", this.#handleDisconnect);

    return true;
  }

  async connect() {
    return await this.#device.gatt.connect();
  }

  disconnect() {
    this.#device?.gatt?.disconnect();
  }
}

export function isBluetoothSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    Boolean(navigator.bluetooth) &&
    window.isSecureContext
  );
}

export function supportProblem() {
  const userAgent = navigator.userAgent;
  const operatingSystem = getOperatingSystem();

  if (!window.isSecureContext) {
    return "Open this page over https:// (or http://localhost). Browsers turn Bluetooth off for insecure pages.";
  }
  if (navigator.bluetooth) return "";
  if (operatingSystem === "ios") {
    return "iPhone and iPad browsers don't support Web Bluetooth. Use Chrome or Edge on a computer or an Android phone.";
  }
  if (/Firefox\//.test(userAgent)) {
    return "Firefox doesn't support Web Bluetooth. Open this page in Chrome or Edge.";
  }
  if (navigator.brave) {
    return "Brave turns Web Bluetooth off by default. Enable brave://flags/#brave-web-bluetooth-api, or use Chrome or Edge.";
  }
  if (operatingSystem === "linux") {
    return "Chrome on Linux needs chrome://flags/#enable-experimental-web-platform-features enabled for Web Bluetooth.";
  }

  return "This browser doesn't support Web Bluetooth. Open this page in Chrome or Edge on a computer or an Android phone.";
}

export function watchBluetoothAvailability(onChange) {
  const bluetooth =
    typeof navigator === "undefined" ? undefined : navigator.bluetooth;

  if (!bluetooth?.getAvailability) return () => {};

  let watching = true;

  const checkAvailability = async () => {
    try {
      const available = await bluetooth.getAvailability();

      if (watching) onChange(Boolean(available));
    } catch {
      // Availability checks are optional and must not block the device chooser.
    }
  };

  bluetooth.addEventListener?.("availabilitychanged", checkAvailability);
  checkAvailability();

  return () => {
    watching = false;
    bluetooth.removeEventListener?.("availabilitychanged", checkAvailability);
  };
}
