function promiseReturn(val) {
	return new Promise(function (resolve, reject) {
		resolve(val);
	});
}

function runGenerator(it) {
    var ret;
    var value = undefined;

    var promise = new Promise((resolve, reject) => {
    // asynchronously iterate over generator
	    (function iterate(val){
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
	    })();
    });

    return promise;
}

class Astar
{
	constructor(customCallbackFuncs) {
		this.getEdgesLeavingNode = customCallbackFuncs.getEdgesLeavingNode || this.getEdgesLeavingNode;
	}

	h(node) {
		return promiseReturn(0);
	}

	edgeCost(edge) {
		return promiseReturn(edge.cost);
	}

	edgeSource(edge) {
		return promiseReturn(edge.from);
	}

	edgeTarget(edge) {
		return promiseReturn(edge.to);
	}

	exactMatchGoalFunc(node1, node2) {
		return promiseReturn(this.nodeId(node1) === this.nodeId(node2));
	}

	nodeId(node) {
		return String(node);
	}

	getEdgesLeavingNode(node) {
		return promiseReturn([]);
	}

	*findPathGenerator(startNode, goalFunc) {
		// Provide a default goalFunc if the user provided a node goal instead of a function.
		if (goalFunc && {}.toString.call(goalFunc) !== '[object Function]') {
			goalFunc = this.exactMatchGoalFunc.bind(this, goalFunc);
		}

		var cameFrom = {};
		var fCosts = {};
		var gCosts = {};
		var open = {};
		var closed = {};
		var iteration = 1;

		let startNodeId = this.nodeId(startNode);
		open[startNodeId] = startNode;
		cameFrom[startNodeId] = false;
		gCosts[startNodeId] = 0;
		fCosts[startNodeId] = yield this.h(startNode);

		while (true)
		{
			var best = null;
			var bestId = null;

			// Select the best candidate from the open nodes.
			for (var nodeId in open)
			{
				var node = open[nodeId];
				if (best === null || fCosts[nodeId] < fCosts[this.nodeId(best)]) {
					best = node;
					bestId = this.nodeId(best);
				}
			}

			if (best === null) {
				throw "No path to goal";
			}

			if (yield goalFunc(best)) {
				// We have a solution!
				break;
			}

			var edges = yield this.getEdgesLeavingNode(best);
			for (let edge of edges) {
				var toNode = (yield this.edgeTarget(edge));
				var toNodeId = this.nodeId(toNode);

				if (!closed[toNodeId]) {
					var bestGCost = gCosts[bestId];
					var newGCost = bestGCost + (yield this.edgeCost(edge));

					var gCostExists = gCosts.hasOwnProperty(toNodeId);
					if (!gCostExists || gCosts[toNodeId] > newGCost) {
						gCosts[toNodeId] = newGCost;
						fCosts[toNodeId] = newGCost + (yield this.h(toNode));
						cameFrom[toNodeId] = edge;
					}

					open[toNodeId] = toNode;
				}
			};

			closed[bestId] = true;
			delete open[bestId];

			iteration++;
		}

		var path = [];
		for (var edge = cameFrom[this.nodeId(best)];
			edge !== false;
			edge = cameFrom[(yield this.edgeSource(edge))]) {
			path.unshift(edge);
		}

		yield {
			cost: gCosts[bestId],
			path: path
		};
	}

	findPath(startNode, goalFunc) {
		return runGenerator(this.findPathGenerator(startNode, goalFunc));
	}
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
