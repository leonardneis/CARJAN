const express = require("express");
const http = require("http");
const cors = require("cors");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const {
  initializeCarjanRepository,
  deleteStatements,
  checkIfRepositoryExists,
} = require("./app/services/carjan/carjan-repository");

const app = express();
const port = 4204;

const server = http.createServer(app);
let flaskProcess = null;
let flaskPid = null;

function startFlaskService() {
  const flaskProcess = spawn(
    "python",
    ["app/services/carjan/server/flask_carjan.py"],
    {
      detached: true,
      stdio: "pipe",
    }
  );

  flaskProcess.stdout.on("data", (data) => {
    console.log(`=== Carjan Service === \n ${data}`);
  });

  flaskProcess.stderr.on("data", (data) => {
    console.error(`=== Carla Connection === \n ${data}`);
  });

  flaskProcess.on("close", (code) => {
    console.log(`Flask process exited with code ${code}`);
  });

  flaskProcess.unref();
  flaskPid = flaskProcess.pid;
  flaskProcess.on("exit", (code, signal) => {
    console.log(`Flask process exited with code ${code} and signal ${signal}`);
    flaskProcess = null;
  });
}

function stopFlaskService() {
  if (flaskProcess) {
    flaskProcess.kill();
  } else if (flaskPid) {
    try {
      process.kill(flaskPid);
      console.log("Flask service stopped.");
    } catch (err) {
      console.error(`Error stopping Flask process with PID ${flaskPid}:`, err);
    }
  } else {
    console.log("No Flask process to stop.");
  }
}

app.use(cors());

app.post("/api/init-carjan-repo", async (req, res) => {
  try {
    const result = await initializeCarjanRepository();
    res.json({ message: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/delete-statements", async (req, res) => {
  try {
    const result = await deleteStatements();
    res.json({ message: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/delete-carjan-repo", async (req, res) => {
  try {
    const result = await deleteStatements();
    res.json({ message: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/check-repository", async (req, res) => {
  try {
    const result = await checkIfRepositoryExists();
    res.json({ message: result });
    return result;
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.options("/api/carla", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

app.use(bodyParser.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Yes! Carjan Service is running.");
});

app.post("/api/carla-scenario", async (req, res) => {
  try {
    console.log("/carlascenario");
    const flaskResponse = await forwardToFlask();

    // Debug: Die erhaltene Antwort anzeigen
    console.log("Flask response:", flaskResponse);

    // Antwort an das Frontend senden
    res.json({
      status: "Scenario loaded from Flask",
      scenario: flaskResponse,
    });
  } catch (error) {
    console.error("Error forwarding to Flask:", error);
    res.status(500).json({ error: "Failed to load scenario" });
  }
});

app.get("/shutdown", (req, res) => {
  res.send("Shutting down server...");
  stopFlaskService();
  process.exit();
});

process.on("SIGINT", () => {
  console.log("Received SIGINT. Shutting down...");
  stopFlaskService();
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});

function forwardToFlask() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 5000,
      path: "/load_scenario",
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };

    // HTTP-Anfrage an Flask senden
    const req = http.request(options, (res) => {
      let data = "";

      // Daten vom Flask-Server empfangen
      res.on("data", (chunk) => {
        data += chunk;
      });

      // Anfrage abgeschlossen, Daten an das Node.js-Frontend zurückgeben
      res.on("end", () => {
        try {
          // Überprüfen, ob die Antwort gültiges JSON ist
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          console.error("Error parsing JSON from Flask:", error);
          console.log("Received response:", data); // Debugging
          reject("Invalid JSON received from Flask");
        }
      });
    });

    // Fehlerbehandlung bei der Anfrage
    req.on("error", (e) => {
      console.error(`Problem with request: ${e.message}`);
      reject(e);
    });

    // Anfrage beenden
    req.end();
  });
}

startFlaskService();
server.listen(port, () => {
  console.log(`Carjan Service listening on port ${port} :)`);
});
