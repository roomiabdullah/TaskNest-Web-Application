# TaskNest - Real-Time Collaborative Task Management

TaskNest is a lightweight, secure, and real-time task management application designed for both personal productivity and team collaboration. It features a hybrid workspace, role-based access control (RBAC), and live synchronization across devices.

## 🚀 Features
- **Hybrid Workflow:** Seamlessly switch between Personal and Team tasks.
- **Real-Time Sync:** Updates, edits, and deletions reflect instantly for all users.
- **Role-Based Security:** Admins have full control; Members have strict read/write permissions.
- **Interactive Progress:** Task progress bars update automatically based on sub-task completion.
- **Self-Cleaning Database:** Automatically removes stale data (e.g., deleted teams) from user profiles.

## 🛠️ Tech Stack
- **Frontend:** Vanilla JavaScript (ES6 Modules), HTML5
- **Styling:** TailwindCSS
- **Backend:** Google Cloud Firestore (NoSQL)
- **Auth:** Firebase Authentication
- **Deployment:** Docker (Nginx container)

---

## 💻 How to Run This Project

### Option 1: Standard Method (VS Code)
1. Clone the repository.
2. Open the folder in **VS Code**.
3. Install the **"Live Server"** extension.
4. Right-click `index.html` (or `login.html`) and select **"Open with Live Server"**.
5. The app will launch in your default browser.

### Option 2: Docker Container (Recommended)
This project is containerized using Nginx. To run it as a standalone container:

**1. Build the Image**
```bash
docker build -t tasknest-v1 .

docker run -d -p 8080:80 tasknest-v1