export type GraphNode = string;

export interface IGraphEdge {
	from :GraphNode;
	to: GraphNode;
	cost: number;
}

export type GoalFunction = (_: GraphNode) => boolean;
export type Goal = GraphNode | GoalFunction;

interface INodeMap {
	[key: string]: GraphNode;
}

interface ICostMap {
	[key: string]: number;
}

interface IPathMap<T extends IGraphEdge> {
	[key: string]: T | false;
}

interface IBooleanMap {
	[key: string]: boolean;
}

export interface IAstarOptions<T extends IGraphEdge> {
	exitArcsForNodeId?: (f: GraphNode) => T[] | Promise<T[]>;
	h?: (f: GraphNode, t: GraphNode) => number | Promise<number>;
}

const logLevels = {
	'none': 0,
	'info': 1,
	'debug': 2
}

var log_level = 0;

function log(msg: string) {
	if (log_level >= logLevels.info) {
		console.log(msg);
	}
}

export interface IGraphPath<T extends IGraphEdge = IGraphEdge> {
	cost: number;
	path: T[];
}

type PathGenerator<T extends IGraphEdge> = IterableIterator<Promise<boolean> | Promise<T[]> | Promise<number> | IGraphPath<T>>

// fn runGenerator : based on code by Kyle Simpson (https://davidwalsh.name/async-generators on Dec 7, 2016)
function runGenerator<T extends IGraphEdge>(it: PathGenerator<T>): Promise<IGraphPath<T>> {
    var ret: any;
    var value: any = undefined;

    var promise = new Promise<IGraphPath<T>>((resolve, reject) => {
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

export class Astar<T extends IGraphEdge = IGraphEdge>
{
	constructor(customCallbackFuncs: IAstarOptions<T> = {}) {
		this.exitArcsForNodeId = customCallbackFuncs.exitArcsForNodeId || this.exitArcsForNodeId;
		this.h = customCallbackFuncs.h || this.h;
	}

	// Calculate the heuristic cost to traverse from one node to another.
	public h(from: GraphNode, to: GraphNode): number | Promise<number> {
		return 0;
	}

	// Promisify h
	public lookupH(from: GraphNode, to: GraphNode) {
		return Promise.resolve(this.h(from, to));
	}

	// This function is used to test the goal state if the user provides a non function
	// for the search goal.
	public exactMatchGoalFunc(goalNodeId: GraphNode) {
		return function(testNodeId: GraphNode) {
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
	public cleanGoalFunc(goalOrGoalFunc: Goal) {
		if (goalOrGoalFunc && {}.toString.call(goalOrGoalFunc) !== '[object Function]') {
			return this.exactMatchGoalFunc(String(goalOrGoalFunc));
		} else {
			const goalFunc = goalOrGoalFunc as GoalFunction;
			// A goal function was provided. Le'ts be sure it's promisified.
			return function(a: GraphNode) {
				return Promise.resolve(goalFunc(a));
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
	exitArcsForNodeId(nodeId: GraphNode): T[] | Promise<T[]> {
		return [];
	}

	// Promisify exitArcsForNodeId
	lookupExitArcsForNodeId(nodeId: GraphNode): T[] | Promise<T[]> {
		return Promise.resolve(this.exitArcsForNodeId(nodeId));
	}

	// By "extracting" the find path into a generator we can use synchronous-y constructs
	// while still providing async functionalities.
	private *findPathGenerator(startNodeId: GraphNode, goalOrGoalFunc: Goal) {
		// Provide a default goalFunc if the user provided a node goal instead of a function.
		var goalFunc = this.cleanGoalFunc(goalOrGoalFunc);
		startNodeId = String(startNodeId);

		log("Finding path between " + startNodeId + " and " + goalOrGoalFunc);
		var cameFrom: IPathMap<T> = {};
		var fCosts: ICostMap = {};
		var gCosts: ICostMap = {};
		var open: INodeMap = {};
		var closed: IBooleanMap = {};
		var iteration = 1;

		open[startNodeId] = startNodeId;
		cameFrom[startNodeId] = false;
		gCosts[startNodeId] = 0;
		fCosts[startNodeId] = 0; // Is this correct?

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
			var edges: T[] = yield this.lookupExitArcsForNodeId(bestId);
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

		const retVal: IGraphPath<T> = {
			cost: gCosts[bestId],
			path: path
		};
		yield retVal;
	}

	findPath(startNodeId: GraphNode, goalFunc: Goal): Promise<IGraphPath<T>> {
		const pathGenerator = this.findPathGenerator(startNodeId, goalFunc);
		// This needs to be fixed. It may actually be important... ;)
		return runGenerator<T>(pathGenerator as any);
	}

	public static Debug: () => typeof Astar;
}

Astar.Debug = function () {
	log_level = 1;
	return Astar;
}
