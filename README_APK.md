# OPD LoggerX — APK Starter (Capacitor)

This wraps your **offline OPD LoggerX** into a **self-contained Android APK**. It works **offline from first launch**.

## Prereqs
- Node.js 18+
- Android Studio + Android SDK
- Java 17 (bundled with new Android Studio)

## Quick Start
```bash
cd opd-apk-starter
npm install
npx cap add android
npx cap copy
npx cap open android
```
Then in Android Studio:
- **Build > Build APK(s)** for a debug APK
- **Build > Generate Signed Bundle/APK** for release

## Customize
- Change app id/name in `capacitor.config.json`, then `npx cap sync android`.
- Update files in `/www` and run `npx cap copy`.
