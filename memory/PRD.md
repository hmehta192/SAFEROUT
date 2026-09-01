# SafeRoute — Product Requirements Document

## Original Problem Statement
SaaS platform for school transport live tracking in India. Three roles (Admin, Driver, Parent) in one app. Driver: Start/End trip, GPS every 10s, manage batches, mark absent, move students; affected parents notified. Parent: live map, trip status (Started/On the Way/Reached), alerts. Admin: manage drivers/parents/students/batches, subscription tracker (monthly/annual per child), dashboard of active trips + users. Dark, mobile-first, professional.

## User Choices
- App name: **SafeRoute**; target: small-city India; language English.
- Auth: **Phone/OTP** (simulated in preview — backend returns `dev_otp`, login auto-fills it).
- Map: **react-native-maps (Google)**; web has a placeholder fallback.
- Subscriptions: **manual tracking** (no real payments).
- Notifications: **in-app alerts** (no push, per user choice).
- Single app, **role-based navigation**.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT auth (PyJWT), phone/OTP, role guards (admin/driver/parent). UUID string ids, soft deletes (`deleted_at`), `_id` excluded from all responses. Seed on startup.
- **Frontend**: Expo Router (stack, role-routed from `/`), react-native-keyboard-controller, expo-location (10s GPS loop), custom Toast + Modal Sheet, Rajdhani/DM Sans fonts.
- **Theme**: Dark-First Utility — Obsidian `#0F1115` + Safety Amber `#FFAB00`.

## User Personas
- **Admin** (school office): registers users, assigns batches, tracks subscriptions, watches live trips.
- **Driver** (small-city van driver): one-tap Start/End trip, absent/move toggles.
- **Parent**: watches the bus live, sees status + alerts.

## Implemented (2026-06)
- Phone/OTP login with auto-filled dev OTP + quick demo chips.
- Role routing: admin→/admin, driver→/driver, parent→/parent.
- Driver: batches+students, start trip, 10s GPS ping (real or simulated), On-the-Way/Reached status, end trip, mark absent, move student (alerts parents).
- Parent: live map + moving marker, status timeline, child selector chips, alerts sheet with unread badge, absent banner.
- Admin: overview metrics + live trips, CRUD drivers/parents/students/batches, subscription tracker (monthly ₹800 / annual ₹8000, active/expired).
- Fixes: token-race gating on `user`, sticky Sheet Save footer, polling stops after logout.
- Backend tested 19/19 pytest; frontend flows verified.

## Backlog
- **P1**: Route polyline / history trail on parent map; ETA estimation.
- **P1**: Real SMS OTP gateway (Twilio) for production.
- **P2**: Push notifications (needs native build); attendance history/reports.
- **P2**: Razorpay for real subscription billing; driver profile photos via object storage.

## Next Tasks
- Add ETA + trail to parent map.
- Add attendance history per student.
