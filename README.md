# Mysa Wi-Fi Setup over Bluetooth (no app needed)

Connect a **Mysa smart thermostat to Wi-Fi from your web browser** over Bluetooth. You don't need the Mysa app or a Mysa account, and there's nothing to install.

**▶ Open it: <https://sokolskynikita.github.io/mysa-wifi-setup/>**

Handy when the Mysa app's pairing keeps failing, after a new router or Wi-Fi password, or when you want your Mysa on the network only for local control from **Home Assistant** or **Apple Home (HomeKit)**.

## What you need
- A Mysa showing the **Bluetooth icon** (setup mode). To get there, hold both arrow buttons until the 10-second countdown ends and it restarts. Mysas that show a Wi-Fi icon instead aren't supported.
- A **2.4 GHz** Wi-Fi network with WPA2 or mixed WPA2/WPA3. Mysa can't join 5 GHz-only or WPA3-only networks.
- **Chrome, Edge or Opera** on macOS, Windows, ChromeOS or Android ([Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)). Not supported: iPhone/iPad, Firefox, Safari. On Linux, enable `chrome://flags/#enable-experimental-web-platform-features`.

Tested with a Mysa Baseboard Lite (`BB-V2-0-L`). Other Baseboard, In-floor and AC models that show the Bluetooth icon in setup mode should work too; please open an issue with your result either way.

**Not supported: Mysa Baseboard V3, Mysa for Central HVAC and the Mysa Climate Sensor.** Besides Wi-Fi, these need a credential file from Mysa's cloud sent over Bluetooth, plus a few cloud registration steps, which this page can't do. Use the Mysa app for these models. Details: [cloud-api.md](https://github.com/SokolskyNikita/mysa-homeassistant/blob/main/docs/cloud-api.md), "Newer models".

## Steps
1. Click **Find Mysa** and pick the thermostat in the browser's device list.
2. Click **Pair**. The thermostat shows a code; type it into your computer's or phone's Bluetooth pairing prompt.
3. Enter the Wi-Fi name and password and click **Send**. The page tells you when the thermostat has joined.

## Troubleshooting
- **Mysa not listed:** check for the Bluetooth icon, move closer, or use *Show all nearby devices*.
- **Pairing fails or times out:** remove "Mysa" from your system's Bluetooth devices (Forget / Unpair), then Reconnect and Pair again. Enter the code quickly.
- **Connection failed:** wrong password, a 5 GHz-only or WPA3-only network, or weak signal at the thermostat.
- The page's *Technical log* shows every Bluetooth message.

## Home Assistant and HomeKit
On Wi-Fi, HomeKit-capable Mysas (e.g. the Baseboard Lite) advertise themselves on your network. Add one in Home Assistant with the **HomeKit Device** integration, or in the Apple Home app, using its HomeKit setup code. That gives you local control of the setpoint and mode, with no cloud involved.

## Privacy
It's one static HTML file, with no dependencies or analytics. A Content-Security-Policy keeps the page from loading or sending anything over the network, so your Wi-Fi password goes only to the thermostat over Bluetooth.
To run it yourself, serve `index.html` from `https://` or `http://localhost` (e.g. `python3 -m http.server`). Web Bluetooth needs a secure context.

## How it works
GATT service `4d790000-7361-5769-4669-436f6e666967` ("MysaWiFiConfig" in ASCII):

| Characteristic | Use |
|---|---|
| `4d790001-…` | write: config packets |
| `4d790002-…` | notify/read: status. Needs an encrypted link, so reading it starts pairing (passkey shown on the thermostat) |
| `4d790003-…` | read: identify |

Packets: `0x20` start, `0x21` SSID, `0x22` password, `0x2F` end. SSID and password are `[type, length, base64(UTF-8 text)]`. Send each one after the matching status notification.
Status: `0x20`/`0x21`/`0x22` acks, `0x40` connecting, `0x41` connected, `0x42` connection failed, `0x80` timeout, `0xFD` invalid sequence, `0xFF` internal error.

---
Not affiliated with or endorsed by Mysa. Mysa is a trademark of its owner. [MIT License](LICENSE).
