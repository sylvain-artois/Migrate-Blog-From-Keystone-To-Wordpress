
const WPAPI     = require('wpapi');
const waterfall = require('async/waterfall');
const moment    = require('moment');
const lib       = require('./lib');

import categories   from './import/data/category';
import posts        from './import/data/posts';

module.exports = new Importer();

const keystoneCategories = categories();
const keystonePosts = posts();
const postsImg = [];

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
Importer.prototype.run = function(start, nb) {
    console.log('import start');

    waterfall([
        getCategory,
        (categories, cb) => getKeystonePosts(start, nb, categories, cb),
        (detachedPosts, cb) => hydrateTags.bind(this, detachedPosts, cb),
        createPost
    ], function (err, result) {
        // result now equals 'done'
    })
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
        auth: true,
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
        }
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

    let detachedPosts = keystonePosts.slice(start, start+nb)
        .filter(post => post.type !== 'medium')
        .map(post => hydratePost(post, categories));

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
    detachedPosts.map(function(detachedPost) {
        detachedPost.tags.split(',').map(function (keystoneTag) {
            _this.wp.tags().create({'name': keystoneTag})
                .catch(err => console.error(err))
                .then(function (response) {
                    console.log(response);

                    let tagSet = new Set();

                    for(let i = 0; i < response.length; ++i) {
                        let tagid = response[i];
                        if (! tagSet.has(tagid)) {
                            tagSet.add(tagid);
                        }
                    }

                    detachedPost.tags = Array.from(tagSet);
                });
        });
    });

    cb(null, detachedPosts);
}

function createPost() {

}

/**
 * @param post
 * @param categories
 */
function hydratePost(post, categories) {

    //Hydrated post
    let detachedPost = {
        'date': moment(post.publishedDate.$date).toISOString(),
        'slug': post.slug,
        'status': lib.getStatus(post.state),
        'title': lib.getTitle(post),
        'content': lib.getContent(post),
        'excerpt': post.brief || "",
        'author': 1,
        'comment_status': 'open',
        'ping_status': 'open',
        'format': lib.getFormat(post.type),
        'sticky': post.pinned,
        'categories': null,
        'tags': null,
        'raw': post
    };

    //Save a ref to images in global scope
    postsImg[detachedPost.slug] = detachedPost.raw.images;

    //Store all image under images
    if (detachedPost.raw.image.public_id) {
        postsImg[detachedPost.slug].push(detachedPost.raw.image);
    }

    //Convert keystone category to WP
    detachedPost.categories = post.categories
        .map(category => lib.oIdToCategory.call(null, keystoneCategories, category))
        .map(keystoneCategory => lib.keystoneToWp(keystoneCategory, categories))
        .map(wpCategory => wpCategory.id );

    return detachedPost;
}
