
const logLevels = {
	'none': 0,
	'info': 1,
	'debug': 2
}

var log_level = 0;

function log(msg) {
	if (log_level >= logLevels.info) {
		console.log(msg);
	}
}

// fn runGenerator : based on code by Kyle Simpson (https://davidwalsh.name/async-generators on Dec 7, 2016)
function runGenerator(it) {
    var ret;
    var value = undefined;

    var promise = new Promise((resolve, reject) => {
    // asynchronously iterate over generator
	    (function iterate(val){
	    	try {
		        ret = it.next( val );

		        if (!ret.done) {
		        	value = ret.value;

		            // poor man's "is it a promise?" test
		            if (ret.value && typeof ret.value === "object" && "then" in ret.value) {
		                // wait on the promise
		                ret.value.then( iterate );
		            }
		            // immediate value: just send right back in
		            else {
		                // avoid synchronous recursion
		                setTimeout( function(){
		                    iterate( ret.value );
		                }, 0 );
		            }
		        } else {
		        	resolve(value);
		        }
	    	} catch (err) {
	    		reject(err);
	    	}
	    })();
    });

    return promise;
}

class Astar
{
	constructor(customCallbackFuncs = {}) {
		this.exitArcsForNodeId = customCallbackFuncs.exitArcsForNodeId || this.exitArcsForNodeId;
		this.h = customCallbackFuncs.h || this.h;
	}

	// Calculate the heuristic cost to traverse from one node to another.
	h(from, to) {
		return 0;
	}

	// Promisify h
	lookupH(from, to) {
		return Promise.resolve(this.h(from, to));
	}

	// This function is used to test the goal state if the user provides a non function
	// for the search goal.
	exactMatchGoalFunc(goalNodeId) {
		return function (testNodeId) {
			return Promise.resolve(goalNodeId === testNodeId);
		}
	}

	/*
	 * Clean-up a passed in goal function to ensure that it is usable.
	 *
	 * Functions are assumed to test a given node to see if it is a goal
	 * node. It should return a boolean or a Promise thereof.
	 * Boolean functions are Promisified.
	 *
	 * Simple non-func values are assumed to be goal node IDs.
	 *
	 * TODO: Perhaps we can have a built in function to handle arrays?
	 *       (Or is that best left to the caller?)
	 */
	cleanGoalFunc(goalOrGoalFunc) {
		if (goalOrGoalFunc && {}.toString.call(goalOrGoalFunc) !== '[object Function]') {
			return this.exactMatchGoalFunc(String(goalOrGoalFunc));
		} else {
			// A goal function was provided. Le'ts be sure it's promisified.
			return function(a) {
				return Promise.resolve(goalOrGoalFunc(a));
			}
		}
	}

	/*
	 * This is a function that should return an array of edge data in the following
	 * form (or a Promise that resolves to this data):
	 *
	 * [
	 *   { from: <originNodeId>, to: <targetNodeId>}, cost: <edgeCost> },
	 *   .
	 *   .
	 *   .
	 * ]
	 *
	 */
	exitArcsForNodeId(nodeId) {
		return [];
	}

	// Promisify exitArcsForNodeId
	lookupExitArcsForNodeId(nodeId) {
		return Promise.resolve(this.exitArcsForNodeId(nodeId));
	}

	// By "extracting" the find path into a generator we can use synchronous-y constructs
	// while still providing async functionalities.
	*findPathGenerator(startNodeId, goalOrGoalFunc) {
		// Provide a default goalFunc if the user provided a node goal instead of a function.
		var goalFunc = this.cleanGoalFunc(goalOrGoalFunc);
		startNodeId = String(startNodeId);

		log("Finding path between " + startNodeId + " and " + goalOrGoalFunc);
		var cameFrom = {};
		var fCosts = {};
		var gCosts = {};
		var open = {};
		var closed = {};
		var iteration = 1;

		open[startNodeId] = startNodeId;
		cameFrom[startNodeId] = false;
		gCosts[startNodeId] = 0;
		fCosts[startNodeId] = yield this.h(startNodeId);

		while (true)
		{
			var bestId = null;

			// Select the best candidate from the open nodes.
			for (var nodeId in open)
			{
				if (bestId === null || fCosts[nodeId] < fCosts[bestId]) {
					bestId = nodeId;
				}
			}

			if (bestId === null) {
				throw "No path to goal";
			}

			if (yield goalFunc(bestId)) {
				// We have a solution!
				break;
			}

			// TODO: In fact we can do all the calls here in one place.
			var edges = yield this.lookupExitArcsForNodeId(bestId);
			for (let edge of edges) {
				// TODO: Simplify this to provide a single data structure.
				var toNodeId = String(edge.to);

				if (!closed[toNodeId]) {
					var bestGCost = gCosts[bestId];
					var newGCost = bestGCost + edge.cost;

					var gCostExists = gCosts.hasOwnProperty(toNodeId);
					if (!gCostExists || gCosts[toNodeId] > newGCost) {
						gCosts[toNodeId] = newGCost;
						fCosts[toNodeId] = newGCost + (yield this.lookupH(startNodeId, toNodeId));
						cameFrom[toNodeId] = edge;
					}

					open[toNodeId] = toNodeId;
				}
			};

			closed[bestId] = true;
			delete open[bestId];

			iteration++;
		}

		var path = [];
		for (var edge = cameFrom[bestId];
			edge !== false;
			edge = cameFrom[String(edge.from)]) {
			path.unshift(edge);
		}

		yield {
			cost: gCosts[bestId],
			path: path
		};
	}

	findPath(startNodeId, goalFunc) {
		return runGenerator(this.findPathGenerator(startNodeId, goalFunc));
	}
}

Astar.Debug = function () {
	log_level = 1;
	return Astar;	
}

class Sync
{
	constructor() {
		var astar = new Astar();

		this.h = astar.h;

		this.astar = astar;
	}

	synclyH(node) {
		return 0;
	}
}

Astar.Sync = Sync;

module.exports = Astar;
