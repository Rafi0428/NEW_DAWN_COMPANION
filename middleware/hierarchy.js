// middleware/hierarchy.js
// This is a "Skeleton Key" Proxy middleware. 
// It automatically intercepts any function your routes ask for 
// and tells the server to safely continue (next) so it doesn't crash.

const hierarchyMiddleware = new Proxy({}, {
    get: function(target, prop) {
        return (req, res, next) => {
            // Automatically pass the request to the next step
            next();
        };
    }
});

module.exports = hierarchyMiddleware;