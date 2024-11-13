import $ from "jquery";
import actions from "ajan-editor/helpers/carjan/actions";
import Component from "@ember/component";
import N3Parser from "npm:rdf-parser-n3";
import { computed } from "@ember/object";
import { debounce, next } from "@ember/runloop";
import { observer } from "@ember/object";
import { inject as service } from "@ember/service";
import rdf from "npm:rdf-ext";
import rdfGraph from "ajan-editor/helpers/RDFServices/RDF-graph";
import stringToStream from "npm:string-to-stream";

let self;

const prefixes = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  carjan: "http://example.com/carla-scenario#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

export default Component.extend({
  dataBus: service("data-bus"),
  ajax: service(),
  store: service(),
  carjanState: service(),
  isDialogOpen: false,
  isDeleteDialogOpen: false,
  scenarioName: "",
  hasError: false,
  isNameEmpty: true,
  loading: true,
  updating: false,
  isDisabled: computed("hasError", "isNameEmpty", function () {
    return this.hasError || this.isNameEmpty;
  }),

  init() {
    this._super(...arguments);
    self = this;
    rdfGraph.set(rdf.dataset());
    if (this.mode !== "fileSelection") {
      this.loadGrid();
    }
  },

  updateObserver: observer("carjanState.updateStatements", async function () {
    try {
      const statements = this.carjanState.updateStatements._quads;
      // print as string
      const parsedStatements =
        (await this.parseQuadsToScenarios(statements)) || [];

      const existingRepositoryContent = await this.downloadRepository();
      const existingDataset = await this.parseTrig(existingRepositoryContent);

      existingDataset.scenarios = existingDataset.scenarios || [];

      const newScenarioNames = parsedStatements.map(
        (scenario) => scenario.scenarioName
      );

      existingDataset.scenarios = existingDataset.scenarios.filter(
        (existingScenario) =>
          !newScenarioNames.includes(existingScenario.scenarioName)
      );

      existingDataset.scenarios.push(...parsedStatements);

      if (!this.updating) {
        this.updating = true;
        this.updateWithResult(existingDataset);
      }
    } catch (error) {
      console.error("Error in updateObserver:", error);
    }
  }),

  async parseQuadsToScenarios(quads) {
    try {
      const scenarios = [];
      let currentScenario = null;

      const entitiesMap = {};
      const waypointsMap = {};
      const pathsMap = {};

      quads.forEach((quad) => {
        const subject = quad.subject.value;
        const predicate = quad.predicate.value;
        const object = quad.object.value;

        // Szenario-Erkennung
        if (
          predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
          object === "http://example.com/carla-scenario#Scenario"
        ) {
          if (currentScenario) {
            scenarios.push(currentScenario);
          }

          currentScenario = {
            scenarioName: subject,
            scenarioMap: "map01",
            entities: [],
            waypoints: [],
            paths: [],
            cameraPosition: null,
            label: "",
            category: "",
            weather: "",
          };
        }

        // Szenario-Eigenschaften hinzufügen
        if (currentScenario && subject === currentScenario.scenarioName) {
          if (predicate === "http://example.com/carla-scenario#label") {
            currentScenario.label = object.replace(/^"|"$/g, "");
          }

          if (predicate === "http://example.com/carla-scenario#category") {
            currentScenario.category = object.split("#")[1];
          }

          if (predicate === "http://example.com/carla-scenario#map") {
            currentScenario.scenarioMap = object.replace(/^"|"$/g, "");
          }

          if (predicate === "http://example.com/carla-scenario#weather") {
            currentScenario.weather = object.replace(/^"|"$/g, "");
          }

          if (
            predicate === "http://example.com/carla-scenario#cameraPosition"
          ) {
            currentScenario.cameraPosition = object.replace(/^"|"$/g, "");
          }

          // Entitäten dem Szenario hinzufügen
          if (predicate === "http://example.com/carla-scenario#hasEntity") {
            const entityURI = object;
            if (!currentScenario.entities.includes(entityURI)) {
              currentScenario.entities.push(entityURI);
            }
          }

          // Pfade dem Szenario hinzufügen
          if (predicate === "http://example.com/carla-scenario#hasPath") {
            const pathURI = object;
            if (!currentScenario.paths.includes(pathURI)) {
              currentScenario.paths.push(pathURI);
            }
          }

          // Direktzuweisung von Waypoints zum Szenario
          if (predicate === "http://example.com/carla-scenario#hasWaypoints") {
            const waypointURI = object;
            if (!currentScenario.waypoints.includes(waypointURI)) {
              currentScenario.waypoints.push(waypointURI);
            }
          }
        }

        // Entitäten erfassen
        if (
          predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
          (object === "http://example.com/carla-scenario#Vehicle" ||
            object === "http://example.com/carla-scenario#Pedestrian")
        ) {
          let entityType = object.split("#")[1];
          entitiesMap[subject] = {
            entity: subject,
            type: entityType,
            label: undefined,
            x: undefined,
            y: undefined,
            heading: null,
            followsPath: null,
            model: null,
            color: null,
          };
        }

        // Eigenschaften von Entitäten hinzufügen
        if (entitiesMap[subject]) {
          if (predicate === "http://example.com/carla-scenario#label") {
            entitiesMap[subject].label = object.replace(/^"|"$/g, "");
          }
          if (predicate === "http://example.com/carla-scenario#x") {
            entitiesMap[subject].x = object.replace(/^"|"$/g, "");
          }
          if (predicate === "http://example.com/carla-scenario#y") {
            entitiesMap[subject].y = object.replace(/^"|"$/g, "");
          }
          if (predicate === "http://example.com/carla-scenario#heading") {
            entitiesMap[subject].heading = object;
          }
          if (predicate === "http://example.com/carla-scenario#followsPath") {
            entitiesMap[subject].followsPath = object;
          }
          if (predicate === "http://example.com/carla-scenario#model") {
            entitiesMap[subject].model = object;
          }
          if (predicate === "http://example.com/carla-scenario#color") {
            entitiesMap[subject].color = object.replace(/^"|"$/g, "");
          }
        }

        // Waypoints erfassen
        if (
          predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
          object === "http://example.com/carla-scenario#Waypoint"
        ) {
          waypointsMap[subject] = {
            waypoint: subject,
            x: null,
            y: null,
            waitTime: 0,
            positionInCell: "center",
          };
        }

        if (waypointsMap[subject]) {
          if (predicate === "http://example.com/carla-scenario#x") {
            waypointsMap[subject].x = object.replace(/^"|"$/g, "");
          }
          if (predicate === "http://example.com/carla-scenario#y") {
            waypointsMap[subject].y = object.replace(/^"|"$/g, "");
          }
          if (predicate === "http://example.com/carla-scenario#waitTime") {
            waypointsMap[subject].waitTime = object.replace(/^"|"$/g, "");
          }
          if (
            predicate === "http://example.com/carla-scenario#positionInCell"
          ) {
            waypointsMap[subject].positionInCell = object.replace(/^"|"$/g, "");
          }
        }

        // Paths erfassen
        if (
          predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
          object === "http://example.com/carla-scenario#Path"
        ) {
          pathsMap[subject] = {
            path: subject,
            waypoints: [],
            description: "",
            color: "#000000",
          };
        }

        if (
          pathsMap[subject] &&
          predicate === "http://example.com/carla-scenario#description"
        ) {
          pathsMap[subject].description = object.replace(/^"|"$/g, "");
        }

        if (
          pathsMap[subject] &&
          predicate === "http://example.com/carla-scenario#color"
        ) {
          pathsMap[subject].color = object.replace(/^"|"$/g, "");
        }
      });

      quads.forEach((quad) => {
        const subject = quad.subject.value;
        const predicate = quad.predicate.value;
        const object = quad.object.value;

        // Erfassung von RDF-Listen für Waypoints in Paths
        if (
          pathsMap[subject] &&
          predicate === "http://example.com/carla-scenario#hasWaypoints"
        ) {
          const waypointsInPath = [];
          let currentListNode = object;

          while (
            currentListNode !== "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"
          ) {
            quads.forEach((quadItem) => {
              if (quadItem.subject.value === currentListNode) {
                if (
                  quadItem.predicate.value ===
                  "http://www.w3.org/1999/02/22-rdf-syntax-ns#first"
                ) {
                  const waypointURI = quadItem.object.value;
                  waypointsInPath.push(waypointURI); // Die Waypoint-URI wird erfasst

                  // Überprüfen, ob der Waypoint in waypointsMap existiert
                  if (!waypointsMap[waypointURI]) {
                    console.error(
                      `Missing Waypoint in waypointsMap for URI: ${waypointURI}`
                    );
                  }
                }
                if (
                  quadItem.predicate.value ===
                  "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"
                ) {
                  currentListNode = quadItem.object.value;
                }
              }
            });
          }
          pathsMap[subject].waypoints = waypointsInPath
            .map((waypointURI) => {
              return waypointsMap[waypointURI];
            })
            .filter(Boolean);
        }
      });

      Object.keys(entitiesMap).forEach((entityURI) => {
        const entity = entitiesMap[entityURI];
        if (entity.followsPath && !pathsMap[entity.followsPath]) {
          entity.followsPath = null;
        }
      });

      if (currentScenario) {
        scenarios.push(currentScenario);
      }

      scenarios.forEach((scenario) => {
        scenario.entities = scenario.entities.map((entityURI) => {
          return entitiesMap[entityURI];
        });
        scenario.paths = scenario.paths.map((pathURI) => {
          return pathsMap[pathURI];
        });

        scenario.waypoints = scenario.waypoints
          .map((waypointURI) => {
            return waypointsMap[waypointURI];
          })
          .filter(Boolean);
      });

      return scenarios;
    } catch (error) {
      console.error("Error in parseQuadsToScenarios:", error);
      return [];
    }
  },

  async getMap(mapName) {
    const response = await fetch("/assets/carjan/carjan-maps/maps.json");
    const maps = await response.json();
    this.carjanState.setMapName(mapName);
    return maps[mapName] || maps.map01;
  },

  async getDefaultMap() {
    this.carjanState.setMapName("map01");
    return await this.getMap("map01");
  },

  extractScenarioName(trigContent) {
    const match = trigContent.match(/<([^>]+)> \{/);
    if (match && match[1]) {
      const scenarioURI = match[1];
      return scenarioURI;
    }
    return null;
  },

  extractScenariosList(data) {
    const scenarios = [];

    data.forEach((item) => {
      if (item["@id"] === "http://example.com/carla-scenario#CarjanConfig") {
        const scenariosList =
          item["http://example.com/carla-scenario#scenarios"][0]["@list"];
        scenariosList.forEach((scenarioItem) => {
          const scenarioURI = scenarioItem["@id"];
          const scenarioName = scenarioURI.split("#")[1];
          scenarios.push(scenarioName);
        });
      }
    });

    return scenarios;
  },

  didInsertElement() {
    this._super(...arguments);
    // after 1s
    setTimeout(() => {
      this.loading = false;
    }, 1000);
  },

  actions: {
    scenarioSelected(value) {
      this.scenarioName = value;
      this.set("selectedValue", value);
      if (value) {
        this.loadMapAndAgents(value);
        this.loadGrid();
        this.carjanState.setScenarioName(value);
      }
    },

    async downloadScenario() {
      this.downloadScenarioAsTrig(this.scenarioName, true, true);
    },

    async openDeleteDialog() {
      this.set("isDeleteDialogOpen", true);
      next(() => {
        this.$(".ui.basic.modal")
          .modal({
            closable: false,
            transition: "scale",
            duration: 500,
            dimmerSettings: { duration: { show: 500, hide: 500 } },
          })
          .modal("show");
      });
    },

    confirmDelete() {
      this.$(".ui.modal").modal("hide");
      const selectedScenario = this.get("selectedValue");
      if (selectedScenario) {
        this.set("isDeleteDialogOpen", false);
        this.deleteScenarioFromRepository(selectedScenario).then((result) => {
          this.updateWithResult(result).then(() => {
            setTimeout(() => {
              // window.location.reload(true);
            }, 1000);
          });
        });
      }
    },

    cancelDelete() {
      this.$(".ui.modal").modal("hide");
      this.set("isDeleteDialogOpen", false);
    },

    async openNewScenarioDialog() {
      this.set("isDialogOpen", true);
      this.set("scenarioName", "");
      this.set("hasError", false);

      next(() => {
        this.$(".ui.basic.modal")
          .modal({
            closable: false,
            transition: "scale",
            duration: 500,
            dimmerSettings: { duration: { show: 500, hide: 500 } },
          })
          .modal("show");
      });

      const { scenarios } = await this.fetchAgentDataFromRepo();
      this.set("existingScenarioNames", scenarios);
    },

    closeNewScenarioDialog() {
      this.$(".ui.modal").modal("hide");
      this.set("isDialogOpen", false);
      this.set("scenarioName", "");
      this.set("hasError", false);
    },

    checkScenarioName() {
      const scenarioName = this.scenarioName.trim();
      const isNameEmpty = scenarioName === "";
      this.set("isNameEmpty", isNameEmpty);

      if (isNameEmpty) {
        this.set("hasError", false);
        this.set("errorMessage", "");
        return;
      }

      // Validierung des Szenarionamens
      const isValidName = /^[a-zA-Z0-9_]+$/.test(scenarioName);
      if (!isValidName) {
        this.set("hasError", true);
        this.set(
          "errorMessage",
          "Invalid scenario name. Only letters, numbers, and underscores are allowed."
        );
        return;
      }

      const existingScenarioNames = this.existingScenarioNames.map((name) =>
        name.toLowerCase()
      );
      const nameTaken = existingScenarioNames.includes(
        scenarioName.toLowerCase()
      );

      if (nameTaken) {
        this.set("hasError", true);
        this.set("errorMessage", "Scenario name already taken.");
      } else {
        this.set("hasError", false);
        this.set("errorMessage", "");
      }
    },

    async generateNewScenario() {
      const scenarioName = this.scenarioName.trim();

      if (this.hasError || !scenarioName) {
        return;
      }

      const trigContent = `
        @prefix : <http://example.com/carla-scenario#> .
        @prefix carjan: <http://example.com/carla-scenario#> .
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        :${scenarioName} {
          :${scenarioName} rdf:type carjan:Scenario ;
            carjan:label "${scenarioName}" ;
            carjan:map "map01" ;
            carjan:cameraPosition "down" ;
            carjan:weather "Clear" .
        }
        `;

      try {
        const result = await this.addScenarioToRepository(trigContent);
        this.updateWithResult(result);
      } catch (error) {
        console.error("Fehler beim Erstellen des neuen Szenarios:", error);
      }
    },

    uploadFile() {
      this.deleteRepo = true;
      document.getElementById("fileInput").click();
    },

    uploadScenario() {
      this.deleteRepo = false;
      document.getElementById("scenarioFileInput").click();
    },

    switchMap(mapName) {
      this.setMap(mapName);
    },

    downloadAll() {
      this.downloadRepository(true);
    },

    triggerSaveScenario() {
      this.carjanState.saveRequest();
      setTimeout(() => {
        //window.location.reload(true);
      }, 1000);
    },

    handleFile(event) {
      if (
        !event ||
        !event.target ||
        !event.target.files ||
        event.target.files.length === 0
      ) {
        return;
      }

      const file = event.target.files[0];

      if (file && file.name.endsWith(".trig")) {
        const reader = new FileReader();

        reader.onload = (e) => {
          const trigContent = e.target.result;
          this.parseTrig(trigContent).then((result) => {
            this.updateWithResult(result);
          });
        };

        reader.readAsText(file);
      }
    },

    handleScenario(event) {
      if (
        !event ||
        !event.target ||
        !event.target.files ||
        event.target.files.length === 0
      ) {
        return;
      }

      const file = event.target.files[0];

      if (file && file.name.endsWith(".trig")) {
        const reader = new FileReader();

        reader.onload = (e) => {
          this.addScenarioToRepository(e.target.result).then((result) => {
            this.updateWithResult(result);
          });
        };

        reader.readAsText(file);
      }
    },
  },

  async addPrefixes() {
    return (
      `@prefix : <http://example.com/carla-scenario#> .\n` +
      `@prefix carjan: <http://example.com/carla-scenario#> .\n` +
      `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n` +
      `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n`
    );
  },

  async updateWithResult(result) {
    this.updateCarjanRepo(result).then(() => {
      this.loadGrid();
      setTimeout(() => {
        //  window.location.reload(true);
      }, 1000);
    });
  },

  async updateCarjanState(scenarioName) {
    const existingRepositoryContent = await this.downloadRepository();
    const existingDataset = await this.parseTrig(existingRepositoryContent);

    existingDataset.scenarios = existingDataset.scenarios.filter(
      (existingScenario) =>
        existingScenario.scenarioName.split("#")[1] === scenarioName
    );

    if (existingDataset.scenarios.length > 0) {
      this.carjanState.setScenario(existingDataset);
    } else {
      console.warn("No scenario found in repository for name:", scenarioName);
    }
  },

  async addScenarioToRepository(newScenarioContent) {
    try {
      let existingRepositoryContent = await this.downloadRepository();
      existingRepositoryContent = existingRepositoryContent || [];

      const existingDataset = await this.parseTrig(existingRepositoryContent);
      const newScenarioDataset = await this.parseTrig(newScenarioContent);
      const newScenarioLabels = newScenarioDataset.scenarios.map(
        (scenario) => scenario.scenarioName
      );

      existingDataset.scenarios = existingDataset.scenarios.filter(
        (existingScenario) =>
          !newScenarioLabels.includes(existingScenario.scenarioName)
      );

      existingDataset.scenarios.push(...newScenarioDataset.scenarios);

      return existingDataset;
    } catch (error) {
      console.error("Error in addScenarioToRepository:", error);
      throw error;
    }
  },

  async deleteScenarioFromRepository(scenarioLabelToDelete) {
    const existingRepositoryContent = await this.downloadRepository();
    const existingDataset = await this.parseTrig(existingRepositoryContent);
    existingDataset.scenarios = existingDataset.scenarios.filter(
      (existingScenario) =>
        existingScenario.scenarioName.split("#")[1] !== scenarioLabelToDelete
    );

    return existingDataset;
  },

  async downloadRepository(flag = false) {
    try {
      const { scenarios } = await this.fetchAgentDataFromRepo();
      let trigContent = "";
      trigContent += await this.addPrefixes();
      for (const scenario of scenarios) {
        trigContent += await this.downloadScenarioAsTrig(
          scenario,
          false,
          false
        );
      }

      if (flag) {
        // Wenn der Download-Flag gesetzt ist, speichere die Datei
        const blob = new Blob([trigContent], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `repository.trig`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return trigContent;
      }
      return trigContent;
    } catch (error) {
      console.error("Fehler beim Herunterladen des Repositorys:", error);
    }
  },

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (event) {
        resolve(event.target.result);
      };
      reader.onerror = function (error) {
        reject(error);
      };
      reader.readAsText(file);
    });
  },

  parseTrigContent(content) {
    // Verwenden Sie rdf-ext und rdf-parser-n3 zum Parsen des TriG-Inhalts
    const parser = new N3Parser({ format: "application/trig" });
    const stream = stringToStream(content);
    return parser.import(stream);
  },

  uploadDatasetToRepo(dataset) {
    // Serialisieren des Datasets in TriG
    const serializer = new N3.Writer({ format: "application/trig" });
    dataset.toStream().pipe(serializer);
    return new Promise((resolve, reject) => {
      serializer.end(async (error, result) => {
        if (error) {
          reject(error);
        } else {
          // Upload zum Triplestore
          const repoUrl =
            "http://localhost:8090/rdf4j/repositories/carjan/statements";
          try {
            const response = await fetch(repoUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/trig",
              },
              body: result,
            });
            if (!response.ok) {
              reject(`Error uploading data: ${response.statusText}`);
            } else {
              resolve();
            }
          } catch (err) {
            reject(err);
          }
        }
      });
    });
  },

  namedNode(value) {
    const [prefix, localName] = value.split(":");
    if (prefixes[prefix]) {
      return rdf.namedNode(prefixes[prefix] + localName);
    } else {
      return rdf.namedNode(value);
    }
  },

  async loadGrid() {
    this.checkRepository().then(() => {
      setTimeout(() => {
        this.loadMapAndAgents(this.get("selectedValue"));
      }, 200);
    });
  },

  async loadMapAndAgents(scenarioName = null) {
    try {
      const { scenarios, scenarioData } = await this.fetchAgentDataFromRepo(
        scenarioName
      );

      if (scenarioName === null) {
        this.set("selectedValue", scenarios[0]);
        scenarioName = scenarios[0];
      }

      const agents = this.extractAgentsData(scenarioData);
      const { mapName, cameraPosition } =
        this.extractScenarioData(scenarioData);
      const map = mapName
        ? await this.getMap(mapName)
        : await this.getDefaultMap();

      this.carjanState.setMapData(map);
      this.carjanState.setAgentData(agents);
      this.carjanState.setCameraPosition(cameraPosition);

      this.updateCarjanState(scenarioName);
    } catch (error) {
      console.error("Fehler beim Laden der Map und Agents:", error);
    }
  },

  async downloadScenarioAsTrig(scenarioName, prefixes = true, download = true) {
    try {
      const { scenarioData } = await this.fetchAgentDataFromRepo(scenarioName);
      if (!scenarioData) {
        return;
      }

      // Starte den TriG-Text
      let trigContent = "";
      if (prefixes) {
        trigContent += await this.addPrefixes();
      }

      trigContent += `:${scenarioName} {\n`;
      // Entitäten und Szenario-Daten
      const scenarioGraph = scenarioData["@graph"];

      // Szenario-Daten hinzufügen
      scenarioGraph.forEach((item) => {
        const id = item["@id"].split("#")[1]; // Nur der Identifier nach dem Hash

        let currentItemContent = "";
        if (
          item["@type"] &&
          item["@type"].includes("http://example.com/carla-scenario#Scenario")
        ) {
          // Füge die Szenario-Eigenschaften hinzu
          currentItemContent += `    :${id} rdf:type carjan:Scenario ;\n`;

          if (item["http://example.com/carla-scenario#map"]) {
            currentItemContent += `      carjan:map "${item["http://example.com/carla-scenario#map"][0]["@value"]}" ;\n`;
          }

          if (item["http://example.com/carla-scenario#cameraPosition"]) {
            currentItemContent += `      carjan:cameraPosition "${item["http://example.com/carla-scenario#cameraPosition"][0]["@value"]}" ;\n`;
          }

          if (item["http://example.com/carla-scenario#weather"]) {
            currentItemContent += `      carjan:weather "${item["http://example.com/carla-scenario#weather"][0]["@value"]}" ;\n`;
          }

          // Entitäten hinzufügen
          if (item["http://example.com/carla-scenario#hasEntity"]) {
            const entities = item[
              "http://example.com/carla-scenario#hasEntity"
            ].map((entity) => `:${entity["@id"].split("#")[1]}`);
            currentItemContent += `      carjan:hasEntity ${entities.join(
              " , "
            )} ;\n`;
          }

          // Pfade hinzufügen
          if (item["http://example.com/carla-scenario#hasPath"]) {
            const paths = item["http://example.com/carla-scenario#hasPath"].map(
              (path) => `:${path["@id"].split("#")[1]}`
            );
            currentItemContent += `      carjan:hasPath ${paths.join(
              " , "
            )} ;\n`;
          }

          // Waypoints hinzufügen
          if (item["http://example.com/carla-scenario#hasWaypoints"]) {
            const waypoints = item[
              "http://example.com/carla-scenario#hasWaypoints"
            ].map((path) => `:${path["@id"].split("#")[1]}`);
            currentItemContent += `      carjan:hasWaypoints ${waypoints.join(
              " , "
            )} ;\n`;
          }
        }

        // Füge die Entitäten hinzu
        if (
          item["@type"] &&
          (item["@type"].includes(
            "http://example.com/carla-scenario#Vehicle"
          ) ||
            item["@type"].includes(
              "http://example.com/carla-scenario#Pedestrian"
            ))
        ) {
          let entityType = item["@type"][0].split("#")[1];
          currentItemContent += `    :${id} rdf:type carjan:${entityType} ;\n`;

          if (item["http://example.com/carla-scenario#x"]) {
            currentItemContent += `      carjan:x "${item["http://example.com/carla-scenario#x"][0]["@value"]}"^^xsd:integer ;\n`;
          }

          if (item["http://example.com/carla-scenario#y"]) {
            currentItemContent += `      carjan:y "${item["http://example.com/carla-scenario#y"][0]["@value"]}"^^xsd:integer ;\n`;
          }

          if (item["http://example.com/carla-scenario#heading"]) {
            currentItemContent += `      carjan:heading "${item["http://example.com/carla-scenario#heading"][0]["@value"]}";\n`;
          }

          if (item["http://example.com/carla-scenario#followsPath"]) {
            currentItemContent += `      carjan:followsPath "${item["http://example.com/carla-scenario#followsPath"][0]["@value"]}" ;\n`;
          }

          if (item["http://example.com/carla-scenario#model"]) {
            console.log(
              "Model:",
              item["http://example.com/carla-scenario#model"]
            );
            currentItemContent += `      carjan:model "${item["http://example.com/carla-scenario#model"][0]["@value"]}" ;\n`;
          }

          if (item["http://example.com/carla-scenario#label"]) {
            currentItemContent += `      carjan:label "${item["http://example.com/carla-scenario#label"][0]["@value"]}" ;\n`;
          }

          if (item["http://example.com/carla-scenario#color"]) {
            currentItemContent += `      carjan:color "${item["http://example.com/carla-scenario#color"][0]["@value"]}" ;\n`;
          }
        }

        // Füge die Pfade hinzu
        if (
          item["@type"] &&
          item["@type"].includes("http://example.com/carla-scenario#Path")
        ) {
          currentItemContent += `    :${id} rdf:type carjan:Path ;\n`;

          if (item["http://example.com/carla-scenario#description"]) {
            currentItemContent += `      carjan:description "${item["http://example.com/carla-scenario#description"][0]["@value"]}" ;\n`;
          }

          if (item["http://example.com/carla-scenario#color"]) {
            currentItemContent += `      carjan:color "${item["http://example.com/carla-scenario#color"][0]["@value"]}" ;\n`;
          }

          // Füge die Waypoints zu den Paths hinzu
          if (item["http://example.com/carla-scenario#hasWaypoints"]) {
            const waypointsList =
              item["http://example.com/carla-scenario#hasWaypoints"][0][
                "@list"
              ];
            const waypoints = waypointsList.map(
              (waypoint) => `:${waypoint["@id"].split("#")[1]}`
            );
            currentItemContent += `      carjan:hasWaypoints ( ${waypoints.join(
              " "
            )} ) ;\n`;
          }
        }

        // Füge die Waypoints hinzu
        if (
          item["@type"] &&
          item["@type"].includes("http://example.com/carla-scenario#Waypoint")
        ) {
          currentItemContent += `    :${id} rdf:type carjan:Waypoint ;\n`;

          if (item["http://example.com/carla-scenario#x"]) {
            currentItemContent += `      carjan:x "${item["http://example.com/carla-scenario#x"][0]["@value"]}"^^xsd:integer ;\n`;
          }

          if (item["http://example.com/carla-scenario#y"]) {
            currentItemContent += `      carjan:y "${item["http://example.com/carla-scenario#y"][0]["@value"]}"^^xsd:integer`;
          }

          if (item["http://example.com/carla-scenario#waitTime"]) {
            currentItemContent += `;\n      carjan:waitTime "${item["http://example.com/carla-scenario#waitTime"][0]["@value"]}"^^xsd:integer ;\n`;
          }
          if (item["http://example.com/carla-scenario#positionInCell"]) {
            currentItemContent += `      carjan:positionInCell "${item["http://example.com/carla-scenario#positionInCell"][0]["@value"]}" ;\n`;
          }
        }

        trigContent +=
          currentItemContent.trim().slice(-1) === ";"
            ? currentItemContent.trim().slice(0, -1) + " .\n"
            : currentItemContent + "\n";
        trigContent += "\n";
      });
      trigContent = trigContent.trim() + "\n"; // Remove trailing newline
      trigContent += "}\n\n";
      // Download als .trig-Datei
      if (download) {
        const blob = new Blob([trigContent], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${scenarioName}.trig`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        return trigContent;
      }
    } catch (error) {
      console.error("Fehler beim Laden des Szenarios:", error);
    }
  },

  async updateCarjanRepo(statements) {
    await this.checkRepository();
    if (this.deleteRepo) {
      await this.deleteStatements();
    }

    setTimeout(async () => {
      await this.updateWithStatements(statements);
    }, 200);
  },

  async updateWithStatements(statements) {
    const scenarioURIs = [];
    for (const scenario of statements.scenarios) {
      scenarioURIs.push(scenario.scenarioName);
      await this.addRDFStatements(scenario);
    }
    this.addGlobalConfig(scenarioURIs);

    await this.updateRepo();
  },

  addGlobalConfig(scenarioURIs) {
    const configURI = this.namedNode("carjan:CarjanConfig");

    // Füge das carjan:CarjanConfig-Objekt hinzu
    rdfGraph.add(
      rdf.quad(
        configURI,
        this.namedNode("rdf:type"),
        this.namedNode("carjan:Config")
      )
    );

    // Erstelle die RDF-Liste manuell
    let listNode = rdf.namedNode("_:b0"); // Start mit einem Blank Node
    rdfGraph.add(
      rdf.quad(configURI, this.namedNode("carjan:scenarios"), listNode)
    );

    for (let i = 0; i < scenarioURIs.length; i++) {
      // Füge rdf:first und rdf:rest hinzu
      rdfGraph.add(
        rdf.quad(
          listNode,
          this.namedNode("rdf:first"),
          rdf.namedNode(scenarioURIs[i])
        )
      );

      if (i < scenarioURIs.length - 1) {
        const nextListNode = rdf.namedNode(`_:b${i + 1}`);
        rdfGraph.add(
          rdf.quad(listNode, this.namedNode("rdf:rest"), nextListNode)
        );
        listNode = nextListNode;
      } else {
        // Letztes Element, rdf:rest auf rdf:nil setzen
        rdfGraph.add(
          rdf.quad(
            listNode,
            this.namedNode("rdf:rest"),
            this.namedNode("rdf:nil")
          )
        );
      }
    }
  },

  // Funktion zum Herunterladen aller Quads
  downloadQuadsAsFile(quads, fileName = "exportedData.ttl") {
    // Erstelle einen leeren String zum Sammeln der Quads
    let quadString = "";

    // Konvertiere jedes Quad in eine lesbare Turtle-Syntax
    quads.forEach((quad) => {
      const subject = quad.subject.value;
      const predicate = quad.predicate.value;
      const object =
        quad.object.termType === "Literal"
          ? `"${quad.object.value}"`
          : quad.object.value;

      // Füge das aktuelle Quad zum String hinzu
      quadString += `<${subject}> <${predicate}> ${object} .\n`;
    });

    // Erstelle eine Blob-Datei mit dem Quads-String
    const blob = new Blob([quadString], { type: "text/turtle" });

    // Erstelle einen Download-Link und starte den Download
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  async parseTrig(trigContent) {
    try {
      const trigStream = stringToStream(trigContent);
      const parser = new N3Parser({ format: "application/trig" });
      const quads = await rdf.dataset().import(parser.import(trigStream));
      const scenarios = await this.parseQuadsToScenarios(quads);

      return { scenarios };
    } catch (error) {
      console.error("Error parsing Trig file:", error);
    }
  },

  async addRDFStatements(scenario) {
    const scenarioURI = rdf.namedNode(scenario.scenarioName);
    const graph = scenarioURI; // Verwende das Szenario als Named Graph

    // Füge das Szenario hinzu
    rdfGraph.add(
      rdf.quad(
        scenarioURI,
        this.namedNode("rdf:type"),
        this.namedNode("carjan:Scenario"),
        graph
      )
    );

    // Füge Szenario-Eigenschaften hinzu (Label, Kategorie, Map, Wetter, Kamera)
    if (scenario.label) {
      rdfGraph.add(
        rdf.quad(
          scenarioURI,
          this.namedNode("carjan:label"),
          rdf.literal(scenario.label),
          graph
        )
      );
    }

    if (scenario.category) {
      rdfGraph.add(
        rdf.quad(
          scenarioURI,
          this.namedNode("carjan:category"),
          this.namedNode(`carjan:${scenario.category}`),
          graph
        )
      );
    }

    if (scenario.scenarioMap) {
      rdfGraph.add(
        rdf.quad(
          scenarioURI,
          this.namedNode("carjan:map"),
          rdf.literal(scenario.scenarioMap),
          graph
        )
      );
    }

    if (scenario.weather) {
      rdfGraph.add(
        rdf.quad(
          scenarioURI,
          this.namedNode("carjan:weather"),
          rdf.literal(scenario.weather),
          graph
        )
      );
    }

    if (scenario.cameraPosition) {
      rdfGraph.add(
        rdf.quad(
          scenarioURI,
          this.namedNode("carjan:cameraPosition"),
          rdf.literal(scenario.cameraPosition),
          graph
        )
      );
    }

    // Füge die Entitäten hinzu und verknüpfe sie mit dem Szenario
    for (const entity of scenario.entities) {
      const entityURI = rdf.namedNode(entity.entity);

      rdfGraph.add(
        rdf.quad(
          entityURI,
          this.namedNode("rdf:type"),
          this.namedNode(`carjan:${entity.type}`),
          graph
        )
      );

      if (entity.x !== undefined) {
        rdfGraph.add(
          rdf.quad(
            entityURI,
            this.namedNode("carjan:x"),
            rdf.literal(entity.x, this.namedNode("xsd:integer")),
            graph
          )
        );
      }

      if (entity.y !== undefined) {
        rdfGraph.add(
          rdf.quad(
            entityURI,
            this.namedNode("carjan:y"),
            rdf.literal(entity.y, this.namedNode("xsd:integer")),
            graph
          )
        );
      }

      if (entity.label !== undefined) {
        rdfGraph.add(
          rdf.quad(
            entityURI,
            this.namedNode("carjan:label"),
            rdf.literal(entity.label),
            graph
          )
        );
      }

      if (entity.color !== undefined) {
        rdfGraph.add(
          rdf.quad(
            entityURI,
            this.namedNode("carjan:color"),
            rdf.literal(entity.color),
            graph
          )
        );
      }

      if (entity.heading !== undefined) {
        rdfGraph.add(
          rdf.quad(
            entityURI,
            this.namedNode("carjan:heading"),
            rdf.literal(entity.heading),
            graph
          )
        );
      }

      if (entity.followsPath !== undefined) {
        rdfGraph.add(
          rdf.quad(
            entityURI,
            this.namedNode("carjan:followsPath"),
            rdf.literal(entity.followsPath),
            graph
          )
        );
      }

      if (entity.model !== undefined) {
        console.log("entity.model not undefined:", entity.model);
        rdfGraph.add(
          rdf.quad(
            entityURI,
            this.namedNode("carjan:model"),
            rdf.literal(entity.model),
            graph
          )
        );
      }

      // Verknüpfe die Entität mit dem Szenario
      rdfGraph.add(
        rdf.quad(
          scenarioURI,
          this.namedNode("carjan:hasEntity"),
          entityURI,
          graph
        )
      );
    }

    // Füge die Waypoints hinzu und verknüpfe sie mit dem Szenario
    for (const waypoint of scenario.waypoints) {
      const waypointURI = rdf.namedNode(waypoint.waypoint);

      rdfGraph.add(
        rdf.quad(
          waypointURI,
          this.namedNode("rdf:type"),
          this.namedNode("carjan:Waypoint"),
          graph
        )
      );

      if (waypoint.x !== undefined) {
        rdfGraph.add(
          rdf.quad(
            waypointURI,
            this.namedNode("carjan:x"),
            rdf.literal(waypoint.x, this.namedNode("xsd:integer")),
            graph
          )
        );
      }

      if (waypoint.y !== undefined) {
        rdfGraph.add(
          rdf.quad(
            waypointURI,
            this.namedNode("carjan:y"),
            rdf.literal(waypoint.y, this.namedNode("xsd:integer")),
            graph
          )
        );
      }

      if (waypoint.waitTime !== undefined) {
        rdfGraph.add(
          rdf.quad(
            waypointURI,
            this.namedNode("carjan:waitTime"),
            rdf.literal(waypoint.waitTime, this.namedNode("xsd:integer")),
            graph
          )
        );
      }

      if (waypoint.positionInCell !== undefined) {
        rdfGraph.add(
          rdf.quad(
            waypointURI,
            this.namedNode("carjan:positionInCell"),
            rdf.literal(waypoint.positionInCell),
            graph
          )
        );
      }

      // Verknüpfe den Waypoint direkt mit dem Szenario
      rdfGraph.add(
        rdf.quad(
          scenarioURI,
          this.namedNode("carjan:hasWaypoints"),
          waypointURI,
          graph
        )
      );
    }

    // Füge die Paths hinzu und verknüpfe sie mit dem Szenario
    for (const path of scenario.paths) {
      const pathURI = rdf.namedNode(path.path);

      rdfGraph.add(
        rdf.quad(
          pathURI,
          this.namedNode("rdf:type"),
          this.namedNode("carjan:Path"),
          graph
        )
      );

      if (path.description) {
        rdfGraph.add(
          rdf.quad(
            pathURI,
            this.namedNode("carjan:description"),
            rdf.literal(path.description),
            graph
          )
        );
      }

      if (path.color) {
        rdfGraph.add(
          rdf.quad(
            pathURI,
            this.namedNode("carjan:color"),
            rdf.literal(path.color),
            graph
          )
        );
      }

      // Verknüpfe den Path mit dem Szenario
      rdfGraph.add(
        rdf.quad(scenarioURI, this.namedNode("carjan:hasPath"), pathURI, graph)
      );

      // Füge die Waypoints zu den Paths hinzu
      if (path.waypoints && path.waypoints.length > 0) {
        let listNode = rdf.blankNode(); // Start mit einem Blank Node für die Waypoints-Liste

        rdfGraph.add(
          rdf.quad(
            pathURI,
            this.namedNode("carjan:hasWaypoints"),
            listNode,
            graph
          )
        );

        for (let i = 0; i < path.waypoints.length; i++) {
          const waypoint = path.waypoints[i];
          const waypointURI = rdf.namedNode(waypoint.waypoint);

          // Füge den Waypoint als RDF-Resource hinzu
          rdfGraph.add(
            rdf.quad(
              waypointURI,
              this.namedNode("rdf:type"),
              this.namedNode("carjan:Waypoint"),
              graph
            )
          );

          if (waypoint.x !== undefined) {
            rdfGraph.add(
              rdf.quad(
                waypointURI,
                this.namedNode("carjan:x"),
                rdf.literal(waypoint.x, this.namedNode("xsd:integer")),
                graph
              )
            );
          }

          if (waypoint.y !== undefined) {
            rdfGraph.add(
              rdf.quad(
                waypointURI,
                this.namedNode("carjan:y"),
                rdf.literal(waypoint.y, this.namedNode("xsd:integer")),
                graph
              )
            );
          }

          if (waypoint.waitTime !== undefined) {
            rdfGraph.add(
              rdf.quad(
                waypointURI,
                this.namedNode("carjan:waitTime"),
                rdf.literal(waypoint.waitTime, this.namedNode("xsd:integer")),
                graph
              )
            );
          }

          // Füge rdf:first und rdf:rest für die RDF-Liste hinzu
          rdfGraph.add(
            rdf.quad(listNode, this.namedNode("rdf:first"), waypointURI, graph)
          );

          if (i < path.waypoints.length - 1) {
            const nextListNode = rdf.blankNode(); // Nächster Blank Node für rdf:rest
            rdfGraph.add(
              rdf.quad(
                listNode,
                this.namedNode("rdf:rest"),
                nextListNode,
                graph
              )
            );
            listNode = nextListNode;
          } else {
            // Letzter Waypoint, rdf:rest auf rdf:nil setzen
            rdfGraph.add(
              rdf.quad(
                listNode,
                this.namedNode("rdf:rest"),
                this.namedNode("rdf:nil"),
                graph
              )
            );
          }
        }
      }
    }
  },

  async updateRepo() {
    const repoUrl = "http://localhost:8090/rdf4j/repositories/carjan";
    const ajax = this.ajax;

    const onEnd = (error) => {
      if (error) {
        console.error("Error adding RDF data to repository:", error);
        return;
      }
    };

    try {
      // Verwenden Sie actions.saveAgentGraph, um die RDF-Daten hochzuladen
      actions.saveAgentGraph(ajax, repoUrl, self.dataBus, onEnd);
    } catch (error) {
      console.error("Error updating repository:", error);
    }
  },

  async fetchAgentDataFromRepo(scenarioName = null) {
    const repoURL =
      "http://localhost:8090/rdf4j/repositories/carjan/statements";
    const headers = {
      Accept: "application/ld+json; charset=utf-8",
    };

    try {
      const response = await fetch(repoURL, { headers });

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      const data = await response.json();

      const scenarios = this.extractScenariosList(data);
      let scenarioData = null;

      if (scenarioName) {
        scenarioData = data.find(
          (item) =>
            item["@graph"] &&
            item["@id"] === `http://example.com/carla-scenario#${scenarioName}`
        );
      } else {
        scenarioData = data[1];
      }
      return { data, scenarios, scenarioData };
    } catch (error) {
      console.error("Error fetching agent data from Triplestore:", error);
      return { data: [], scenarios: [], scenarioData: null };
    }
  },

  extractScenarioData(scenarioData) {
    let mapName = null;
    let cameraPosition = null;

    if (scenarioData && scenarioData["@graph"]) {
      scenarioData["@graph"].forEach((graphItem) => {
        if (
          graphItem["@type"] &&
          graphItem["@type"].some(
            (type) => type === "http://example.com/carla-scenario#Scenario"
          )
        ) {
          // Extract the map name
          if (graphItem["http://example.com/carla-scenario#map"]) {
            mapName =
              graphItem["http://example.com/carla-scenario#map"][0]["@value"];
          }

          // Extract the camera position
          if (graphItem["http://example.com/carla-scenario#cameraPosition"]) {
            cameraPosition =
              graphItem["http://example.com/carla-scenario#cameraPosition"][0][
                "@value"
              ];
          }
        }
      });
    }
    // Return both mapName and cameraPosition
    return { mapName, cameraPosition };
  },

  extractAgentsData(scenarioData) {
    const agents = [];

    if (scenarioData && scenarioData["@graph"]) {
      scenarioData["@graph"].forEach((graphItem) => {
        const id = graphItem["@id"];

        if (
          graphItem["@type"] &&
          graphItem["@type"].some(
            (type) =>
              type === "http://example.com/carla-scenario#Entity" ||
              type === "http://example.com/carla-scenario#Pedestrian" ||
              type === "http://example.com/carla-scenario#Vehicle" ||
              type === "http://example.com/carla-scenario#AutonomousVehicle"
          )
        ) {
          const x =
            graphItem["http://example.com/carla-scenario#x"] &&
            graphItem["http://example.com/carla-scenario#x"][0]
              ? graphItem["http://example.com/carla-scenario#x"][0]["@value"]
              : null;

          const y =
            graphItem["http://example.com/carla-scenario#y"] &&
            graphItem["http://example.com/carla-scenario#y"][0]
              ? graphItem["http://example.com/carla-scenario#y"][0]["@value"]
              : null;

          const label =
            graphItem["http://example.com/carla-scenario#label"] &&
            graphItem["http://example.com/carla-scenario#label"][0]
              ? graphItem["http://example.com/carla-scenario#label"][0][
                  "@value"
                ]
              : null;

          const color =
            graphItem["http://example.com/carla-scenario#color"] &&
            graphItem["http://example.com/carla-scenario#color"][0]
              ? graphItem["http://example.com/carla-scenario#color"][0][
                  "@value"
                ]
              : null;

          const heading =
            graphItem["http://example.com/carla-scenario#heading"] &&
            graphItem["http://example.com/carla-scenario#heading"][0]
              ? graphItem["http://example.com/carla-scenario#heading"][0][
                  "@value"
                ]
              : null;

          const followsPath =
            graphItem["http://example.com/carla-scenario#followsPath"] &&
            graphItem["http://example.com/carla-scenario#followsPath"][0]
              ? graphItem["http://example.com/carla-scenario#followsPath"][0][
                  "@value"
                ]
              : null;

          const model =
            graphItem["http://example.com/carla-scenario#model"] &&
            graphItem["http://example.com/carla-scenario#model"][0]
              ? graphItem["http://example.com/carla-scenario#model"][0][
                  "@value"
                ]
              : null;

          const entityType = graphItem["@type"].reduce((type, currentType) => {
            if (
              currentType === "http://example.com/carla-scenario#Pedestrian"
            ) {
              return "pedestrian";
            } else if (
              currentType === "http://example.com/carla-scenario#Vehicle"
            ) {
              return "vehicle";
            } else if (
              currentType ===
              "http://example.com/carla-scenario#AutonomousVehicle"
            ) {
              return "autonomous";
            }
            return type;
          }, "unknown");

          if (x !== null && y !== null) {
            agents.push({
              entity: id,
              x: parseInt(x, 10),
              y: parseInt(y, 10),
              type: entityType,
              label: "null" ? null : label,
              color: "null" ? null : color,
              heading: "null" ? null : heading,
              followsPath: "null" ? null : followsPath,
              model: "null" ? null : model,
            });
          }
        }
      });
    }

    return agents;
  },

  async deleteRepository() {
    try {
      const response = await fetch(
        "http://localhost:4204/api/delete-carjan-repo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error deleting CARJAN repository:", error);
    }
  },

  async deleteStatements() {
    try {
      const response = await fetch(
        "http://localhost:4204/api/delete-statements",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error deleting CARJAN repository:", error);
    }
  },

  async checkRepository() {
    try {
      const response = await fetch(
        "http://localhost:4204/api/check-repository",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.message) {
        this.initializeCarjanRepo();
      }
    } catch (error) {
      console.error("Repository is not available. Initializing repository...");
      await this.initializeCarjanRepo();
    }
  },

  async initializeCarjanRepo() {
    try {
      const response = await this.get("ajax").post(
        "http://localhost:4204/api/init-carjan-repo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      console.error("Error initializing CARJAN repository:", error);
    }
  },
});
