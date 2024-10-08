import ajaxActions from "ajan-editor/helpers/carjan/actions/ajax";
import token from "ajan-editor/helpers/token";
import rdfGraph from "ajan-editor/helpers/RDFServices/RDF-graph";
import rdfManager from "ajan-editor/helpers/RDFServices/RDF-manager";
import rdfFact from "ajan-editor/helpers/RDFServices/RDF-factory";
import utility from "ajan-editor/helpers/RDFServices/utility";
import agentProducer from "ajan-editor/helpers/RDFServices/agentsRDFProducer";
import behaviorProducer from "ajan-editor/helpers/RDFServices/behaviorsRDFProducer";
import eventProducer from "ajan-editor/helpers/RDFServices/eventsRDFProducer";
import endpointProducer from "ajan-editor/helpers/RDFServices/endpointsRDFProducer";
import goalProducer from "ajan-editor/helpers/RDFServices/goalsRDFProducer";
import {
  AGENTS,
  XSD,
  RDF,
  RDFS,
} from "ajan-editor/helpers/RDFServices/vocabulary";
import rdf from "npm:rdf-ext";
import N3 from "npm:rdf-parser-n3";
import stringToStream from "npm:string-to-stream";

export default {
  // Delete Service Object
  deleteAgent: deleteAgent,
  deleteBehavior: deleteBehavior,
  deleteEvent: deleteEvent,
  deleteEndpoint: deleteEndpoint,
  deleteGoal: deleteGoal,
  deleteVariable: deleteVariable,

  createDefaultAgent: createDefaultAgent,
  createDefinedAgent: createDefinedAgent,
  createDefaultInitialBehavior: createDefaultInitialBehavior,
  createDefaultFinalBehavior: createDefaultFinalBehavior,
  createDefaultBehavior: createDefaultBehavior,
  createDefinedBehavior: createDefinedBehavior,
  createDefaultEvent: createDefaultEvent,
  createDefinedEvent: createDefinedEvent,
  createDefaultEndpoint: createDefaultEndpoint,
  createDefinedEndpoint: createDefinedEndpoint,
  createDefaultGoal: createDefaultGoal,

  createAgent: agentProducer.createAgent,
  createAgentRDFString: agentProducer.createAgentRDFString,
  createInitialBehavior: behaviorProducer.createInitialBehavior,
  createFinalBehavior: behaviorProducer.createFinalBehavior,
  createBehavior: behaviorProducer.createBehavior,
  createEvent: eventProducer.createEvent,
  createEndpoint: endpointProducer.createEndpoint,
  createGoal: goalProducer.createGoal,
  createVariable: goalProducer.createVariable,
  appendVariable: goalProducer.appendVariable,

  // AJAX related Actions
  resolveToken: token.resolveToken,

  createRepository: ajaxActions.createRepository,

  getAgents: ajaxActions.getAgents,
  getFromServer: ajaxActions.getFromServer,
  saveAgentGraph: ajaxActions.saveGraph,
  //
  getBehaviors: ajaxActions.getBehaviors,
  saveBehaviorsGraph: ajaxActions.saveGraph,
  //
  getEvents: ajaxActions.getEvents,
  saveEventsGraph: ajaxActions.saveGraph,
  //
  getEndpoints: ajaxActions.getEndpoints,
  saveEndpointsGraph: ajaxActions.saveGraph,
  //
  getGoals: ajaxActions.getGoals,
  saveGoalsGraph: ajaxActions.saveGraph,
  //
  readTTLInput: readTTLInput,
  getAgentDefsMatches: getAgentDefsMatches,
  getTTLMatches: getTTLMatches,
  deleteMatches: deleteMatches,
  deleteInverseMatches: deleteInverseMatches,
  exportGoal: exportGoal,
};

function deleteAgent(agent, noObject) {
  console.log(agent);
  rdfGraph.removeNamedGraph(agent.initKnowledge);
  rdfGraph.removeAllRelated(agent.uri, noObject);
}

function deleteBehavior(behavior, noObject) {
  console.log(behavior);
  rdfGraph.removeAllRelated(behavior.uri, noObject);
}
function deleteEvent(event, noObject) {
  console.log(event);
  rdfGraph.removeAllRelated(event.uri, noObject);
}
function deleteEndpoint(endpoint, noObject) {
  console.log(endpoint);
  rdfGraph.removeAllRelated(endpoint.uri, noObject);
}

function deleteGoal(goal, noObject) {
  console.log(goal);
  if (goal.variables && goal.consumes && goal.produces) {
    goal.variables.forEach((item) => {
      rdfGraph.removeAllRelated(item.uri);
      rdfGraph.removeAllRelated(item.pointerUri);
    });
    rdfGraph.removeAllRelated(goal.consumes.uri);
    rdfGraph.removeAllRelated(goal.produces.uri);
  }
  rdfGraph.removeAllRelated(goal.uri, noObject);
}

function deleteVariable(ele, val) {
  rdfManager.removeListItem(val.pointerUri);
  ele = ele.filter((item) => item !== val);
  rdfGraph.removeAllRelated(val.uri);
  return ele;
}

function createDefaultAgent(repo) {
  let agent = {};
  agent.uri = repo + "agents#AG_" + utility.generateUUID();
  agent.type = AGENTS.AgentTemplate;
  agent.label = "Default AgentTemplate";
  agent.name = "AgentTemplate";
  agent.behaviors = new Array();
  agent.events = new Array();
  agent.endpoints = new Array();
  agent.initKnowledge = agent.uri + "/InitKnowledge";
  return agent;
}

function createDefinedAgent(
  repo,
  btDef,
  includedEvents,
  includedBehaviors,
  includedEndpoints
) {
  let agent = {};
  agent.uri = repo + "#AG_" + btDef.name + "_" + utility.generateUUID();
  agent.type = AGENTS.AgentTemplate;
  agent.label = btDef.name + " AgentTemplate";
  agent.name = "AgentTemplate";
  agent.behaviors = includedBehaviors;
  agent.events = includedEvents.all;
  agent.endpoints = includedEndpoints;
  agent.initKnowledge = agent.uri + "/InitKnowledge";
  return agent;
}

function createDefaultInitialBehavior(repo) {
  let behavior = {};
  behavior.uri = repo + "agents#IB_" + utility.generateUUID();
  behavior.type = AGENTS.InitialBehavior;
  behavior.label = "Default InitialBehavior";
  behavior.name = "InitialBehavior";
  let bt = {};
  bt.label = "";
  bt.uri = "";
  behavior.bt = bt;
  return behavior;
}

function createDefaultFinalBehavior(repo) {
  let behavior = {};
  behavior.uri = repo + "agents#FB_" + utility.generateUUID();
  behavior.type = AGENTS.FinalBehavior;
  behavior.label = "Default FinalBehavior";
  behavior.name = "FinalBehavior";
  let bt = {};
  bt.label = "";
  bt.uri = "";
  behavior.bt = bt;
  return behavior;
}

function createDefaultBehavior(repo) {
  let behavior = {};
  behavior.uri = repo + "agents#BE_" + utility.generateUUID();
  behavior.type = AGENTS.Behavior;
  behavior.label = "Default Behavior";
  behavior.behavior = "Behavior";
  behavior.addtype = "";
  behavior.requires = "";
  behavior.triggers = new Array();
  let bt = {};
  bt.label = "";
  bt.uri = "";
  behavior.bt = bt;
  behavior.clearEKB = false;
  return behavior;
}

function createDefinedBehavior(repo, btDef, events, includedBehaviors) {
  console.log(events);
  let behavior = {};
  behavior.uri = repo + "#BE_" + utility.generateUUID();
  behavior.type = AGENTS.Behavior;
  behavior.label = btDef.name + " Behavior";
  behavior.behavior = "Behavior";
  behavior.triggers = events.handle;
  let bt = {};
  bt.label = btDef.name;
  bt.uri = btDef.uri;
  behavior.bt = bt;
  behavior.clearEKB = false;
  includedBehaviors.push(behavior.uri);
  return behavior;
}

function createDefaultEvent(repo) {
  let event = {};
  event.type = AGENTS.Event;
  event.uri = repo + "agents#EV_" + utility.generateUUID();
  event.label = "Default Event";
  event.name = "Event";
  return event;
}

function createDefinedEvent(repo, btDef, includedEvents) {
  let event = {};
  event.type = AGENTS.Event;
  event.uri = repo + "#EV_" + utility.generateUUID();
  event.label = btDef.name + " Event";
  event.name = "Event";
  includedEvents.handle.push(event.uri);
  includedEvents.all.push(event.uri);
  return event;
}

function createDefaultEndpoint(repo) {
  let endpoint = {};
  endpoint.uri = repo + "agents#EP_" + utility.generateUUID();
  endpoint.type = AGENTS.Endpoint;
  endpoint.name = "Endpoint";
  endpoint.label = "Default Endpoint";
  endpoint.capability = "";
  endpoint.events = new Array();
  return endpoint;
}

function createDefinedEndpoint(repo, btDef, event, includedEndpoints) {
  let endpoint = {};
  endpoint.uri = repo + "#EP_" + utility.generateUUID();
  endpoint.type = AGENTS.Endpoint;
  endpoint.name = "Endpoint";
  endpoint.label = btDef.name + " Endpoint";
  endpoint.capability = btDef.name.replaceAll(" ", "_");
  endpoint.events = [event];
  includedEndpoints.push(endpoint.uri);
  return endpoint;
}

function createDefaultGoal(repo) {
  let goal = {};
  goal.uri = repo + "agents#GO_" + utility.generateUUID();
  goal.label = "Default Goal";
  goal.type = AGENTS.Goal;
  goal.name = "Goal";
  goal.variables = [{ uri: rdfFact.blankNode().value, var: "s" }];

  let consumes = {};
  consumes.uri = "";
  consumes.sparql = "ASK WHERE { ?s ?p ?o }";

  let produces = {};
  produces.uri = "";
  produces.sparql = "ASK WHERE { ?s ?p ?o }";

  goal.consumes = consumes;
  goal.produces = produces;
  return goal;
}

function readTTLInput(content, onend) {
  let parser = new N3({ factory: rdf });
  let quadStream = parser.import(stringToStream(content));
  let importFile = {
    raw: content,
    quads: [],
    agents: [],
    behaviors: [],
    endpoints: [],
    events: [],
    goals: [],
  };
  rdf
    .dataset()
    .import(quadStream)
    .then((dataset) => {
      dataset.forEach((quad) => {
        importFile.quads.push(quad);
        if (
          quad.predicate.value === RDF.type &&
          quad.object.value === AGENTS.AgentTemplate
        ) {
          importFile.agents.push(quad.subject.value);
        } else if (
          quad.predicate.value === RDF.type &&
          quad.object.value === AGENTS.InitialBehavior
        ) {
          importFile.behaviors.push(quad.subject.value);
        } else if (
          quad.predicate.value === RDF.type &&
          quad.object.value === AGENTS.FinalBehavior
        ) {
          importFile.behaviors.push(quad.subject.value);
        } else if (
          quad.predicate.value === RDF.type &&
          quad.object.value === AGENTS.Behavior
        ) {
          importFile.behaviors.push(quad.subject.value);
        } else if (
          quad.predicate.value === RDF.type &&
          quad.object.value === AGENTS.Endpoint
        ) {
          importFile.endpoints.push(quad.subject.value);
        } else if (
          quad.predicate.value === RDF.type &&
          quad.object.value === AGENTS.Event
        ) {
          importFile.events.push(quad.subject.value);
        } else if (
          quad.predicate.value === RDF.type &&
          quad.object.value === AGENTS.Goal
        ) {
          importFile.goals.push(quad.subject.value);
        }
      });
      onend(importFile);
    });
}

function getAgentDefsMatches(agentDefs, importFile, contains) {
  console.log(importFile);
  let matches = getTTLMatches(agentDefs.templates, importFile.agents, matches);
  matches = getTTLMatches(
    agentDefs.behaviors.final,
    importFile.behaviors,
    matches
  );
  matches = getTTLMatches(
    agentDefs.behaviors.initial,
    importFile.behaviors,
    matches
  );
  matches = getTTLMatches(
    agentDefs.behaviors.regular,
    importFile.behaviors,
    matches
  );
  matches = getTTLMatches(agentDefs.endpoints, importFile.endpoints, matches);
  matches = getTTLMatches(agentDefs.events, importFile.events, matches);
  matches = getTTLMatches(agentDefs.goals, importFile.goals, matches);
  if (contains) {
    setNonMatches(importFile.agents, matches, contains);
    setNonMatches(importFile.behaviors, matches, contains);
    setNonMatches(importFile.endpoints, matches, contains);
    setNonMatches(importFile.events, matches, contains);
    setNonMatches(importFile.goals, matches, contains);
  }
  return matches;
}

function getTTLMatches(defs, imports, matches) {
  if (!matches) matches = [];
  if (imports) {
    defs.forEach((data) => {
      imports.forEach((item) => {
        if (data.uri === item) {
          data.match = true;
          data.import = true;
          if (!matches.find((x) => x.uri === data.uri)) matches.push(data);
        }
      });
    });
  }
  return matches;
}

function setNonMatches(imports, matches, contains) {
  imports.forEach((data) => {
    let clone = [...matches];
    let importData = clone.find((x) => x.uri === data);
    if (!importData) {
      let contain = contains.find((x) => x.uri === data);
      matches.push({
        uri: contain.uri,
        name: contain.name,
        type: getContainType(contain.type),
        match: false,
        import: true,
      });
    }
  });
}

function getContainType(type) {
  switch (type) {
    case "Agent":
      return AGENTS.AgentTemplate;
    case "Behavior":
      return AGENTS.Behavior;
    case "InitialBehavior":
      return AGENTS.InitialBehavior;
    case "FinalBehavior":
      return AGENTS.FinalBehavior;
    case "Endpoint":
      return AGENTS.Endpoint;
    case "Event":
      return AGENTS.Event;
    case "Goal":
      return AGENTS.Goal;
    default:
      return type;
  }
}

function deleteMatches(matches) {
  if (matches.length > 0) {
    matches.forEach((data) => {
      if (data.import || data.import === undefined) {
        deleteMatch(data);
      }
    });
  }
}

function deleteInverseMatches(matches) {
  if (matches.length > 0) {
    matches.forEach((data) => {
      if (!data.import) {
        deleteMatch(data);
      }
    });
  }
}

function deleteMatch(data) {
  if (data.type === AGENTS.AgentTemplate) deleteAgent(data, true);
  else if (data.type === AGENTS.InitialBehavior) deleteBehavior(data, true);
  else if (data.type === AGENTS.FinalBehavior) deleteBehavior(data, true);
  else if (data.type === AGENTS.Behavior) deleteBehavior(data, true);
  else if (data.type === AGENTS.Endpoint) deleteEndpoint(data, true);
  else if (data.type === AGENTS.Event) {
    deleteEvent(data, true);
  } else if (data.type === AGENTS.Goal) {
    deleteGoal(data, true);
  }
}

function exportGoal(nodeURI) {
  let goal = new Array();
  let nodes = new Array();
  visitNode(nodeURI, nodes);
  nodes.forEach((uri) => {
    let quads = rdfGraph.getAllQuads(uri);
    quads.forEach((quad) => {
      goal.push(quad);
    });
  });
  return goal;
}

function visitNode(uri, nodes) {
  rdfGraph.forEach((quad) => {
    if (quad.subject.value === uri) {
      if (quad.object.value !== RDF.nil && quad.predicate.value !== RDF.type) {
        let child = quad.object.value;
        if (!nodes.includes(uri)) nodes.push(uri);
        visitNode(child, nodes);
      }
    }
  });
}
