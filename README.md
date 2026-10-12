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

After pairing, click **Show networks** to ask the thermostat for nearby network names and signal strength. This only displays the results; enter your network name yourself as usual. Click **Show networks** again to refresh the list.

Signal readings include colors and text labels: **Good** (green, −70 dBm or stronger), **Weak** (amber, −71 to −79 dBm), and **Poor** (red, −80 dBm or weaker). These are approximate Wi-Fi quality bands based on [Cisco's RSSI guidance](https://www.cisco.com/c/en/us/support/docs/smb/wireless/CB-Wireless-Mesh/1902-tz-Troubleshooting-Traditional-Cisco-Wireless-Network.html), not Mysa-certified operating limits. RSSI alone cannot account for interference or prove that a connection works.

## Troubleshooting
- **Mysa not listed:** check for the Bluetooth icon, move closer or use *Show all nearby devices*.
- **Pairing fails or times out:** remove "Mysa" from your system's Bluetooth devices (Forget / Unpair), then Reconnect and Pair again.
- **Connection failed:** check the password and the signal at the thermostat.

## Home Assistant
Once the Mysa is on Wi-Fi, we recommend **[Mysa Local](https://github.com/SokolskyNikita/mysa-homeassistant)** (install through HACS). It controls the thermostat over your own network, with your Mysa account as an optional extra. You can also add it to Apple Home with its HomeKit setup code.

### Can setup verify HomeKit locally?

The page's success message means the thermostat reported joining Wi-Fi over Bluetooth. HomeKit discovery and pairing are separate checks:

- **Discoverable on the LAN:** HomeKit IP devices advertise `_hap._tcp.local.` over mDNS with their hostname, port, model and pairing status.
- **Ready to pair or already paired:** bit 0 of the advertised `sf` field means "not paired". `sf & 1` set means ready to pair; clear means the accessory reports an existing pairing. This does not identify the controller or prove that Apple Home or Home Assistant can still authenticate.
- **Working with a particular controller:** that controller must open an authenticated HomeKit session using its saved pairing keys and successfully read the accessory. The Wi-Fi setup page has no HomeKit pairing keys.

Our ordinary static webpage has no mDNS browsing API or raw UDP socket access. Browser Local Network Access permission does not supply service discovery or remove normal CORS restrictions. Chrome's Direct Sockets support is restricted to installed Isolated Web Apps, so it is not a drop-in solution for this page. A future check would need a local companion program or Home Assistant endpoint to perform discovery and return the result. An internet-hosted proxy cannot browse the user's LAN.

On a Mac, a manual discovery check is `dns-sd -B _hap._tcp local.`; resolve a displayed instance with `dns-sd -L 'Mysa-xxxxxx' _hap._tcp local.` to see its TXT fields. Stop either command with Ctrl+C. Missing discovery is inconclusive: multicast isolation, sleep, or a different network can hide a device.

Sources: [Apple's HomeKit service-discovery implementation](https://github.com/apple/HomeKitADK/blob/master/HAP/HAPIPServiceDiscovery.c), [Chrome Direct Sockets](https://developer.chrome.com/docs/iwa/direct-sockets), and [Local Network Access guidance](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/security/local-network-access.md).

## Privacy
It's one static HTML file with no dependencies or analytics. It can't send anything over the internet, so your Wi-Fi password goes only to the thermostat.
To run it yourself, serve `index.html` from `https://` or `http://localhost` (e.g. `python3 -m http.server`).

---
Not affiliated with or endorsed by Mysa. Mysa is a trademark of its owner. [MIT License](LICENSE).
