import Service from "@ember/service";
import RepositoryHandler from "./repository-handler";
import CarlaApiHandler from "./carla-api-handler";
import EventListener from "./event-listener";

export default Service.extend({
  init() {
    this._super(...arguments);

    if (!this.listenerStarted) {
      this.listenerStarted = true;
      this.startEventListener();
    }
  },

  startEventListener() {
    EventListener.listen((eventData) => {
      if (eventData.action === "previewInCarjan") {
        this.handlePreviewEvent();
      }
    });
  },

  async handlePreviewEvent() {
    try {
      await CarlaApiHandler.sendDataToCarla();
    } catch (error) {
      console.error("Error handling preview event:", error);
    }
  },
});
