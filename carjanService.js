const express = require("express");
const http = require("http");
const cors = require("cors");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const fetch = require("node-fetch");

const {
  initializeCarjanRepository,
  deleteStatements,
  checkIfRepositoryExists,
} = require("./app/services/carjan/carjan-repository");

const app = express();
const port = 4204;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let flaskProcess = null;
let flaskPid = null;

dotenv.config();

function broadcastMessage(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function startFlaskService() {
  flaskProcess = spawn(
    "python",
    ["app/services/carjan/server/flask_carjan.py"],
    {
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  console.log("=== Carjan Service ===");
  broadcastMessage("=== Carjan Service ===");

  flaskProcess.stdout.on("data", (data) => {
    const message = `> \n${data.toString()}`;

    console.log(message);
    broadcastMessage(message);
  });

  flaskProcess.stderr.on("data", (data) => {
    const messageText = data.toString().trim();
    let message;

    if (messageText.toLowerCase().includes("warning")) {
      message = `[Warning] ${messageText}`;
    } else if (messageText.toLowerCase().includes("warning")) {
      message = `[Error] ${messageText}`;
    }

    console.error(message);
    broadcastMessage(message);
  });

  flaskProcess.on("close", (code) => {
    const message = `Flask process exited with code ${code}`;
    console.log(message);
    broadcastMessage(message);
  });

  flaskProcess.on("exit", (code, signal) => {
    const message = `Flask process exited with code ${code} and signal ${signal}`;
    console.log(message);
    broadcastMessage(message);
    flaskProcess = null;
  });

  flaskProcess.unref();
  flaskPid = flaskProcess.pid;
}

async function destroyActors() {
  try {
    const flaskResponse = await forwardToFlask("/destroy_actors");

    console.log("Flask response:", flaskResponse);

    res.json({});
  } catch (error) {
    console.error("Error forwarding to Flask:", error);
    res.status(500).json({ error: "Failed to load scenario" });
  }
}

async function stopFlaskService() {
  if (flaskProcess) {
    try {
      flaskProcess.kill();
      console.log("Flask service stopped.");
      flaskProcess = null;
      flaskPid = null;
      return true;
    } catch (err) {
      console.error("Error stopping Flask process:", err);
      return false;
    }
  } else if (flaskPid) {
    try {
      process.kill(flaskPid);
      console.log(`Flask process with PID ${flaskPid} stopped.`);
      flaskProcess = null;
      flaskPid = null;
      return true;
    } catch (err) {
      console.error(`Error stopping Flask process with PID ${flaskPid}:`, err);
      return false;
    }
  } else {
    console.log("No Flask process to stop.");
    process.exit(1);
  }
}

async function waitForFlaskToBeReady() {
  const maxAttempts = 10;
  const delay = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await forwardToFlask("/health_check");
      console.log("Flask response:", response);

      if (response && response.status === "OK") {
        console.log("Flask is ready.");
        return true;
      }
    } catch (error) {
      console.log(`Flask not ready, attempt ${attempt}...`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
}

function shutdownServer() {
  return new Promise((resolve) => {
    server.close(() => {
      console.log("Server closed.");
      resolve();
    });
  });
}

function loadEnvVariables(envFilePath) {
  if (fs.existsSync(envFilePath)) {
    return dotenv.parse(fs.readFileSync(envFilePath));
  }
  return {};
}

const validTypes = [
  "CARLA_PATH",
  "GITHUB_TOKEN",
  "GITHUB_REPO_USERNAME",
  "GITHUB_REPO_REPOSITORY",
  "SELECTED_SCENARIO",
];

app.use(cors());
app.use(express.json());

app.post("/api/download_from_github", async (req, res) => {
  const { scenarioName } = req.body;
  console.log("Scenario name:", scenarioName);
  const envFilePath = path.join(__dirname, "app", "services", "carjan", ".env");
  const currentEnvVars = loadEnvVariables(envFilePath);
  const GITHUB_USERNAME = currentEnvVars.GITHUB_REPO_USERNAME;
  const GITHUB_REPO = currentEnvVars.GITHUB_REPO_REPOSITORY;
  const GITHUB_TOKEN = currentEnvVars.GITHUB_TOKEN;

  if (!scenarioName) {
    return res.status(400).json({ error: "Scenario name is required" });
  }

  const filePath = `${scenarioName}.trig`;
  const githubApiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${filePath}`;

  try {
    const response = await fetch(githubApiUrl, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3.raw",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch scenario from GitHub: ${response.statusText}`
      );
    }

    const trigContent = await response.text();

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${scenarioName}.trig"`
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(trigContent);
  } catch (error) {
    console.error("Error downloading scenario from GitHub:", error);
    res.status(500).json({ error: "Failed to download scenario from GitHub" });
  }
});

app.post("/api/upload_to_github", async (req, res) => {
  const envFilePath = path.join(__dirname, "app", "services", "carjan", ".env");
  const currentEnvVars = loadEnvVariables(envFilePath);
  const GITHUB_USERNAME = currentEnvVars.GITHUB_REPO_USERNAME;
  const GITHUB_REPO = currentEnvVars.GITHUB_REPO_REPOSITORY;
  const GITHUB_TOKEN = currentEnvVars.GITHUB_TOKEN;

  if (!GITHUB_USERNAME || !GITHUB_REPO || !GITHUB_TOKEN) {
    return res
      .status(500)
      .json({ error: "GitHub username, repository, or token is undefined." });
  }

  const BASE_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents`;

  const { content, name } = req.body;
  const fileName = name ? `${name}.trig` : "default_scenario.trig";

  if (!content) {
    return res.status(400).json({ error: "Content is required." });
  }

  try {
    const encodedContent = Buffer.from(content).toString("base64");
    const fileUrl = `${BASE_URL}/${fileName}`;

    const getFileResponse = await fetch(fileUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    });
    const getFileData = await getFileResponse.json();
    const sha = getFileData.sha || undefined;

    const response = await fetch(fileUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${GITHUB_TOKEN}`,
      },
      body: JSON.stringify({
        message: `Upload scenario file ${fileName}`,
        content: encodedContent,
        sha,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    res.json({ message: `File ${fileName} uploaded successfully.` });
  } catch (error) {
    console.error("Error uploading to GitHub:", error);
    res.status(500).json({ error: "Failed to upload scenario to GitHub" });
  }
});

app.post("/api/save_environment", (req, res) => {
  const { type, value } = req.body;
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type: ${type}` });
  }

  if (!value) {
    return res.status(400).json({ error: `${type} value is required` });
  }

  const envFilePath = path.join(__dirname, "app", "services", "carjan", ".env");
  const currentEnvVars = loadEnvVariables(envFilePath);

  currentEnvVars[type] = value;

  const newEnvContent = Object.entries(currentEnvVars)
    .map(([key, val]) => `${key}=${val}`)
    .join("\n");
  fs.writeFile(envFilePath, newEnvContent, { flag: "w" }, (err) => {
    if (err) {
      console.error(`Failed to write ${type} to .env file:`, err);
      return res.status(500).json({ error: `Failed to save ${type}` });
    }

    res.json({ status: `${type} saved successfully` });
  });
});

app.post("/api/get_environment_variable", (req, res) => {
  const { type } = req.body;

  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid environment variable type" });
  }

  const envFilePath = path.join(__dirname, "app", "services", "carjan", ".env");
  if (!fs.existsSync(envFilePath)) {
    return res.status(404).json({ error: ".env file not found" });
  }

  const envConfig = dotenv.parse(fs.readFileSync(envFilePath));
  const selectedValue = envConfig[type];

  if (selectedValue) {
    res.json({ selectedValue });
  } else {
    res.status(404).json({ error: "Environment variable not found" });
  }
});

app.post("/api/start_flask", async (req, res) => {
  try {
    startFlaskService();
    console.log("Flask process started. Waiting for it to be ready...");

    const flaskReady = await waitForFlaskToBeReady();

    if (flaskReady) {
      console.log("Flask is ready.");
      res.json({
        status: "Flask started",
      });
    } else {
      throw new Error("Flask did not become ready in time.");
    }
  } catch (error) {
    console.error("Error starting Flask:", error);
    res.status(500).json({ error: "Failed to start Flask" });
  }
});

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
    const flaskResponse = await forwardToFlask("/load_scenario");

    console.log("Flask response:", flaskResponse);

    res.json({
      status: "Scenario loaded from Flask",
      scenario: flaskResponse,
    });
  } catch (error) {
    console.error("Error forwarding to Flask:", error);
    res.status(500).json({ error: "Failed to load scenario" });
  }
});

app.post("/api/send_data", async (req, res) => {
  try {
    console.log("Sending data to AJAN agent...");
    const flaskResponse = await forwardToFlask("/send_data");

    console.log("Flask response:", flaskResponse);

    res.json({
      status: "Scenario loaded from Flask",
      scenario: flaskResponse,
    });
  } catch (error) {
    console.error("Error forwarding to Flask:", error);
    res.status(500).json({ error: "Failed to load scenario" });
  }
});

app.post("/api/reset-carla", async (req, res) => {
  try {
    const flaskResponse = await forwardToFlask("/reset_carla");

    console.log("Flask response:", flaskResponse);

    res.json({
      status: "Scenario loaded from Flask",
      scenario: flaskResponse,
    });
  } catch (error) {
    console.error("Error forwarding to Flask:", error);
    res.status(500).json({ error: "Failed to load scenario" });
  }
});

app.get("/shutdown", async (req, res) => {
  console.log("Shutting down server...");
  res.send("Shutting down server...");
  await stopFlaskService();
  process.exit();
});

app.get("/api/shutdownFlask", async (req, res) => {
  const success = await stopFlaskService();

  if (success) {
    res.status(200).json({ status: "Flask service stopped successfully" });
  } else {
    res.status(500).json({ error: "Failed to stop Flask service" });
  }
});

app.get("/api/health_check", async (req, res) => {
  try {
    const flaskResponse = await forwardToFlask("/health_check");

    if (!flaskResponse.ok) {
      throw new Error(`Flask server returned status ${flaskResponse.status}`);
    }

    const flaskData = await flaskResponse.json();
    console.log("Flask Health-Check response:", flaskData);

    res.json({
      status: "Flask is ready",
      flaskData: flaskData,
    });
  } catch (error) {
    console.error("Error forwarding Health-Check to Flask:", error);
    res.status(500).json({ error: "Flask is not ready" });
  }
});

app.post("/api/start_carla", async (req, res) => {
  try {
    const flaskResponse = await forwardToFlask("/start_carla");

    console.log("Flask response:", flaskResponse);

    if (flaskResponse.error) {
      return res.status(400).json({ error: flaskResponse.error });
    }

    res.json({
      status: "Scenario loaded from Flask",
      scenario: flaskResponse,
    });
  } catch (error) {
    console.error("Error forwarding to Flask:", error);
    res.status(500).json({ error: "Failed to load scenario" });
  }
});

app.post("/api/start_agent", async (req, res) => {
  const { id } = req.body;

  try {
    const flaskResponse = await forwardToFlask("/start_agent", id);

    console.log("Flask response:", flaskResponse);

    res.json({
      status: `Startd Agent with ID ${id}`,
      scenario: flaskResponse,
    });
  } catch (error) {
    console.error("Error forwarding to Flask:", error);
    res.status(500).json({ error: "Failed to load scenario" });
  }
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT. Shutting down...");
  await stopFlaskService();
  await shutdownServer();
  process.exit(0);
});

function forwardToFlask(endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const method = body ? "POST" : "GET";
    console.log("Forwarding to Flask:", endpoint);
    console.log("method:", method);
    const options = {
      hostname: "localhost",
      port: 5000,
      path: endpoint,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          console.error("Error parsing JSON from Flask:", error);
          console.log("Received response:", data);
          reject("Invalid JSON received from Flask");
        }
      });
    });

    req.on("error", (e) => {
      console.error(`Problem with request: ${e.message}`);
      reject(e);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

server.listen(port, () => {
  console.log(`Carjan Service listening on port ${port} :)`);
});
