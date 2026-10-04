# Agapay Capstone Project — Evaluation & Setup Guide

Welcome to the **Agapay** Capstone Project repository.  
This guide is designed to be completely beginner-proof so evaluators and panelists can launch, explore, and evaluate the full application in minutes.

---

## ☁️ Cloud Architecture Note (Zero Backend Setup Required)

The **Agapay Backend API** and **PostgreSQL Database** are already deployed and actively running live in the cloud:
* **Live API Backend:** `https://agapay-backend-production.up.railway.app` (Hosted on Railway)
* **Live Database & Storage:** Supabase (AWS ap-south-1)

> 💡 **What this means for evaluation:**  
> **You do NOT need to install .NET 9 or run a local backend server to evaluate the project.** Both the **Admin Portal** and the **Mobile App** are pre-configured to connect to the live cloud backend out of the box!

---

## ⚙️ 1. Prerequisites (Install Before Running)

To evaluate the frontends, the computer only needs:

| Requirement | Minimum Version | Download Link | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | **v20.x LTS** (or v18+) | [nodejs.org](https://nodejs.org/) | Required to run Admin and Mobile frontend |
| **Web Browser** | Any modern browser | Google Chrome / Microsoft Edge | To view the Admin Portal and Mobile Web interface |
| **Expo Go** *(Optional)* | Latest | Google Play / iOS App Store | Only needed if evaluating mobile on a physical smartphone |
| **.NET 9.0 SDK** *(Optional)* | .NET 9.0 | [dotnet.microsoft.com](https://dotnet.microsoft.com/download/dotnet/9.0) | **Only** required if you specifically wish to compile and run the local C# backend |

> **Quick Verification:** Open Command Prompt or PowerShell and confirm:
> ```bash
> node -v
> ```

---

## 🛑 Critical Step Before Running (When Using a CD)

A CD disc is hardware **Read-Only**. Running terminal commands directly inside `D:\` or `E:\` will fail with permission errors.

👉 **Always copy the entire `Capstone` folder from the CD onto your local `Desktop` or `C:\` drive first**, then open your terminals inside the copied folder.

---

## ⚡ Quick Reference: Ports & Addresses

| Application | Technology | Default URL / Port | Backend Connection |
| :--- | :--- | :--- | :--- |
| **Admin Web Portal** | React + Vite | `http://localhost:5173` | Live Cloud API (Railway) |
| **Mobile App (Web Mode)** | React Native / Expo | `http://localhost:8081` | Live Cloud API (Railway) |
| **Backend API (Optional)** | ASP.NET Core 9 | `http://localhost:5211` | Local Swagger at `/swagger` |

---

## 🚀 2. Fast-Track Evaluation (Recommended)

> You will need **2 terminal / command prompt windows** open side-by-side:

```
┌──────────────────────────────────────────┐   ┌──────────────────────────────────────────┐
│           TERMINAL WINDOW 1              │   │           TERMINAL WINDOW 2              │
│                                          │   │                                          │
│              agapay-admin                │   │                 Agapay                   │
│           (Admin Web Portal)             │   │              (Mobile App)                │
│                                          │   │                                          │
│        👉 http://localhost:5173          │   │         👉 http://localhost:8081         │
│     (Connected to Cloud Backend)         │   │      (Connected to Cloud Backend)        │
└──────────────────────────────────────────┘   └──────────────────────────────────────────┘
```

---

### Step 1: Start the Admin Web Portal (Window 1)

1. Open your **first** terminal window and navigate to `agapay-admin`:
   ```bash
   cd agapay-admin
   ```
2. Install dependencies (*required since node_modules was omitted from CD*):
   ```bash
   npm install
   ```
3. Start the portal:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to:  
   👉 **`http://localhost:5173`**  
   *(The portal connects automatically to the live cloud backend and database).*

---

### Step 2: Start the Mobile Application (Window 2)

1. Open your **second** terminal window and navigate to `Agapay`:
   ```bash
   cd Agapay
   ```
2. Install dependencies (*required since node_modules was omitted from CD*):
   ```bash
   npm install
   ```
3. Launch the application:

   #### 🌐 Option A: In your Web Browser (Fastest — No phone required)
   ```bash
   npm run web
   ```
   *Your browser will open automatically at **`http://localhost:8081`**.*

   #### 📱 Option B: On a Physical Phone via Expo Go
   1. Install **Expo Go** from Google Play (Android) or App Store (iOS).
   2. Ensure your phone and PC are connected to the same Wi-Fi.
   3. Run:
      ```bash
      npm start
      ```
   4. Scan the QR code printed in the terminal with the Expo Go app.

---

## 🛠️ 3. Optional: Running the Local C# Backend

If the evaluation panel specifically asks to see the backend compiled and running locally on the evaluation PC:

*Requirement: The PC must have the [.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0) installed.*

1. Open a **third** terminal window:
   ```bash
   cd agapay-backend/agapay-backend
   dotnet run
   ```
2. Once running, view interactive API documentation at:  
   👉 **`http://localhost:5211/swagger`**

---

## 🔑 4. Demo Accounts & Credentials

Use these credentials to test administrative and platform features:

### 🛡️ Admin Portal (`http://localhost:5173`)
* **Email:** `admin@demo.agapay.com`
* **Password:** `Password123!`

---

## ❓ 5. Frequently Asked Questions & Troubleshooting

### Q: Why do I need to run `npm install`?
* `node_modules` was excluded from the CD disc to reduce project size from ~1 GB to under 300 MB, fitting comfortably on a standard 700 MB CD and speeding up file copy times.

### Q: Error: "Address already in use" (Port 5173 or 8081)
* Another instance is already running. Close any active terminal windows or kill the Node processes via Windows Task Manager.

### Q: Does the evaluation computer need internet access?
* **Yes.** Because the database and backend are securely hosted on the cloud (Supabase & Railway), the evaluation PC requires an active internet connection to load and save data.
