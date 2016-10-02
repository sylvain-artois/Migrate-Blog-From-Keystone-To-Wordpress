
const WPAPI     = require('wpapi');
const waterfall = require('async/waterfall');
const moment    = require('moment');
const Promise   = require('promise');
const fs        = require('fs');
const request   = require('request');
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
        createPost.bind(this),
        downloadImage.bind(this),
        createMedia.bind(this),
        linkPostMedia.bind(this)
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
    this.wp = new WPAPI({
        endpoint: url,
        username: username,
        password: password,
        auth: true
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
            }
        });
    });

    Promise.all(postPromises).then(
        function (persistedPost) {
            cb(null, persistedPost);
        },
        function (raison) {
            cb(raison);
        }
    );
}

function downloadImage(persistedPosts, cb) {
    const downloadImagesP = persistedPosts.map(function (persistedPost) {
        if (Array.isArray(postsImg[persistedPost.slug])) {
            return postsImg[persistedPost.slug].map(function (image){
                return new Promise(function (fulfill, reject){
                    request.head(image.url, function(err, res, body){
                        if (err) reject(err);
                        else {
                            var stream = request(image.url);
                            stream.pipe(
                                fs.createWriteStream(image.public_id + "." + image.format)
                                    .on('error', function (err) {
                                        reject(err);
                                        stream.read();
                                    })
                            )
                            .on('close', function () {
                                fulfill();
                            });
                        }
                    });
                });
            });
        }
        return [];
    }).reduce(function(prev, curr) {
        return prev.concat(curr);
    });

    Promise.all(downloadImagesP).then(
        function () {
            cb(null, persistedPosts);
        },
        function (raison) {
            cb(raison);
        }
    );
}

function createMedia(persistedPosts, cb) {
    const _this = this;
    const persistedPostsRef = persistedPosts;
    const persistedMediaP = persistedPosts.map(function (persistedPost){
        return postsImg[persistedPost.slug].map(function (image) {
            return _this.wp.media()
                // Specify a path to the file you want to upload
                .file( image.public_id + "." + image.format )
                .create({title: image.public_id, description: persistedPost.slug}, function(err, data){
                    if (err) {
                        console.error(err);
                        return;
                    }
                });
        });
    }).reduce(function(prev, curr) {
        return prev.concat(curr);
    });

    Promise.all(persistedMediaP).then(
        function (media) {
            cb(null, persistedPostsRef, media);
        },
        function (raison) {
            cb(raison);
        }
    );
}

function linkPostMedia(persistedPosts, media, cb) {
    const _this = this;
    const persistedMediaUpdateP = persistedPosts.map(function (persistedPost){
        return media.filter(medium => medium.description === persistedPost.slug).map(medium => medium.id).map(function(mediumid){
            return _this.wp.media().id( mediumid ).update({post: persistedPost.id}, function(err, data){
                if (err) {
                    console.error(err);
                    return;
                }
            });
        })
    }).reduce(function(prev, curr) {
        return prev.concat(curr);
    });

    Promise.all(persistedMediaUpdateP).then(
        function (media) {
            cb(null);
        },
        function (raison) {
            cb(raison);
        }
    );
}