import Component from "@ember/component";
import { inject as service } from "@ember/service";
import { next } from "@ember/runloop";
import { observer } from "@ember/object";

export default Component.extend({
  websockets: service(),
  carjanState: service(),
  carlaPath: "",
  errorMessage: "",
  isDialogOpen: false,
  isDisabled: false,
  step1Status: "idle", // "loading", "completed", "error"
  step2Status: "idle",
  step3Status: "idle",
  logs: [],
  autoScrollEnabled: true,
  iFrameSrc: "",
  reloadFlag: false,
  startupFlag: false,

  // Beobachter für den Schritt 3-Status
  step3StatusObserver: observer("carjanState.step3Status", function () {
    setTimeout(() => {
      $(".ui.bottom.sidebar").sidebar("show");
      this.createAjanAgents();
    }, 300);
  }),

  didRender() {
    this._super(...arguments);

    next(() => {
      const logContainer = $("#carla-terminal");
      if (logContainer && logContainer.length) {
        logContainer.on("scroll", () => {
          const atBottom =
            logContainer[0].scrollTop + logContainer[0].clientHeight >=
            logContainer[0].scrollHeight - 5;
          this.set("autoScrollEnabled", atBottom);
        });
      }
    });
  },

  didInsertElement() {
    this._super(...arguments);
    console.log("didInsertElement");

    // WebSocket initialisieren
    const socket = this.websockets.socketFor("ws://localhost:4204");
    socket.on("message", this.handleLogMessage, this);
  },

  setupTabClickListeners() {
    // Alle Tab-Elemente auswählen
    const tabs = document.querySelectorAll(".menu .item");

    if (tabs.length === 0) {
      console.error("Keine Tabs gefunden, um Click-Listener zu binden.");
      return;
    }

    // Click-Event binden
    tabs.forEach((tab) => {
      tab.addEventListener("click", (event) => {
        const tabName = event.target.getAttribute("data-tab"); // Tab-Namen abrufen
        console.log("Tab geklickt:", tabName);
        this.set("reloadFlag", true);
        // Tab-Index extrahieren (z.B. "tab-1" -> 1)
        const index = tabName.replace("tab-", "");
        this.updateIframeSrc(index).then(() => {
          setTimeout(() => {
            this.set("reloadFlag", false);
          }, 1000);
        });
      });
    });

    console.log("Click-Listener erfolgreich an Tabs gebunden.");
  },

  async updateIframeSrc(index) {
    const agent = this.carjanState.agentData[index];
    if (!agent) return;

    const agentName = agent.label;
    const repoUri = `http://localhost:8090/rdf4j/repositories/${agentName}`;
    // Lade die Agenten-Daten und berechne die SRC-URL
    this.downloadAgent(agentName).then(async (agent) => {
      const agentTemplate = this.extractAgentTemplate(agent);
      const agentsRepo = await this.downloadAgentsRepo(agentTemplate);
      const behavior = this.extractBehaviorUri(agentsRepo);
      const behaviorUri = this.convertBehaviorURI(behavior, agentName);

      // Dynamische URL mit Zeitstempel, um Cache-Probleme zu vermeiden
      const src = `http://localhost:4200/editor/behaviors?wssConnection=true&agent=${agentName}&repo=${repoUri}&bt=${behaviorUri}&t=${Date.now()}#split-middle`;

      // Update SRC des iFrames
      const iframe = document.getElementById(`carla-iframe-${index}`);
      if (iframe) {
        iframe.src = src;
        console.log(`Updated iFrame ${index} SRC to ${src}`);
      } else {
        console.error(`iFrame ${index} not found`);
      }
    });
  },

  willDestroyElement() {
    const socket = this.websockets.socketFor("ws://localhost:4204");
    socket.off("message", this.handleLogMessage, this);
    window.removeEventListener(
      "beforeunload",
      this.handleBeforeUnload.bind(this)
    );
  },

  handleLogMessage(event) {
    let logMessage = String(event.data);

    if (logMessage.includes("[Error]")) {
      logMessage = `<span class="log-error">${logMessage}</span>`;
    } else if (logMessage.includes("[Warning]")) {
      logMessage = `<span class="log-warning">${logMessage}</span>`;
    } else {
      logMessage = `<span class="log-info">${logMessage}</span>`;
    }

    this.logs.pushObject(logMessage);

    if (this.logs.length > 50) {
      this.logs.shiftObject();
    }
  },

  async handleBeforeUnload(event) {
    try {
      await fetch("http://localhost:4204/api/shutdownFlask", {
        method: "GET",
      });
      console.log("Flask service stopped.");
    } catch (error) {
      console.error("Failed to stop Flask service:", error);
    }

    event.preventDefault();
    event.returnValue = "";
  },

  async saveCarlaPath() {
    try {
      const carlaPath = this.get("carlaPath").replace(/"/g, "");
      const response = await fetch(
        "http://localhost:4204/api/save_environment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: carlaPath }),
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);
      console.log((await response.json()).status);
    } catch (error) {
      console.error("Failed to save Carla path.", error);
    }
  },

  async startFlask() {
    this.set("step1Status", "loading");
    this.set("startupFlag", true);
    try {
      const response = await fetch("http://localhost:4204/api/start_flask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);
      this.set("step1Status", "completed");
      setTimeout(() => this.startCarla(), 1000);
    } catch (error) {
      this.set("step1Status", "error");
      console.error("Failed to start Flask:", error);
    }
  },

  async stopFlask() {
    try {
      const response = await fetch("http://localhost:4204/api/shutdownFlask", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      console.log(result.status);
    } catch (error) {
      console.error("Failed to stop Flask.", error);
    }
  },

  async startCarla() {
    this.set("step2Status", "loading");
    this.set("errorMessage", "");
    try {
      const response = await fetch("http://localhost:4204/api/start_carla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorData = await response.json();
        this.set("errorMessage", errorData.error || "Failed to start CARLA.");
        throw new Error(errorData.error || "Failed to start CARLA.");
      }
      this.set("step2Status", "completed");
      this.carjanState.set("step3Status", "loading");
      console.log("Step 2 completed, executing step 3...");
      this.loadScenario();
    } catch (error) {
      this.set("step2Status", "error");
      console.error("Failed to start CARLA:", error);
    }
  },

  async checkFlaskStatus() {
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch("http://localhost:4204/api/health_check");
        if (response.ok) {
          clearInterval(checkInterval);
          this.startCarla();
        }
      } catch (error) {
        console.log("Flask not ready yet...");
      }
    }, 500);
  },

  loadScenario() {
    this.set("reloadFlag", true);
    this.carjanState.setUploadScenarioToCarla(true);
  },

  convertBehaviorURI(behaviorURI, agentName) {
    return behaviorURI.replace(
      "http://localhost:8090/rdf4j/repositories/agents#",
      `http://localhost:8080/ajan/agents/${agentName}/behaviors/`
    );
  },

  async createAjanAgents() {
    this.set("step4Status", "loading");
    this.set("errorMessage", "");

    try {
      setTimeout(() => {
        const entities = this.carjanState.agentData;
        console.log("Entities:", entities);
        this.forEachEntity(entities).then(() => {
          this.setupTabs();
          this.setupTabClickListeners();
          this.set("reloadFlag", false);
          this.set("step4Status", "completed");
          this.set("startupFlag", false);
        }, 500);
      });
    } catch (error) {
      this.set("step4Status", "error");
      console.error("Failed to create AJAN agents:", error);
    }
  },

  async forEachEntity(entities) {
    entities.forEach((entity, index) => {
      const agentName = entity.label;
      const repoUri = `http://localhost:8090/rdf4j/repositories/${agentName}`;

      // Lade die Agenten-Daten und berechne die SRC-URL
      this.downloadAgent(agentName)
        .then(async (agent) => {
          const agentTemplate = this.extractAgentTemplate(agent);
          const agentsRepo = await this.downloadAgentsRepo(agentTemplate);
          const behavior = this.extractBehaviorUri(agentsRepo);
          const behaviorUri = this.convertBehaviorURI(behavior, agentName);

          const src = `http://localhost:4200/editor/behaviors?wssConnection=true&agent=${agentName}&repo=${repoUri}&bt=${behaviorUri}&t=${Date.now()}#split-middle`;
          console.log(`Agent: ${agentName}, SRC: ${src}`);

          // Setze den src-Wert im Agent-Daten-Objekt
          this.carjanState.agentData[index].iFrameSrc = src;

          // Finde das entsprechende iFrame und wende die SRC an
          const iframeId = `carla-iframe-${index}`;
          const iframe = document.getElementById(iframeId);
          if (iframe) {
            iframe.src = src; // Setze die SRC-URL
            console.log(`iFrame ${iframeId} src set to ${src}`);
            iframe.onload = () => {
              console.log(`iFrame ${iframeId} loaded`);
              console.log("iFrame: ", iframe);

              setTimeout(() => {
                try {
                  const iframeDocument =
                    iframe.contentDocument || iframe.contentWindow.document;
                  if (!iframeDocument) {
                    console.error(
                      `iframeDocument for ${iframeId} not accessible`
                    );
                    return;
                  }

                  // Finde #split-middle und setze es als einzigen Inhalt des Body
                  const splitMiddle =
                    iframeDocument.getElementById("split-middle");
                  if (splitMiddle) {
                    // Entferne alle Inhalte im Body des iFrame
                    iframeDocument.body.innerHTML = "";
                    // Füge nur #split-middle in den Body ein
                    iframeDocument.body.appendChild(splitMiddle);

                    // Passe die Größe von #split-middle an
                    splitMiddle.style.width = "100%";
                    splitMiddle.style.height = "100%";

                    console.log(`split-middle rendered for ${iframeId}`);
                  } else {
                    console.error(
                      `Element 'split-middle' not found in ${iframeId}`
                    );
                  }

                  // Manuelles Triggern eines resize-Events für die iFrame-Anwendung
                  const iframeWindow = iframe.contentWindow;
                  if (iframeWindow) {
                    console.log(
                      "Triggering resize event for iFrame ",
                      iframeId
                    );
                    iframeWindow.dispatchEvent(new Event("resize"));
                    console.log("Manually triggered resize event for iFrame");
                  } else {
                    console.error(
                      "iframeWindow not accessible for resize event."
                    );
                  }
                } catch (e) {
                  console.error(`Error accessing content of ${iframeId}:`, e);
                }
              }, 200);
            };
          } else {
            console.error(`iFrame ${iframeId} not found`);
          }
        })
        .catch((error) => {
          console.error(`Error processing agent ${agentName}:`, error);
        });
    });
  },

  reloadAllIframes() {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      iframe.contentWindow.location.reload();
    });
  },

  async downloadAgent(agentName) {
    const repoURL = `http://localhost:8090/rdf4j/repositories/${agentName}/statements`;
    const headers = {
      Accept: "application/ld+json; charset=utf-8",
    };

    try {
      const response = await fetch(repoURL, { headers });

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("data:", data);
      return data;
    } catch (error) {
      console.error("Failed to download repository:", error);
    }
  },

  async downloadAgentsRepo() {
    const repoURL = `http://localhost:8090/rdf4j/repositories/agents/statements`;
    const headers = {
      Accept: "application/ld+json; charset=utf-8",
    };

    try {
      const response = await fetch(repoURL, { headers });

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("data:", data);
      return data;
    } catch (error) {
      console.error("Failed to download repository:", error);
    }
  },

  extractAgentTemplate(data) {
    for (const item of data) {
      if (item["http://www.ajan.de/ajan-ns#agentTemplate"]) {
        const agentTemplate =
          item["http://www.ajan.de/ajan-ns#agentTemplate"][0]["@id"];
        return agentTemplate;
      }
    }
    return null;
  },

  extractBehaviorUri(agentsRepo) {
    for (const item of agentsRepo) {
      if (item["http://www.ajan.de/ajan-ns#behavior"]) {
        const behaviorUri =
          item["http://www.ajan.de/ajan-ns#behavior"][0]["@id"];
        return behaviorUri;
      }
    }
    return null;
  },

  setupTabs() {
    $(document).ready(function () {
      $(".menu .item").tab();
    });
  },

  setupSidebars() {
    $(document).ready(function () {
      $(".ui.sidebar").sidebar();
    });
  },

  actions: {
    async handleStartCarla() {
      await this.stopFlask();
      await this.saveCarlaPath();
      setTimeout(() => {
        this.startFlask();
      }, 1000);
    },

    async startSimulation() {
      try {
        console.log("Starting simulation...");
        await fetch("http://localhost:4204/api/startSimulation", {
          method: "GET",
        });
        console.log("Simulation started.");
      } catch (error) {
        console.error("Failed to start Simulation:", error);
      }
    },

    async openCarlaModal() {
      this.setProperties({
        isDialogOpen: true,
        step1Status: "idle",
        step2Status: "idle",
        step3Status: "idle",
        logs: [], // Leeren der Logs bei neuer Sitzung
      });
      this.startFlask();
      next(() => {
        $(".ui.basic.modal")
          .modal({
            closable: false,
            transition: "scale",
            duration: 500,
          })
          .modal("show");
      });
    },

    closeCarlaDialog() {
      this.stopFlask();
      console.log("Closing dialog...");
      this.set("step1Status", "idle");
      this.set("step2Status", "idle");
      this.carjanState.set("step3Status", "idle");
      $(".ui.modal").modal("hide");
      this.set("isDialogOpen", false);
      $(".ui.top.sidebar").sidebar("hide");
      $(".ui.bottom.sidebar").sidebar("hide");
    },

    openTerminalSidebar() {
      const sidebarElement = $(".ui.top.sidebar.terminal-sidebar").sidebar(
        "toggle"
      );
      console.log("Sidebar Element:", sidebarElement);

      if (sidebarElement.length === 0) {
        console.error("No sidebar element found. Check the selector.");
        return;
      }

      console.log("Toggling Sidebar...");
      sidebarElement.sidebar("toggle");
    },
  },
});
