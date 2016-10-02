/* global jQuery WP_API_Settings */

/**
 * Entry point to the Keystone post importer
 */
const moment    = require('moment');
const crypto    = require('crypto-browserify');
const request   = require('request');
const fs        = require('fs');

import find         from 'lodash/collection/find';
import API          from './import/api';
import categories   from './import/data/category';
import posts        from './import/data/posts';

const keystoneCategories = categories();
const keystonePosts = posts();
const wpCategoriesPromise = API.getCategories({});

var decodeEntities = (function() {
    // this prevents any overhead from creating the object each time
    var element = document.createElement('div');

    function decodeHTMLEntities (str) {
        if(str && typeof str === 'string') {
            element.innerHTML = str;
            str = element.textContent;
            element.textContent = '';
        }

        return str;
    }

    return decodeHTMLEntities;
})();

//Avoid running script when normal user
if (parseInt(WP_API_Settings.user, 10) === 1) {

    jQuery.when(wpCategoriesPromise)
        .done(function( wpCategoriesPromiseArgs ) {

            //Get WP categories from REST or localstorage
            //FIXME, localstorage and Ajax doesnt share same params
            let wpCategories = Array.isArray(wpCategoriesPromiseArgs) &&
                wpCategoriesPromiseArgs[0] &&
                "name" in wpCategoriesPromiseArgs[0] ?
                    wpCategoriesPromiseArgs :
                    wpCategoriesPromiseArgs[0];

            //48, Die Antwoord frappe encore, pas inclu
        let postsImg = [];
        let postsToPersistPromise = keystonePosts.slice(49, 50).map(function hydratePost(post, index, array) {

                let deferred = jQuery.Deferred();

                //Transform MongoDB Keystone posts categories in WP category id
                let postCategoriesIds = post.categories.map(function oIdToCategory(category){
                    return find(
                        keystoneCategories,
                        (keystoneCategory) => { return keystoneCategory.$oid === category.$oid }
                    );
                })
                    .map(function keystoneToWp(keystoneCategory) {
                    return find(
                        wpCategories,
                        (wpCategory) => {return wpCategory.slug === keystoneCategory.key;}
                    );
                })
                    .map((wpCategory) => { return wpCategory.id;});

                //Hydrated post
                let postToPersist = {
                    'date': moment(post.publishedDate.$date).toISOString(),
                    'slug': post.slug,
                    'status': setStatus(post.state),
                    'title': setTitle(post),
                    'content': setContent(post),
                    'excerpt': post.brief || "",
                    'author': 1,
                    'comment_status': 'open',
                    'ping_status': 'open',
                    'format': setFormat(post.type),
                    'sticky': post.pinned,
                    'categories': postCategoriesIds,
                    'tags': [],
                    'raw': {
                        images: post.images,
                        credit: post.credit || null
                    }
                };

                postsImg[postToPersist.slug] = postToPersist.raw;
                if (Array.isArray(post.image) && post.image.length > 0) {
                    postsImg[postToPersist.slug].images.push(post.image);
                }

                //From tag string to WP tag id

                let tagSet = new Set();
                let tagsPromises = post.tags.split(',').map(function createTags(keystoneTag){
                    return API.postTag({'name': keystoneTag});
                });

                jQuery.when.apply(jQuery, tagsPromises).done(function handleTagsId() {
                    for(let i = 0; i < arguments.length; ++ i) {
                        let tagid = arguments[i];
                        if (! tagSet.has(tagid)) {
                            tagSet.add(tagid);
                        }
                    }
                    //Convert set to array
                    postToPersist.tags = Array.from(tagSet);
                    deferred.resolve(postToPersist);
                });
                
                //Each post return its promise
                return deferred.promise();
            });

            jQuery.when.apply(jQuery, postsToPersistPromise).done(function(posts){

                let postsPromise = Array.from(arguments).filter(function (post) {
                    return typeof post.title === 'string' && post.title.length > 0;
                }).map(function createPost(post){
                    return API.postPost(post);
                });

                jQuery.when.apply(jQuery, postsPromise).done(function(){
                    
                    console.log('Create media');

                    Array.from(arguments).forEach(function (post) {

                        let imgToPersist    = postsImg[post.slug];
                        let imgPromises     = imgToPersist.images.map(function (image) {

                            let deferred = jQuery.Deferred();

                            var stream = request
                                .get(image.url)
                                .on('error', function(err) {
                                    console.log(err);
                                    deferred.reject(err);
                                })
                                .pipe(fs.createWriteStream(image.public_id + "." + image.format));

                            stream.on('finish', function () {
                                deferred.resolve();
                            });

                            return deferred.promise();
                        });

                        jQuery.when.apply(jQuery, imgPromises).done(function(){
                            console.log('Image created');
                        });
                    });
                });
            });
        });
}

function setFormat(keystonePostType) {
    if (keystonePostType === 'photo') {
        return 'image';
    } else if (keystonePostType === 'text') {
        return 'standard';
    } else if (keystonePostType === 'quote') {
        return 'quote';
    } else if (keystonePostType === 'gallery') {
        return 'gallery';
    } else if (keystonePostType === 'medium') {
        //video or audio ?
    }
}

function setStatus(keystonePostState) {
    if (keystonePostState === 'published') {
        return 'publish';
    } else if (keystonePostState === 'draft') {
        return 'draft';
    } else {
        //error ?
    }
}

function setTitle(post) {
    if (post.type === 'quote') return post.writer;
    if (post.type === 'gallery') return post.captionText;
    return post.title;
}

function setContent(post) {
    if (post.type === 'quote') return decodeEntities(post.quote);
    return decodeEntities(post.title);
}

function getMediaProperty(property, id, postImgs) {
    postImgs.images.push(post.image);
    var rawImg = post.images.find(function (el) {
        return el.slug === id;
    });

    if (rawImg !== undefined) {
        rawImg[property]
    }
    throw new Error('data not found');
}

