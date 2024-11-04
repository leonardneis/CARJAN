import Component from "@ember/component";
import { inject as service } from "@ember/service";
import { next } from "@ember/runloop";

export default Component.extend({
  carjanState: service(),
  waypoints: null,
  paths: null,
  placeholderOptions: [
    "Where no waypoint has gone before...",
    "A scenic route full of detours and surprises!",
    "The quick brown path jumps over lazy obstacles",
    "Straight to the point... or is it?",
    "A shortcut through scenic chaos",
    "Zig-zags for added excitement",
    "Taking the long way home",
    "Warning: Detours ahead",
    "Path to enlightenment... or confusion",
    "Choose wisely: every step counts",
    "More twists than a thriller novel",
    "Leading you to adventure, maybe",
    "Where the waypoint winds take you",
    "Charting unknown territories",
    "Plotting a course for discovery",
    "Stay on track... if you dare",
    "The journey is half the fun",
    "Detour: Unexpected sights ahead",
    "Winding roads and hidden trails",
    "Path of twists and turns",
    "A breadcrumb trail for the bold",
    "Step into the unknown",
    "Adventure lies around each turn",
  ],

  placeholderText: "",
  pathDescription: "",
  waypointColor: "red",

  async init() {
    this._super(...arguments);
    this.setRandomPlaceholder();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const waypoints = this.carjanState.waypoints || [];
    const trimmedWaypoints = (waypoints || []).map((waypoint) => ({
      ...waypoint,
      waypointId: waypoint.waypoint.split("#")[1] || waypoint.waypoint,
    }));

    const paths = this.carjanState.paths || [];
    const trimmedPaths = (paths || []).map((path) => ({
      ...path,
      waypoints: path.waypoints.map((wp) => ({
        ...wp,
        waypointId: wp.waypoint.split("#")[1] || wp.waypoint,
      })),
    }));

    this.set("waypoints", trimmedWaypoints);
    this.set("paths", trimmedPaths);

    this.setupTabs();
  },

  setRandomPlaceholder() {
    const options = this.placeholderOptions;
    const randomIndex = Math.floor(Math.random() * options.length);
    this.set("placeholderText", options[randomIndex]);
  },

  actions: {
    openPathwayEditor() {
      console.log("Open pathway editor");
    },

    async openNewPathDialog() {
      this.setRandomPlaceholder();
      this.set("isDialogOpen", true);
      this.set("pathName", "");
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
    },

    closeNewPathDialog() {
      this.$(".ui.modal").modal("hide");
      this.set("isDialogOpen", false);
      this.set("pathName", "");
      this.set("hasError", false);
    },

    generateNewPath() {
      const existingPaths = this.carjanState.paths;

      const pathNumbers = existingPaths
        .map((path) => {
          const match = path.path.match(/Path(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((num) => !isNaN(num));

      const highestIndex = pathNumbers.length ? Math.max(...pathNumbers) : 0;
      const newPathNumber = highestIndex + 1;

      const newPathURI = `http://example.com/carla-scenario#Path${newPathNumber}`;
      const newPath = {
        path: newPathURI,
        waypoints: [],
        description: this.pathDescription || "New path description",
      };

      this.carjanState.appendPath(newPath);

      setTimeout(() => {
        this.carjanState.saveRequest();
      }, 300);
    },

    checkPathName() {
      const pathDescription = this.pathDescription.trim();

      const isDescriptionEmpty = pathDescription === "";
      this.set("isDescriptionEmpty", isDescriptionEmpty);

      if (isDescriptionEmpty) {
        this.set("hasError", false);
        this.set("errorMessage", "");
        return;
      }

      const isValidDescription = /^[a-zA-Z0-9_ ]+$/.test(pathDescription);
      if (!isValidDescription) {
        this.set("hasError", true);
        this.set(
          "errorMessage",
          "Invalid path description. Only letters, numbers, spaces, and underscores are allowed."
        );
        return;
      }

      const paths = this.carjanState.paths || [];
      const isDuplicateDescription = paths.some(
        (path) => path.description.trim() === pathDescription
      );

      if (isDuplicateDescription) {
        this.set("hasError", true);
        this.set(
          "errorMessage",
          "Duplicate path description found. Please use a unique description."
        );
        return;
      }

      this.set("hasError", false);
      this.set("errorMessage", "");
    },

    removeOverlay() {
      this.carjanState.setPath(false);
    },
    colorChanged(newColor) {
      this.set("teamColor", newColor);
      console.log("Farbe geändert:", newColor);
    },

    pickerOpened() {
      console.log("Farb-Picker geöffnet");
    },

    pickerClosed() {
      console.log("Farb-Picker geschlossen");
    },

    userMovedColorPicker(color) {
      console.log("Farbe während der Bewegung:", color);
    },
    dragStart(event) {
      const waypointType = event.currentTarget.dataset.waypointType;
      event.dataTransfer.setData("text", waypointType);

      const dragIcon = this.element.querySelector("#map-pin-icon");

      if (dragIcon) {
        dragIcon.style.width = "12px";
        dragIcon.style.height = "12px";
        dragIcon.style.display = "inline-block";

        event.dataTransfer.setDragImage(dragIcon, 24, 24);
      }

      event.stopPropagation();
    },

    dragLeave(event) {
      event.target.classList.remove("cell-hover-allowed");
      event.target.classList.remove("cell-hover-not-allowed");
      event.target.style.cursor = "move";
    },

    addPath() {
      this.carjanState.setPath(true);
      const newPath = {
        name: `Path ${this.paths.length + 1}`,
        description: "New path description",
        waypoints: [],
      };
      this.paths.pushObject(newPath);
      this.carjanState.set("paths", this.paths);
    },
  },

  setupTabs() {
    $(document).ready(function () {
      $(".menu .item").tab();
    });
  },
});