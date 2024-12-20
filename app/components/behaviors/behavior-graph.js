/* eslint-disable sort-imports */
/*
 * Created on Tue Nov 10 2020
 *
 * The MIT License (MIT)
 * Copyright (c) 2020 André Antakli, Alex Grethen (German Research Center for Artificial Intelligence, DFKI).
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import actions from "ajan-editor/helpers/behaviors/actions";
import actionsAgnt from "ajan-editor/helpers/agents/actions";
import {cleanDOM}  from "ajan-editor/helpers/graph/cy-cleanup";
import Ember from "ember";
import events from "ajan-editor/helpers/behaviors/event-bindings";
import globals from "ajan-editor/helpers/global-parameters";
import nodeDefs from "ajan-editor/helpers/RDFServices/node-definitions/common";
import rdfGraph from "ajan-editor/helpers/RDFServices/RDF-graph";
import rdfManager from "ajan-editor/helpers/RDFServices/RDF-manager";
import { AGENTS } from "ajan-editor/helpers/RDFServices/vocabulary";
import Split from "npm:split.js";

let $ = Ember.$;

// References
let cy = null; // cytoscape
let ajax = null; // ajax
// let undoRedo = null; // undoRedo
let ur = null; // undoRedo
let that;

export default Ember.Component.extend({
	classNames: ["full-height"],
  ajax: Ember.inject.service(),
  cytoscapeService: Ember.inject.service("behaviors/cytoscape"),
  dataBus: Ember.inject.service(),
  availableBTs: undefined,
  availableEvents: undefined,
  availableBehaviors: undefined,
  availableEndpoints: undefined,
  cyRef: undefined,

  init() {
    this._super(...arguments);
    that = this;

    this.get('dataBus').on('addBT', createBT);
    this.get('dataBus').on('generateAgent', generateAgent);
    this.get('dataBus').on('cloneBT', cloneBT);
    this.get('dataBus').on('exportBT', saveExportedBT);
    this.get('dataBus').on('importBT', importBT);
    this.get('dataBus').on('deleteBT', deleteBT);
  },

	// After the element has been inserted into the DOM
  didInsertElement() {
    this._super(...arguments);

		initializeCytoscape(this);
		initializeGlobals(this);
		initializeSplitPanes();
		setTriplestoreField();
		bindRequiredEvents();
		cy.resize();

    loadNodeDefinitionsThenGraph();
	}, // end didInsertElement

	// ******************** Declare actions ********************
	// actions used in the .hbs file
	actions: {
    handleInput(event) {
      let inputValue = event.target.value;

      let accordions = event.target.parentElement.getElementsByClassName("accordion");
      for (let i = 0; i < accordions.length; i++) {
        let accordion = accordions[i];
        for (let j = 0; j < accordion.children.length; j++) {
          let child = accordion.children[j];
          if(inputValue === ""){
            child.classList.remove('active');
          } else {
            child.classList.add('active');
          }
        }
      }

      // Declare variables
      let filter, container, list, element, i, txtValue;
      filter = inputValue.toUpperCase();
      container = event.target.parentElement;
      list = container.getElementsByClassName("node-name");

      // Loop through all list items, and hide those who don't match the search query
      for (i = 0; i < list.length; i++) {
        element = list[i];
        txtValue = element.textContent || element.innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
          element.parentElement.classList.add("visible");
          let categorietext = element.parentElement.parentElement.parentElement.children[0].children[1].children[0].innerText;
          if(categorietext === "Default Nodes"){
            element.parentElement.style.display = "flex !important";
            console.log(element.parentElement)
          } else {
            element.parentElement.style.display = "";
          }
        } else {
          element.parentElement.style.display = "none";
          element.parentElement.classList.remove("visible");
        }
      }
    }
	},

	willDestroyElement() {
    this._super(...arguments);

    this.get('dataBus').off('addBT', createBT);
    this.get('dataBus').off('generateAgent', generateAgent);
    this.get('dataBus').off('cloneBT', cloneBT);
    this.get('dataBus').off('exportBT', saveExportedBT);
    this.get('dataBus').off('importBT', importBT);
    this.get('dataBus').off('deleteBT', deleteBT);
    console.log("adele");

    cleanDOM();
	}
}); // end Ember export

function initializeCytoscape(that) {
	cy = that.get("cytoscapeService").newCytoscapeInstance();
	ur = that.get("cytoscapeService").ur;
	globals.cy = cy;
	that.set("cyRef", cy)
}

function initializeGlobals(currentComponent) {
	setCurrentComponent(currentComponent);
	initializeAjax();
}

function setCurrentComponent(currentComponent) {
	globals.currentComponent = currentComponent;
}

function initializeAjax() {
	ajax = globals.currentComponent.get("ajax");
	globals.ajax = ajax;
}

function initializeSplitPanes() {
	Split(["#split-left", "#split-middle", "#split-right"], {
		sizes: [15.5, 60, 24.5],
		minSize: [0, 300, 0],
		direction: "horizontal",
		cursor: "col-resize",
		gutterSize: 10,
		onDragEnd: () => {
			cy.resize();
		}
	});
}

function loadNodeDefinitionsThenGraph() {
  nodeDefs(ajax, cy).then(loadBTRdfGraphData);
  loadAgentsRdfGraphData();
}

function loadBTRdfGraphData() {
	let repo =
		(localStorage.currentStore || "http://localhost:8090/rdf4j/repositories") +
		"/" +
    globals.behaviorsRepository;
  if (repo.includes("repositories//behaviors")) {
    repo = repo.replace("repositories//behaviors", "repositories/behaviors");
  }
	actions.getFromServer(cy, ajax, repo).then(rdfDataHasLoaded);
}

function rdfDataHasLoaded(rdfData) {
  console.log("has Loaded");
  rdfGraph.set(rdfData);
  rdfGraph.setUnsavedMethod(unsavedChanges);
  setAvailableBTs();
	bindEvents();
  cy.resize();
  that.dataBus.updatedBT();
}

function unsavedChanges() {
  that.dataBus.unsavedChanges();
}

function setAvailableBTs() {
  let behaviorTrees = actions.getBehaviorTrees();
  that.set("availableBTs", behaviorTrees);
}

function loadAgentsRdfGraphData() {
  let repo = (localStorage.currentStore || "http://localhost:8090/rdf4j/repositories")
    + globals.agentsRepository;
  actionsAgnt.getFromServer(ajax, repo)
    .then(setAvailableBehaviors)
    .then(setAvailableEvents)
    .then(setAvailableEndpoints);
}

function setAvailableBehaviors() {
  let behaviorsLists = actionsAgnt.getBehaviors();
  that.set("availableBehaviors", behaviorsLists.regular);
}

function setAvailableEvents() {
  let eventLists = actionsAgnt.getEvents();
  that.set("availableEvents", eventLists);
}

function setAvailableEndpoints() {
  let endpointList = actionsAgnt.getEndpoints();
  that.set("availableEndpoints", endpointList);
}

function generateAgent() {
  let agentRepo = (localStorage.currentStore || "http://localhost:8090/rdf4j/repositories/") + "agents";
  let selected = localStorage.getItem("bt-selected");
  let selectedBt = that.get("availableBTs").filter(item => item.uri == selected);
  let includedEvents = { all: new Array(), handle: new Array(), produce: new Array()};
  getEvents(includedEvents, selectedBt[0], that.get("availableBehaviors").filter(item => item.bt.uri != selectedBt[0].uri), true);
  let includedBehaviors = getBehaviors(selectedBt[0], includedEvents);
  let includedEndpoints = getEndpoints(includedEvents);
  let agentDef = {};
  agentDef.event = actionsAgnt.createDefinedEvent(agentRepo, selectedBt[0], includedEvents);
  agentDef.behavior = actionsAgnt.createDefinedBehavior(agentRepo, selectedBt[0], includedEvents, includedBehaviors);
  agentDef.endpoint = actionsAgnt.createDefinedEndpoint(agentRepo, selectedBt[0], agentDef.event, includedEndpoints);
  agentDef.template = actionsAgnt.createDefinedAgent(agentRepo, selectedBt[0], includedEvents, includedBehaviors, includedEndpoints);
  let stringRDF = actionsAgnt.createAgentRDFString(agentDef);
  saveGeneratedAgent(agentRepo, stringRDF);
}

function saveGeneratedAgent(repo, stringRDF) {
  try {
    actions.saveAgentGraph(globals.ajax, repo, stringRDF);
    //window.location.reload();
  } catch (e) {
    $("#error-message").trigger("showToast", [
      "Error while saving generated Agent"
    ]);
    throw e;
  }
}

function getEvents(includedEvents, bt, behaviors, root) {
  bt.nodes.forEach(function (item) {
    addEventURI(item, includedEvents, root);
  });
  behaviors.forEach(function (bhvs) {
    bhvs.triggers.forEach(function (event) {
      if (includedEvents.produce.includes(event.uri)) {
        bhvs.triggers.forEach(function (triggers) {
          includedEvents.all.push(triggers.uri);
        });
        let newBt = that.get("availableBTs").filter(item => item.uri == bhvs.bt.uri);
        console.log("Visit BT: " + newBt[0].uri);
        getEvents(includedEvents, newBt[0], behaviors.filter(item => item.uri != bhvs.uri), false);
      }
    });
  });
  return includedEvents;
}

function addEventURI(item, events, root) {
  let addableUri = "";
  if (item.category == "ProduceGoal") {
    addableUri = getGoalURI(item.uri);
    events.produce.push(addableUri);
  } else if (item.category == "ProduceEvent") {
    addableUri = getEventURI(item.uri);
    events.produce.push(addableUri);
  } else if (item.category == "HandleMappingEvent" || item.category == "HandleEvent" || item.category == "HandleQueueEvent") {
    addableUri = getEventURI(item.uri);
    if (root && addableUri != "" && !events.handle.includes(addableUri)) {
      events.handle.push(addableUri);
    }
  }
  if (that.get("availableEvents").filter(item => item.uri == addableUri).length > 0 && addableUri != "" && !events.all.includes(addableUri)) {
    events.all.push(addableUri);
  }
}

function getGoalURI(uri) {
  return rdfGraph.getObject(uri, AGENTS.goal).value;
}

function getEventURI(uri) {
  return rdfGraph.getObject(uri, AGENTS.event).value;
}

function getBehaviors(bt, includedEvents) {
  let addableBehaviors = new Array();
  let behaviors = that.get("availableBehaviors");
  includedEvents.all.forEach(function (event) {
    behaviors.forEach(function (bhvs) {
      bhvs.triggers.forEach(function (item) {
        if (item.uri == event && !addableBehaviors.includes(event) && bhvs.bt.uri != bt.uri) {
          addableBehaviors.push(bhvs.uri);
        }
      })
    });
  });
  return addableBehaviors;
}

function getEndpoints(includedEvents) {
  let addableEndpoints = new Array();
  let endpoints = that.get("availableEndpoints");
  includedEvents.all.forEach(function (event) {
    endpoints.forEach(function (endpt) {
      endpt.events.forEach(function (item) {
        if (item.uri == event && !addableEndpoints.includes(event)) {
          addableEndpoints.push(endpt.uri);
        }
      })
    });
  });
  return addableEndpoints;
}

function createBT(bt) {
  that.get("availableBTs").push(bt);
  that.dataBus.save();
}

function cloneBT(label) {
  let selected = localStorage.getItem("bt-selected");
  let bts = that.get("availableBTs").filter(item => item.uri == selected);
  if (bts.length > 0) {
    console.log(bts[0]);
    let bt = rdfManager.cloneBT(bts[0].uri, that.get("availableBTs").filter(item => item.uri !== selected), bts[0].name + "_clone");
    that.dataBus.save(bt);
  }
}

function importBT(bt) {
  console.log("Import BT");
}

function exportBT() {
  let bt = {};
  let selected = localStorage.getItem("bt-selected");
  let bts = that.get("availableBTs").filter(item => item.uri == selected);
  if (bts.length > 0) {
    bt.label = bts[0].name;
    bt.uri = selected;
    bt.definition = rdfManager.exportBT(bts[0].uri, that.get("availableBTs").filter(item => item.uri !== selected));
  }
  return bt;
}

function saveExportedBT() {
  that.get('dataBus').saveExportedBT(exportBT());
}

function deleteBT() {
  let selected = localStorage.getItem("bt-selected");
  let bts = that.get("availableBTs").filter(item => item.uri == selected);
  if (rdfManager.deleteBT(bts[0].uri, that.get("availableBTs").filter(item => item.uri !== selected), true)) {
    that.dataBus.save();
  }
}

function bindRequiredEvents() {
	events.cyAddEvent();
}

function bindEvents() {
	events.dragNode(cy);
	events.freeNode(cy);
	events.keyup(cy, ur);
	events.bindActionBar();
	events.clickNode(cy);
}

function setTriplestoreField() {
	$(".store-url").text(localStorage.currentStore);
}

