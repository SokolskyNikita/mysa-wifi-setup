# Mysa Wi-Fi setup over Bluetooth (no app needed)

Connect a **Mysa smart thermostat to Wi-Fi from your web browser** over Bluetooth. You don't need the Mysa app or a Mysa account, and there's nothing to install.

**▶ Open it: <https://sokolskynikita.github.io/mysa-wifi-setup/>**

## What you need
- A Mysa showing the **Bluetooth icon** (setup mode). To get there, hold both arrow buttons until the 10-second countdown ends and it restarts.
- A **2.4 GHz** Wi-Fi network with WPA2 or mixed WPA2/WPA3. Mysa can't join 5 GHz-only or WPA3-only networks.
- **Chrome, Edge or Opera** on macOS, Windows, ChromeOS or Android. Not supported: iPhone/iPad, Firefox, Safari. On Linux, enable `chrome://flags/#enable-experimental-web-platform-features`.

## Models
- **Supported:** Mysa Baseboard Lite (tested), Mysa Baseboard V1 and V2, Mysa for In-Floor Heating and Mysa for AC. Tried another model? Please open an issue with the result.
- **Coming soon:** Mysa Baseboard V3, Mysa for Central HVAC and the Mysa Climate Sensor. Use the Mysa app for these for now.

## Steps
1. Click **Find Mysa** and pick the thermostat in the browser's device list.
2. Click **Pair**. The thermostat shows a code on its screen and tries to pair with your phone or laptop. If the codes match, click Pair/Accept on your device. It sometimes takes 2-3 tries.
3. Enter the Wi-Fi name and password and click **Send**. The page tells you when the thermostat has joined.

## Troubleshooting
- **Mysa not listed:** check for the Bluetooth icon, move closer or use *Show all nearby devices*.
- **Pairing fails or times out:** remove "Mysa" from your system's Bluetooth devices (Forget / Unpair), then Reconnect and Pair again.
- **Connection failed:** check the password and the signal at the thermostat.

## Home Assistant
Once the Mysa is on Wi-Fi, we recommend **[Mysa Local](https://github.com/SokolskyNikita/mysa-homeassistant)** (install through HACS). It controls the thermostat over your own network, with your Mysa account as an optional extra. You can also add it to Apple Home with its HomeKit setup code.

## Privacy
It's one static HTML file with no dependencies or analytics. It can't send anything over the internet, so your Wi-Fi password goes only to the thermostat.
To run it yourself, serve `index.html` from `https://` or `http://localhost` (e.g. `python3 -m http.server`).

---
Not affiliated with or endorsed by Mysa. Mysa is a trademark of its owner. [MIT License](LICENSE).
