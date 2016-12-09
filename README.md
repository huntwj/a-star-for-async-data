# A* Search for Async Data

The goal of this package is to provide a flexible implementation of the A*
search algorithm that allows for asynchronous data sources. Instead of
requiring the entire graph to be in memory or even that graph data be
immediately returned, we can search on a graph while allowing data to
trickle in however slow it may be.

## Usage

### Basic Import
```javascript
// ES6
import Astar from 'a-star-for-async-data';

// require
var Astar = require('a-star-for-async-data');
```

### Defining the datasource callbacks

There are two callbacks used to configure the search object. These are
used for all path finding operations on a given search object. The first,
`exitArcsForNodeId` is required, and the second, `h` is optional.

(There will be a third potential callback, but it is not used when
constructing the search object.)

#### The exit edges function
`exitArcsForNodeId(nodeId)`

This callback should return/resolve an array of arcs (edges) leaving a given
node.

Be sure to format the data properly. The returned/resolved data should be an
iterable collection (such as an array) of edge objects. Each edge object
should have at least `from`, `to`, and `cost` members. Other data will be
preserved, so you are welcome to annotate these to your heart's content. If
you have an existing data model, you could just add a property pointing back
to the original object.

Note: All node IDs are stringified, so be sure to use strings or values that
convert easily intro strings without collision. (We still do not change the
data in your edge objects, even if they are not strings.)

```javascript
function customEdgeLookupFunc(nodeId) {
	return new Promise(function (resolve, reject) {
		// Do some (possibly expensive) IO to get the data...
		// then return it in digestible form...
		// Extra data is preserved.
		var edges = [
			// 0 or more of these objects.
			{
			    // You can add other data here such as a link back
			    // to the original model data. But you must at least
			    // have:
			    from: fromNodeId
			    to: toNodeId,
			    cost: edgeCost
			}
		];
	});
}
```

#### The heuristic function
`h(nodeId)`

The heuristic function should return a number estimating the minimum cost to
travel from the given node to a goal state. See a good resource on the A*
algorithm for help in what constitutes a good heuristic function. (A bad one
can pretty much ruin the search.)

The short story is that you want a heuristic that gets as close to the real
path cost without actually going over. For those familiar with American
television game shows, think, "The Price is Right," only it's "The Cost is
Right" instead. Estimating closer to the real value provides a faster search,
but if the heuristic can *ever* guess too high, then you are not guaranteed
to get the optimal (lowest-cost) solution.

```javascript
function customHeuristicFunc(nodeId) {
	// If you return 0 always, A* devolves into a standard
	// Dijkstra algorithm.
	return 0;
}
```

#### Instantiate the search alrorithm with your custom callbacks

Pass an object with the callback functions to the constructor. Note that the
heuristic function `h` is optional. If none is provided a default zero
heuristic is used. These results in the search acting just like a vanilla
Dijkstra search.

```javascript
var mySearch = new Astar({
	exitArcsForNodeId: customEdgeLookupFunc,
	h:                 customHeuristicFunc
});
```

#### Perform the search

A specific path search is initiated with a starting node ID and a goal state.
The goal state can be either another node ID, in which case only that node
will match as the goal, or it can be a function allowing you full control
over the matching. (You could provide a custom check on some property of the
node to see if it matches.) The `findPath(startId, goal)` function returns
a `Promise` that resolves when the search is complete.

##### Searching for an explicit goal node ID
```javascript
// Search by explicit nodeId
mySearch.findPath(startId, targetId)
    .then(function (path)) {
    	// path is an object that looks like:
    	// path = {
    	//   cost: <fullCostOfPath>,
    	//   path: <arrayOfEdges>
		// }
    }).catch(function (reason) {
    	if (reason === "No path to goal") {
    		// This is pedestrian...
    	} else {
    		// This is not...
    	}
    });
```

##### Searching with a custom goal function

We can also search with a custom goal checking function. As with the other
functions, this can be implemented asynchronously using a `Promise`.

```javascript
// Return a boolean or a Promise of a boolean
function nodeIsAwesome(nodeId) {
	return new Promise(function (resolve, reject) {
		lookupNodeFromId(nodeId).then(function (node) {
			let isAwesomeEnough = (node.awesomeSauceRating > 5);
			resolve(isAwesomeEnough);
		}).catch(function (reason) {
			reject(reason);
		});
	});
}

mySearch.findPath(startId, nodeIsAwesome)
    .then(function (path))
    .
    .
```

### Motivation

I needed a search algorithm that would work with the [SQLite](https://github.com/mapbox/node-sqlite3)
library. That library does not provide synchronous data lookup, so it was
unsuited for the existing A* implementations that were either fully synchronous
or provided an asynchronous calling mechanism but still depended on synchronous
callbacks to the data.

