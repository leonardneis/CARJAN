/*
 * Created on Tue Nov 10 2020
 *
 * The MIT License (MIT)
 * Copyright (c) 2020 André Antakli, Xueting Li (German Research Center for Artificial Intelligence, DFKI).
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
import agentsHlp from "ajan-editor/helpers/RDFServices/agentsRDFConsumer";
import behaviorsHlp from "ajan-editor/helpers/RDFServices/behaviorsRDFConsumer";
import endpointsHlp from "ajan-editor/helpers/RDFServices/endpointsRDFConsumer";
import eventsHlp from "ajan-editor/helpers/RDFServices/eventsRDFConsumer";
import goalsHlp from "ajan-editor/helpers/RDFServices/goalsRDFConsumer";
import Ember from "ember";
import { isUnauthorizedError, isAjaxError, isNotFoundError, isForbiddenError, isServerError} from "ember-ajax/errors";
import rdfGraph from "ajan-editor/helpers/RDFServices/RDF-graph";
import SparqlQueries from "ajan-editor/helpers/RDFServices/queries";

let $ = Ember.$;
let agents = undefined;
let behaviors = undefined;
let endpoints = undefined;
let events = undefined;
let goals = undefined;
let loginResult = undefined;

export default {
	getAgents :function() {
		return agents;
  },

  getBehaviors: function () {
    return behaviors;
  },

  getEndpoints: function () {
    return endpoints;
  },

  getEvents: function () {
    return events;
  },

  getGoals: function () {
    return goals;
  },

	// Gets entire graph from server
  getFromServer: function (ajax, tripleStoreRepository) {
    let repos = JSON.parse(localStorage.triplestores);
    let result;

    repos.forEach(repo => {
      if (repo.uri + "agents" == tripleStoreRepository) {
        if (repo.secured) {
          if (!repo.token || repo.token == "" || !repo.expiration || repo.expiration < Date.now()) {
            result = createLoginModal(ajax, repos, repo, tripleStoreRepository);
          }
          else {
            result = loadAgentsRepo(ajax, tripleStoreRepository, repo.token);
          }
        }
        else {
          result = loadAgentsRepo(ajax, tripleStoreRepository, undefined);
        }
      }
    });

    return Promise.resolve(result);
  },

// save to repository
	saveGraph: function(ajax, tripleStoreRepository, event, onEnd) {
		console.log("Saving to triple store: ", tripleStoreRepository);

		let postDestination = tripleStoreRepository + "/statements";
		let rdfString = rdfGraph.toString();
		let query = SparqlQueries.update(rdfString);
		let dataString = $.param({update: query});

		// Keep local copy of saved stuff
		localStorage.setItem(
			"rdf_graph_saved_T-2",
			localStorage.getItem("rdf_graph_saved_T-1")
		);
		localStorage.setItem("rdf_graph_saved_T-1", dataString);

		ajax
			.post(postDestination, {
				contentType: "application/x-www-form-urlencoded; charset=utf-8",
				headers: {
					Accept: "application/ld+json"
				},
				// SPARQL query
				data: dataString
      }).then(function () {
        if (event) {
          event.updatedAG();
        }
        if (onEnd) {
          onEnd();
        }
      })
			.catch(function(error) {
				if (isServerError(error)) {
					// handle 5XX errors

					let restoreID = "rdf_graph_saved_T-2";
					let restoredItem = localStorage.getItem(restoreID);
					ajax
						.post(postDestination, {
							contentType: "application/x-www-form-urlencoded; charset=utf-8",
							headers: {
								Accept: "application/ld+json"
							},
							// SPARQL query
							data: restoredItem
						})
						.then(
							function(data) {
								// On accept
								console.log("Request success", data);
							},
							function(jqXHR) {
								// On reject
								console.log("Request failed", jqXHR);
							}
						);
					alert("Reloading previous save");
					location.reload();

					return;
				}
				throw error;
			});

		rdfGraph.unsavedChanges = false;
	}
};

function createLoginModal(ajax, repos, repo, tripleStoreRepository) {
  $("#modal-header-title").text("Repository Login" );
  let $body = $("#modal-body"),
    $modal = $("#universal-modal");
  $body.empty();
  $modal.show();

  // Credentials
  let $credentialsTitle = $("<p>", {
    class: "modal-p"
  }).text("User Credentials for: " + tripleStoreRepository);
  let $userInput = $("<input>", {
    class: "modal-input",
    id: "user-input",
    placeholder: "User",
  });

  let $roleInput = $("<input>", {
    class: "modal-input",
    id: "role-input",
    placeholder: "Role",
  });
  let $pswdInput = $("<input type='password' id='pswd-input'>", {});
  let $credentialsDiv = $("<div>", {
    class: "modal-body-div"
  }).append($credentialsTitle, $userInput, $roleInput, $pswdInput);
  // Append to modal body
  $body.append($credentialsDiv);

  // Listen for the confirm event
  let elem = document.getElementById("universal-modal");
  return new Promise((resolve, reject) => {
    elem.addEventListener("modal:confirm", function () {
      resolve(requestToken(ajax, repos, repo, tripleStoreRepository,
        $("#user-input").val(),
        $("#role-input").val(),
        $("#pswd-input").val())
      );
    });
  });
}

function requestToken(ajax, repos, repo, tripleStoreRepository, user, role, pswd) {
  return ajax.raw("http://localhost:8090/tokenizer/token?userId=" + user + "&role=" + role + "&pswd=" +  pswd + "", { type: "GET" })
    .then(function (data) {
      repo.token = data.payload.token;
      repo.expiration = Date.now() + (data.payload.expirySecs * 1000);
      localStorage.triplestores = JSON.stringify(repos);
      return loadAgentsRepo(ajax, tripleStoreRepository, repo.token);
    });
}

function loadAgentsRepo(ajax, tripleStoreRepository, token) {
  let ajaxPromise;
  console.log("token: " + token);
  if (token) {
    ajaxPromise = ajax.post(tripleStoreRepository, {
      contentType: "application/sparql-query; charset=utf-8",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/ld+json"
      },
      data: SparqlQueries.constructGraph,
    });
  } else {
    ajaxPromise = ajax.post(tripleStoreRepository, {
      contentType: "application/sparql-query; charset=utf-8",
      headers: {
        Accept: "application/ld+json"
      },
      data: SparqlQueries.constructGraph,
    });
  }

  return ajaxPromise.then(function (data) {
    console.log(data);

    // read agents
    let agentsGraph = agentsHlp.getAgentsGraph(data);
    let agentsPromise = Promise.resolve(agentsGraph);
    return agentsPromise.then(function (agentsResolved) {
      agents = agentsResolved[0];

      // read behaviors
      let behaviorsGraph = behaviorsHlp.getBehaviorsGraph(data);
      let behaviorsPromise = Promise.resolve(behaviorsGraph);
      return behaviorsPromise.then(function (behaviorsResolved) {
        behaviors = behaviorsResolved[0];

        // read endpoints
        let EndpointsGraph = endpointsHlp.getEndpointsGraph(data);
        let endpointsPromise = Promise.resolve(EndpointsGraph);
        return endpointsPromise.then(function (endpointsResolved) {
          endpoints = endpointsResolved[0];

          // read events
          let eventsGraph = eventsHlp.getEventsGraph(data);
          let eventsPromise = Promise.resolve(eventsGraph);
          return eventsPromise.then(function (eventsResolved) {
            events = eventsResolved[0];

            // read goals
            let GoalsGraph = goalsHlp.getGoalsGraph(data);
            let goalsPromise = Promise.resolve(GoalsGraph);
            return goalsPromise.then(function (goalsResolved) {
              goals = goalsResolved[0];
              let rdfGraph = goalsResolved[1];
              return rdfGraph;
            });
          });
        });
      });
    });
  });
}


