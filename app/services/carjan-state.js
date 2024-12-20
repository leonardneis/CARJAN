import Service from "@ember/service";
import { set, observer } from "@ember/object";

export default Service.extend({
  mapData: null,
  agentData: null,
  mapName: null,
  scenarioName: null,
  isSaveRequest: false,
  updateStatements: null,
  weather: "Clear",
  category: "Urban",
  cameraPosition: "up",
  paths: null,
  waypoints: null,
  currentCellStatus: null,
  currentCellPosition: [],
  addPath: false,
  selectedPath: null,
  properties: "scenario",
  pathMode: false,
  pathInProgress: null,
  propertyPanel: null,
  color: null,
  chevronDirection: null,
  repository: null,
  loading: null,
  showGridInCarla: "true",
  showPathsInCarla: "true",
  loadLayersInCarla: "true",
  uploadScenarioToCarla: false,
  step3Status: "idle",
  canvasMode: "default",
  dboxes: [],
  selectedDBox: null,
  selectedFallback: null,
  latestToolProperty: null,
  latestEntityProperty: null,

  setSelectedDBox(dbox) {
    set(this, "selectedDBox", dbox);
  },

  setSelectedFallback(path) {
    set(this, "selectedFallback", path);
  },

  addDBox(dbox) {
    this.dboxes.pushObject(dbox);
  },

  setDBoxes(dboxes) {
    set(this, "dboxes", dboxes);
  },

  setCanvasMode(mode) {
    set(this, "canvasMode", mode);
  },

  setStep3Status(status) {
    set(this, "step3Status", status);
  },

  setUploadScenarioToCarla(bool) {
    set(this, "uploadScenarioToCarla", bool);
  },

  setLoadLayersInCarla(bool) {
    set(this, "loadLayersInCarla", bool);
  },

  setPathsInCarla(bool) {
    set(this, "showPathsInCarla", bool);
  },

  setGridInCarla(bool) {
    set(this, "showGridInCarla", bool);
  },

  setLoading(loading) {
    set(this, "loading", loading);
  },

  setRepository(repository) {
    set(this, "repository", repository);
  },

  setPathColor(color) {
    set(this.selectedPath, "color", color);
  },

  setPropertyPanel(propertyPanel) {
    set(this, "propertyPanel", propertyPanel);
  },

  initPathDrawing() {
    const allWaypoints = document.querySelectorAll(
      ".icon.map.marker.alternate"
    );
    allWaypoints.forEach((waypointIcon) => {
      waypointIcon.style.color = "#000";
      waypointIcon.style.transform = "scale(1)";
      waypointIcon.style.textShadow = "none";
    });
    this.set("pathInProgress", { path: `#Path${Date.now()}`, waypoints: [] });
  },

  addWaypointToPathInProgress(waypoint) {
    if (this.pathInProgress) {
      this.pathInProgress.waypoints.push(waypoint);
    } else {
      console.warn("Path drawing not initialized. Call initPathDrawing first.");
    }
  },

  setPathMode(isPathMode) {
    set(this, "pathMode", isPathMode);
    if (isPathMode) {
      this.initPathDrawing();
    }
  },

  appendPath(path) {
    const paths = this.paths || [];
    paths.push(path);
    this.setPaths(paths);
  },

  setProperties(type) {
    set(this, "properties", type);
  },

  setSelectedPath(path) {
    set(this, "selectedPath", path);
  },

  setMapName(mapName) {
    set(this, "mapName", mapName);
  },

  setMapData(map) {
    set(this, "mapData", map);
  },

  setAgentData(agents) {
    set(this, "agentData", agents);
  },

  setScenarioName(name) {
    set(this, "scenarioName", name);
  },

  setWeather(weather) {
    set(this, "weather", weather);
  },

  setCategory(category) {
    set(this, "category", category);
  },

  setCameraPosition(cameraPosition) {
    set(this, "cameraPosition", cameraPosition);
  },

  saveRequest() {
    set(this, "isSaveRequest", true);
    setTimeout(() => {
      set(this, "isSaveRequest", false);
    }, 100);
  },

  setUpdateStatements(rdfgraph) {
    set(this, "updateStatements", rdfgraph);
  },

  setPaths(paths) {
    set(this, "paths", paths);
  },

  setWaypoints(waypoints) {
    set(this, "waypoints", waypoints);
  },

  setCurrentCellStatus(cellStatus) {
    set(this, "currentCellStatus", cellStatus);
  },

  setCurrentCellPosition(cellPosition) {
    set(this, "currentCellPosition", cellPosition);
  },

  setScenario(dataset) {
    const scenario = dataset.scenarios[0];
    console.log("scenario", scenario);
    if (scenario.scenarioName) {
      this.setScenarioName(scenario.scenarioName.split("#")[1]);
    }
    if (scenario.scenarioMap) {
      this.setMapName(scenario.scenarioMap);
    }
    if (scenario.weather) {
      this.setWeather(scenario.weather);
    }
    if (scenario.gridInCarla) {
      this.setGridInCarla(scenario.gridInCarla);
    }
    if (scenario.cameraPosition) {
      this.setCameraPosition(scenario.cameraPosition);
    }
    if (scenario.category) {
      this.setCategory(scenario.category);
    }
    if (scenario.entities) {
      this.setAgentData(scenario.entities);
    }

    if (scenario.paths) {
      this.setPaths(scenario.paths);
    }

    if (scenario.waypoints) {
      this.setWaypoints(scenario.waypoints);
    }

    if (scenario.dboxes) {
      this.setDBoxes(scenario.dboxes);
    }
  },
});
