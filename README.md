# Mysa Wi-Fi setup over Bluetooth (no app needed)

Connect a **Mysa smart thermostat to Wi-Fi from your web browser** over Bluetooth. You don't need the Mysa app or a Mysa account, and there's nothing to install.

**▶ Open it: <https://sokolskynikita.github.io/mysa-wifi-setup/>**

## What you need

- A Mysa showing the **Bluetooth icon** (setup mode). To get there, hold both arrow buttons until the 10-second countdown ends and it restarts.
- A **2.4 GHz** Wi-Fi network with WPA2 or mixed WPA2/WPA3. Mysa can't join 5 GHz-only or WPA3-only networks.
- **Chrome, Edge or Opera** on macOS, Windows, ChromeOS or Android. Not supported: iPhone/iPad, Firefox, Safari. On Linux, enable `chrome://flags/#enable-experimental-web-platform-features`.

## Models

- **Hardware-tested:** Mysa Baseboard Lite (`BB-V2-0-L`, firmware `3.17.5.13`).
- **App-derived compatibility:** Baseboard V1/V2, In-floor and AC have legacy setup paths, but BLE availability and this page's behavior need validation on each model. Please report results for your model.
- **Coming soon:** Mysa Baseboard V3, Mysa for Central HVAC and the Mysa Climate Sensor. Use the Mysa app for these for now.

For packet formats and validation limits, see the public [Bluetooth reference](https://github.com/SokolskyNikita/mysa-homeassistant/blob/main/docs/bluetooth.md).

## Steps

1. Click **Find Mysa** and pick the thermostat in the browser's device list.
2. Click **Pair**. The thermostat shows a code on its screen and tries to pair with your phone or laptop. If the codes match, click Pair/Accept on your device. It sometimes takes 2-3 tries.
3. Enter the Wi-Fi name and password and click **Send**. The page tells you when the thermostat has joined.

After pairing, click **Show networks** to ask the thermostat for nearby network names and signal strength. This only displays the results; enter your network name yourself as usual. Click **Show networks** again to refresh the list.

Signal readings include colors and text labels: **Good** (green, −70 dBm or stronger), **Weak** (amber, −71 to −79 dBm), and **Poor** (red, −80 dBm or weaker). These are approximate Wi-Fi quality bands based on [Cisco's RSSI guidance](https://www.cisco.com/c/en/us/support/docs/smb/wireless/CB-Wireless-Mesh/1902-tz-Troubleshooting-Traditional-Cisco-Wireless-Network.html), not Mysa-certified operating limits. RSSI alone cannot account for interference or prove that a connection works.

## Troubleshooting

- **Mysa not listed:** check for the Bluetooth icon, move closer or use _Show all nearby devices_.
- **Pairing fails or times out:** remove "Mysa" from your system's Bluetooth devices (Forget / Unpair), then Reconnect and Pair again.
- **Connection failed:** check the password and the signal at the thermostat.

## Home Assistant

Once the Mysa is on Wi-Fi, we recommend **[Mysa Local](https://github.com/SokolskyNikita/mysa-homeassistant)** (install through HACS). It controls the thermostat over your own network, with your Mysa account as an optional extra. You can also add it to Apple Home with its HomeKit setup code.

## Privacy

Your Wi-Fi name and password are sent directly from your browser to the selected thermostat over paired Bluetooth. The page does not upload them, save them in browser storage, or log your password. It clears the password field after successful setup.

Opening the hosted page still makes normal web requests to GitHub Pages to download the page, styles, and scripts; the host can see your IP address. The code has no analytics or third-party scripts.

The technical log can contain your network name and device identifiers. It stays in the page unless you copy or share it. This page does not control the thermostat's own internet activity after it joins Wi-Fi.

## Run locally

To run it yourself, serve this directory from `https://` or `http://localhost`. For example, from the repository root:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in a supported browser.

The page is split into a small set of files: `index.html` holds the content, `styles.css` holds its presentation, `app.js` connects the page UI, `browser-bluetooth.js` handles browser Bluetooth setup and device access, and `mysa.js` implements the Mysa Bluetooth protocol.

---

Not affiliated with or endorsed by Mysa. Mysa is a trademark of its owner. [MIT License](LICENSE).
