
const WPAPI     = require('wpapi');
const waterfall = require('async/waterfall');
const moment    = require('moment');
const Promise   = require('promise');
const lib       = require('./lib');

const keystoneCategories    = require('../../data/category')();
const keystonePosts         = require('../../data/posts')();

module.exports = new Importer();

const postsImg = {};

/**
 * @constructor
 */
function Importer() {
    this.wp = null;
    this.cache = [];
}

Importer.prototype.auth = function(url, username, password) {
    authenticate.call(this, url, username, password);
};

/**
 * @param url
 * @param username
 * @param password
 */
Importer.prototype.run = function(start, nb, done) {
    console.log('Importer.run');

    waterfall([
        getCategory.bind(this),
        (categories, cb) => getKeystonePosts(start, nb, categories, cb),
        (detachedPosts, cb) => hydrateTags.call(this, detachedPosts, cb),
        createPost.bind(this)
    ], function (err, result) {
        if (err) {
            if (typeof err === "string") {
                err = new Error(err);
            }
            done(err);
        } else {
            done(true);
        }
    });
};

/**
 * @param url
 * @param username
 * @param password
 */
function authenticate(url, username, password) {

    const _this = this;

    this.wp = new WPAPI({
        endpoint: url,
        username: username,
        password: password,
        auth: true/*,
        transport: {
            // Only override the transport for the GET method, in this example
            // Transport methods should take a wpreq object and a callback:
            get: function( wpreq, cb ) {
                let result = _this.cache[ wpreq ];
                // If a cache hit is found, return it via the same callback/promise
                // signature as the default transport method:
                if ( result ) {
                    if ( cb && typeof cb === 'function' ) {
                        // Invoke the callback function, if one was provided
                        cb( null, result );
                    }
                    // Return the data as a promise
                    return Promise.resolve( result );
                }

                // Delegate to default transport if no cached data was found
                return WPAPI.transport.get( wpreq, cb ).then(function( result ) {
                    _this.cache[ wpreq ] = result;
                    return result;
                });
            }
        }*/
    });
}

/**
 * Fetch category from WP and run cb
 *
 * @param cb
 */
function getCategory(cb) {
    this.wp.categories()
        .then(response => cb(null, response))
        .catch(err => cb(err));
}

/**
 * Get hydrated post minus tag
 *
 * "Medium" post are not handled for now
 *
 * @param start
 * @param nb
 * @param categories
 * @param cb
 */
function getKeystonePosts(start, nb, categories, cb) {

    start = parseInt(start, 10);
    nb    = parseInt(nb, 10);

    if (isNaN(start) || isNaN(nb)) {
        return cb(new Error("Invalid pager"));
    }

    const detachedPosts = keystonePosts.slice(start, start+nb)
        .filter(post => post.type !== 'medium')
        .map(function (post) {
            return hydratePost(post, categories);
        });

    if (detachedPosts.length > 0) {
        return cb(null, detachedPosts);
    }

    cb(new Error("No valid post found"));
}

/**
 * @param detachedPosts
 * @param cb
 *
 * @todo doesn't work
 */
function hydrateTags(detachedPosts, cb) {
    const _this = this;
    const detachedPostsRef = detachedPosts;

    detachedPosts.forEach(function(detachedPost) {
        detachedPost.tagsPromises = detachedPost.tags.split(',').map(function (keystoneTag) {
            const tags = _this.wp.tags();
            detachedPost.finalTag = [];
            return tags.create({'name': keystoneTag}, function(err, data){
                    if (err) {
                        detachedPost.finalTag.push(err.response.body.data);
                        return;
                    }

                    detachedPost.tags.push(data);
                });
            });
    });

    const allTagsPromise = detachedPosts.map(function (detachedPostWithTagsPromises) {
        return detachedPostWithTagsPromises.tagsPromises;
    }).reduce(function(prev, curr) {
        return prev.concat(curr);
    });

    Promise.all(allTagsPromise).then(
        function () {

            detachedPostsRef.forEach(function (detachedPost) {
                detachedPost.tags = detachedPost.finalTag.slice(0);
                delete detachedPost.finalTag;
                delete detachedPost.tagsPromises;
            });

            cb(null, detachedPostsRef);
        },
        function (raison) {
            cb(raison);
        }
    );
}

/**
 * @param detachedPosts
 * @param cb
 */
function createPost(detachedPosts, cb) {
    const _this = this;
    const postPromises = detachedPosts.map(function (detachedPost) {
        return _this.wp.posts().create(detachedPost, function(err, data){
            if (err) {
                console.error(err);
                return;
            }
            console.log(data);
        });
    });

    Promise.all(postPromises).then(
        function () {
            cb(null, Array.from(arguments));
        },
        function (raison) {
            cb(raison);
        }
    );
}

/**
 * @param post
 * @param categories
 */
function hydratePost(post, categories) {

    //Hydrated post
    const detachedPost = {
        'date': moment(post.publishedDate.$date).toISOString(),
        'slug': post.slug,
        'status': lib.getStatus(post.state),
        'title': lib.getTitle(post),
        'content': lib.getContent(post),
        'excerpt': post.contentText || "",
        'author': 1,
        'comment_status': 'open',
        'ping_status': 'open',
        'format': lib.getFormat(post.type),
        'sticky': post.pinned,
        'categories': null,
        'tags': post.tags,
        'raw': post
    };

    //Save a ref to images in global scope
    postsImg[detachedPost.slug] = detachedPost.raw.images;

    //Store all image under images
    if (detachedPost.raw.image) {
        postsImg[detachedPost.slug].push(detachedPost.raw.image);
    }

    //Convert keystone category to WP
    detachedPost.categories = post.categories
        .map(category => lib.oIdToCategory(keystoneCategories, category))
        .map(keystoneCategory => lib.keystoneToWp(keystoneCategory, categories))
        .map(wpCategory => wpCategory.id );

    return detachedPost;
}


/*
TypeError: this.transport.post is not a function
at EndpointRequest.WPRequest.create (c:\Users\delta\Documents\Code\ImportOldBlog\node_modules\wpapi\lib\constructors\wp-request.js:751:24)
at c:\Users\delta\Documents\Code\ImportOldBlog\src\modules\importer.js:146:29
at Array.map (native)
at c:\Users\delta\Documents\Code\ImportOldBlog\src\modules\importer.js:144:66
at Array.forEach (native)
at Importer.hydrateTags (c:\Users\delta\Documents\Code\ImportOldBlog\src\modules\importer.js:143:57)
at Importer.run.waterfall (c:\Users\delta\Documents\Code\ImportOldBlog\src\modules\importer.js:38:44)
at nextTask (c:\Users\delta\Documents\Code\ImportOldBlog\node_modules\async\waterfall.js:28:14)
at c:\Users\delta\Documents\Code\ImportOldBlog\node_modules\async\waterfall.js:22:13
at apply (c:\Users\delta\Documents\Code\ImportOldBlog\node_modules\async\node_modules\lodash\_apply.js:15:25)
at c:\Users\delta\Documents\Code\ImportOldBlog\node_modules\async\node_modules\lodash\_overRest.js:32:12
at c:\Users\delta\Documents\Code\ImportOldBlog\node_modules\async\internal\onlyOnce.js:12:16
at getKeystonePosts (c:\Users\delta\Documents\Code\ImportOldBlog\src\modules\importer.js:129:16)
at Importer.run.waterfall (c:\Users\delta\Documents\Code\ImportOldBlog\src\modules\importer.js:37:29)
at nextTask (c:\Users\delta\Documents\Code\ImportOldBlog\node_modules\async\waterfall.js:28:14)
at c:\Users\delta\Documents\Code\ImportOldBlog\node_modules\async\waterfall.js:22:13
    */